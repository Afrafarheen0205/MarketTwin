-- Catalogue checkout snapshots, idempotency, and PayPal capture recovery.
-- Apply manually only after reviewing the live schema and confirming migration 025.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.orders') IS NULL
       OR to_regclass('public.payments') IS NULL
       OR to_regclass('public.payment_events') IS NULL THEN
        RAISE EXCEPTION 'Catalogue checkout requires orders, payments, and payment_events';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
          AND column_name = 'customer_id' AND udt_name = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
          AND column_name = 'order_number'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
          AND column_name = 'accepted_terms' AND data_type = 'jsonb'
    ) THEN
        RAISE EXCEPTION 'Live orders schema does not match the reviewed catalogue checkout prerequisites';
    END IF;
END;
$preflight$;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS product_id TEXT,
    ADD COLUMN IF NOT EXISTS product_snapshot JSONB,
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS checkout_idempotency_key UUID,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_checkout_idempotency
    ON public.orders(checkout_idempotency_key)
    WHERE checkout_idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_catalogue_checkout_order_write_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        IF TG_OP = 'DELETE' AND (
            OLD.product_id IS NOT NULL
            OR OLD.checkout_idempotency_key IS NOT NULL
            OR OLD.accepted_terms->>'type' = 'catalogue_purchase'
        ) THEN
            RAISE EXCEPTION 'Catalogue orders require the trusted backend' USING ERRCODE = '42501';
        ELSIF TG_OP = 'INSERT' AND (
            NEW.product_id IS NOT NULL
            OR NEW.checkout_idempotency_key IS NOT NULL
            OR NEW.accepted_terms->>'type' = 'catalogue_purchase'
        ) THEN
            RAISE EXCEPTION 'Catalogue orders require the trusted backend' USING ERRCODE = '42501';
        ELSIF TG_OP = 'UPDATE' AND (
            OLD.product_id IS NOT NULL
            OR NEW.product_id IS NOT NULL
            OR OLD.checkout_idempotency_key IS NOT NULL
            OR NEW.checkout_idempotency_key IS NOT NULL
            OR OLD.accepted_terms->>'type' = 'catalogue_purchase'
            OR NEW.accepted_terms->>'type' = 'catalogue_purchase'
        ) THEN
            RAISE EXCEPTION 'Catalogue orders require the trusted backend' USING ERRCODE = '42501';
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_catalogue_checkout_order_write_v1 ON public.orders;
CREATE TRIGGER guard_catalogue_checkout_order_write_v1
    BEFORE INSERT OR UPDATE OR DELETE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_catalogue_checkout_order_write_v1();

CREATE OR REPLACE FUNCTION public.create_catalogue_order_v1(
    p_customer_id UUID,
    p_idempotency_key UUID,
    p_product_id TEXT,
    p_product_snapshot JSONB,
    p_quantity INTEGER,
    p_unit_price NUMERIC,
    p_currency TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_order public.orders%ROWTYPE;
    v_total NUMERIC(12,2);
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
    END IF;
    IF p_customer_id IS NULL
       OR p_idempotency_key IS NULL
       OR p_product_id IS NULL OR btrim(p_product_id) = ''
       OR p_product_snapshot IS NULL OR jsonb_typeof(p_product_snapshot) <> 'object'
       OR p_quantity IS NULL OR p_quantity < 1
       OR p_unit_price IS NULL OR p_unit_price <= 0
       OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'Catalogue order details are invalid' USING ERRCODE = '22023';
    END IF;
    v_total := round(p_unit_price * p_quantity, 2);
    IF v_total <= 0 OR v_total > 9999999999.99 THEN
        RAISE EXCEPTION 'Catalogue order total is invalid' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::TEXT, 0));
    SELECT * INTO v_order
    FROM public.orders
    WHERE checkout_idempotency_key = p_idempotency_key
    FOR UPDATE;
    IF FOUND THEN
        IF v_order.customer_id IS DISTINCT FROM p_customer_id
           OR v_order.product_id IS DISTINCT FROM p_product_id
           OR v_order.quantity IS DISTINCT FROM p_quantity
           OR v_order.unit_price IS DISTINCT FROM round(p_unit_price, 2)
           OR v_order.total_price IS DISTINCT FROM v_total
           OR upper(btrim(v_order.accepted_terms->>'currency')) IS DISTINCT FROM p_currency THEN
            RAISE EXCEPTION 'CHECKOUT_IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
        END IF;
        RETURN to_jsonb(v_order) || jsonb_build_object(
            'total_amount', v_order.total_price,
            'currency', p_currency,
            'order_reference', v_order.order_number
        );
    END IF;

    INSERT INTO public.orders (
        order_number, customer_id, product_name, quantity, total_price,
        status, payment_status, order_status, product_id, product_snapshot,
        unit_price, checkout_idempotency_key, accepted_terms
    ) VALUES (
        'CAT-' || upper(replace(gen_random_uuid()::TEXT, '-', '')),
        p_customer_id,
        COALESCE(NULLIF(p_product_snapshot->>'name', ''), p_product_id),
        p_quantity,
        v_total,
        'Approved',
        'Not Initiated',
        'Pending Payment',
        p_product_id,
        p_product_snapshot,
        round(p_unit_price, 2),
        p_idempotency_key,
        jsonb_build_object(
            'type', 'catalogue_purchase',
            'currency', p_currency,
            'unit_price', round(p_unit_price, 2),
            'quantity', p_quantity,
            'total_price', v_total,
            'product', p_product_snapshot
        )
    ) RETURNING * INTO v_order;

    RETURN to_jsonb(v_order) || jsonb_build_object(
        'total_amount', v_order.total_price,
        'currency', p_currency,
        'order_reference', v_order.order_number
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_paypal_capture_v1(
    p_customer_id UUID,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_order public.orders%ROWTYPE;
    v_payment public.payments%ROWTYPE;
    v_action TEXT;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id AND customer_id = p_customer_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_payment FROM public.payments
    WHERE order_id = p_order_id AND lower(provider) = 'paypal' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF v_payment.status = 'Captured' THEN
        RETURN jsonb_build_object(
            'status', v_payment.status,
            'provider_capture_id', v_payment.provider_capture_id
        );
    ELSIF v_payment.status = 'Created' THEN
        v_action := 'capture';
    ELSIF v_payment.status = 'Capturing'
          AND v_payment.updated_at <= now() - interval '30 seconds' THEN
        v_action := 'reconcile';
    ELSE
        RAISE EXCEPTION 'PAYMENT_CAPTURE_IN_PROGRESS' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.payments
    SET status = 'Capturing', updated_at = now()
    WHERE id = v_payment.id
    RETURNING * INTO v_payment;
    UPDATE public.orders SET payment_status = 'Capturing' WHERE id = p_order_id;
    RETURN jsonb_build_object(
        'status', v_payment.status,
        'provider_order_id', v_payment.provider_order_id,
        'action', v_action
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_paypal_capture_v1(
    p_customer_id UUID,
    p_order_id UUID,
    p_event_type TEXT,
    p_payment_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_order public.orders%ROWTYPE;
    v_payment public.payments%ROWTYPE;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
    END IF;
    IF p_payment_status NOT IN ('Created', 'Failed', 'Cancelled', 'Verification Failed')
       OR p_event_type IS NULL OR length(p_event_type) > 80 THEN
        RAISE EXCEPTION 'Capture release details are invalid' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id AND customer_id = p_customer_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_payment FROM public.payments
    WHERE order_id = p_order_id AND lower(provider) = 'paypal' FOR UPDATE;
    IF NOT FOUND OR v_payment.status <> 'Capturing' THEN
        RAISE EXCEPTION 'PAYMENT_NOT_RETRYABLE' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.payments SET status = p_payment_status, updated_at = now()
    WHERE id = v_payment.id RETURNING * INTO v_payment;
    UPDATE public.orders SET payment_status = p_payment_status WHERE id = p_order_id;
    INSERT INTO public.payment_events (
        payment_id, provider_event_id, event_type, event_payload,
        verification_status, processed_at
    ) VALUES (
        v_payment.id, v_payment.provider_order_id, p_event_type,
        jsonb_build_object('status', p_payment_status),
        'verified', now()
    );
    RETURN jsonb_build_object('status', v_payment.status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_paypal_payment_v1(
    p_customer_id UUID,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_order public.orders%ROWTYPE;
    v_payment public.payments%ROWTYPE;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id AND customer_id = p_customer_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_payment FROM public.payments
    WHERE order_id = p_order_id AND lower(provider) = 'paypal' FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', v_order.payment_status);
    END IF;
    IF v_payment.status = 'Cancelled' THEN
        RETURN jsonb_build_object('status', v_payment.status);
    END IF;
    IF v_payment.status <> 'Created' THEN
        RAISE EXCEPTION 'PAYMENT_NOT_RETRYABLE' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.payments SET status = 'Cancelled', updated_at = now()
    WHERE id = v_payment.id RETURNING * INTO v_payment;
    UPDATE public.orders SET payment_status = 'Cancelled' WHERE id = p_order_id;
    INSERT INTO public.payment_events (
        payment_id, provider_event_id, event_type, event_payload,
        verification_status, processed_at
    ) VALUES (
        v_payment.id, v_payment.provider_order_id, 'PAYPAL_CUSTOMER_CANCELLED',
        jsonb_build_object('status', 'Cancelled'), 'verified', now()
    );
    RETURN jsonb_build_object('status', v_payment.status);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_catalogue_order_v1(UUID, UUID, TEXT, JSONB, INTEGER, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_catalogue_checkout_order_write_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_paypal_capture_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_paypal_capture_v1(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_paypal_payment_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_catalogue_order_v1(UUID, UUID, TEXT, JSONB, INTEGER, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_paypal_capture_v1(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_paypal_capture_v1(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_paypal_payment_v1(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
