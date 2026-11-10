-- PayPal payment persistence compatibility.
-- Safe to apply after reviewing live duplicate checks; does not replace existing rows or RLS.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.orders') IS NULL
       OR to_regclass('public.payments') IS NULL
       OR to_regclass('public.payment_events') IS NULL THEN
        RAISE EXCEPTION 'PayPal payment compatibility requires orders, payments, and payment_events';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
          AND column_name = 'customer_id' AND udt_name = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
          AND column_name = 'total_price' AND data_type = 'numeric'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
          AND column_name = 'accepted_terms' AND data_type = 'jsonb'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
          AND column_name = 'payment_status'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments'
          AND column_name = 'id' AND udt_name = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments'
          AND column_name = 'order_id' AND udt_name = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments'
          AND column_name = 'provider'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments'
          AND column_name = 'amount' AND data_type = 'numeric'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments'
          AND column_name = 'currency'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments'
          AND column_name = 'status'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments'
          AND column_name = 'created_at'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments'
          AND column_name = 'updated_at'
    ) THEN
        RAISE EXCEPTION 'Live order/payment columns do not match the reviewed PayPal migration prerequisites';
    END IF;
END;
$preflight$;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS provider_order_id TEXT,
    ADD COLUMN IF NOT EXISTS provider_capture_id TEXT,
    ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ;

DO $foreign_key_contract$
DECLARE
    v_order_id_attnum SMALLINT;
    v_order_pk_attnum SMALLINT;
BEGIN
    SELECT attnum INTO v_order_id_attnum
    FROM pg_attribute
    WHERE attrelid = 'public.payments'::regclass
      AND attname = 'order_id' AND NOT attisdropped;
    SELECT attnum INTO v_order_pk_attnum
    FROM pg_attribute
    WHERE attrelid = 'public.orders'::regclass
      AND attname = 'id' AND NOT attisdropped;

    IF EXISTS (
        SELECT 1 FROM pg_constraint AS constraint_info
        WHERE constraint_info.conrelid = 'public.payments'::regclass
          AND constraint_info.contype = 'f'
          AND v_order_id_attnum = ANY(constraint_info.conkey)
          AND (
              constraint_info.confrelid <> 'public.orders'::regclass
              OR constraint_info.conkey <> ARRAY[v_order_id_attnum]::SMALLINT[]
              OR constraint_info.confkey <> ARRAY[v_order_pk_attnum]::SMALLINT[]
              OR constraint_info.confdeltype <> 'c'
              OR NOT constraint_info.convalidated
          )
    ) THEN
        RAISE EXCEPTION 'Existing payments.order_id foreign key conflicts with the expected orders relationship';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint AS constraint_info
        WHERE constraint_info.conrelid = 'public.payments'::regclass
          AND constraint_info.contype = 'f'
          AND constraint_info.conkey = ARRAY[v_order_id_attnum]::SMALLINT[]
          AND constraint_info.confrelid = 'public.orders'::regclass
          AND constraint_info.confkey = ARRAY[v_order_pk_attnum]::SMALLINT[]
          AND constraint_info.confdeltype = 'c'
          AND constraint_info.convalidated
    ) THEN
        ALTER TABLE public.payments
            ADD CONSTRAINT payments_order_id_paypal_fkey
            FOREIGN KEY (order_id) REFERENCES public.orders(id)
            ON DELETE CASCADE NOT VALID;
        ALTER TABLE public.payments
            VALIDATE CONSTRAINT payments_order_id_paypal_fkey;
    END IF;
END;
$foreign_key_contract$;

DO $duplicate_preflight$
BEGIN
    IF EXISTS (
        SELECT provider_order_id
        FROM public.payments
        WHERE provider_order_id IS NOT NULL
        GROUP BY provider_order_id
        HAVING count(*) > 1
    ) OR EXISTS (
        SELECT provider_capture_id
        FROM public.payments
        WHERE provider_capture_id IS NOT NULL
        GROUP BY provider_capture_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate PayPal order/capture references require manual review before applying this migration';
    END IF;

    IF EXISTS (
        SELECT order_id
        FROM public.payments
        WHERE lower(provider) = 'paypal'
        GROUP BY order_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Multiple PayPal payment rows per order require manual review before applying this migration';
    END IF;
END;
$duplicate_preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_order_id
    ON public.payments(provider_order_id)
    WHERE provider_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_capture_id
    ON public.payments(provider_capture_id)
    WHERE provider_capture_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_paypal_per_order
    ON public.payments(order_id)
    WHERE lower(provider) = 'paypal';
CREATE INDEX IF NOT EXISTS idx_payments_order_provider
    ON public.payments(order_id, provider);

CREATE OR REPLACE FUNCTION public.begin_paypal_payment_v1(
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
    v_currency TEXT;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id AND customer_id = p_customer_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF v_order.payment_status IS NULL
       OR v_order.payment_status NOT IN ('Not Initiated', 'Failed', 'Cancelled') THEN
        RAISE EXCEPTION 'PAYMENT_NOT_RETRYABLE' USING ERRCODE = 'P0001';
    END IF;
    v_currency := upper(btrim(v_order.accepted_terms->>'currency'));
    IF v_order.total_price IS NULL OR v_order.total_price <= 0
       OR v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'Order amount or currency is invalid' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_payment
    FROM public.payments
    WHERE order_id = p_order_id AND lower(provider) = 'paypal'
    FOR UPDATE;
    IF FOUND THEN
        IF v_payment.status NOT IN ('Not Initiated', 'Pending', 'Failed', 'Cancelled') THEN
            RAISE EXCEPTION 'PAYMENT_NOT_RETRYABLE' USING ERRCODE = 'P0001';
        END IF;
        UPDATE public.payments
        SET provider = 'paypal',
            amount = v_order.total_price,
            currency = v_currency,
            status = 'Creating',
            provider_order_id = NULL,
            provider_capture_id = NULL,
            captured_at = NULL,
            updated_at = now()
        WHERE id = v_payment.id
        RETURNING * INTO v_payment;
    ELSE
        INSERT INTO public.payments (order_id, provider, amount, currency, status)
        VALUES (p_order_id, 'paypal', v_order.total_price, v_currency, 'Creating')
        RETURNING * INTO v_payment;
    END IF;

    UPDATE public.orders SET payment_status = 'Creating', updated_at = now() WHERE id = p_order_id;
    RETURN jsonb_build_object(
        'payment_id', v_payment.id,
        'amount', v_payment.amount,
        'currency', v_payment.currency,
        'status', v_payment.status
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_paypal_order_v1(
    p_customer_id UUID,
    p_order_id UUID,
    p_payment_id UUID,
    p_paypal_order_id TEXT
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
    IF p_paypal_order_id IS NULL OR btrim(p_paypal_order_id) = ''
       OR length(p_paypal_order_id) > 128 THEN
        RAISE EXCEPTION 'PayPal order reference is invalid' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id AND customer_id = p_customer_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_payment FROM public.payments
    WHERE id = p_payment_id AND order_id = p_order_id AND lower(provider) = 'paypal'
    FOR UPDATE;
    IF NOT FOUND OR v_payment.status <> 'Creating'
       OR v_order.payment_status <> 'Creating' THEN
        RAISE EXCEPTION 'PAYMENT_NOT_RETRYABLE' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.payments
    SET provider_order_id = p_paypal_order_id,
        status = 'Created',
        updated_at = now()
    WHERE id = p_payment_id
    RETURNING * INTO v_payment;
    UPDATE public.orders SET payment_status = 'Created', updated_at = now() WHERE id = p_order_id;
    INSERT INTO public.payment_events (
        payment_id, provider_event_id, event_type, event_payload,
        verification_status, processed_at
    ) VALUES (
        v_payment.id, p_paypal_order_id, 'PAYPAL_ORDER_CREATED',
        jsonb_build_object('status', 'CREATED'),
        'verified', now()
    );
    RETURN jsonb_build_object(
        'payment_id', v_payment.id,
        'provider_order_id', v_payment.provider_order_id,
        'status', v_payment.status
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_paypal_payment_v1(
    p_customer_id UUID,
    p_order_id UUID,
    p_payment_id UUID
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
    UPDATE public.payments
    SET status = 'Failed', updated_at = now()
    WHERE id = p_payment_id AND order_id = p_order_id
      AND lower(provider) = 'paypal' AND status = 'Creating'
    RETURNING * INTO v_payment;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYMENT_NOT_RETRYABLE' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.orders SET payment_status = 'Failed', updated_at = now() WHERE id = p_order_id;
    INSERT INTO public.payment_events (
        payment_id, event_type, event_payload, verification_status, processed_at
    ) VALUES (
        v_payment.id, 'PAYPAL_ORDER_CREATION_FAILED',
        jsonb_build_object('status', 'Failed'),
        'verified', now()
    );
    RETURN jsonb_build_object('payment_id', v_payment.id, 'status', v_payment.status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_paypal_capture_v1(
    p_customer_id UUID,
    p_order_id UUID,
    p_paypal_order_id TEXT,
    p_capture_id TEXT,
    p_amount NUMERIC,
    p_currency TEXT
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
    IF p_paypal_order_id IS NULL OR btrim(p_paypal_order_id) = ''
       OR p_capture_id IS NULL OR btrim(p_capture_id) = ''
       OR length(p_capture_id) > 128
       OR p_amount IS NULL OR p_amount <= 0
       OR p_currency IS NULL
       OR p_currency !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'PayPal capture details are invalid' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id AND customer_id = p_customer_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_payment FROM public.payments
    WHERE order_id = p_order_id AND lower(provider) = 'paypal'
      AND provider_order_id = p_paypal_order_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    IF v_payment.status = 'Captured' THEN
        IF v_payment.provider_capture_id = p_capture_id
           AND v_payment.amount = p_amount AND v_payment.currency = p_currency THEN
            RETURN jsonb_build_object(
                'payment_id', v_payment.id,
                'provider_capture_id', v_payment.provider_capture_id,
                'status', v_payment.status
            );
        END IF;
        RAISE EXCEPTION 'PAYMENT_CAPTURE_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF v_payment.status <> 'Capturing' THEN
        RAISE EXCEPTION 'PAYMENT_NOT_RETRYABLE' USING ERRCODE = 'P0001';
    END IF;
    IF p_amount <> v_payment.amount OR p_amount <> v_order.total_price
       OR p_currency <> v_payment.currency
       OR p_currency <> upper(btrim(v_order.accepted_terms->>'currency')) THEN
        RAISE EXCEPTION 'PAYMENT_CAPTURE_MISMATCH' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.payments
    SET provider_capture_id = p_capture_id,
        status = 'Captured',
        captured_at = now(),
        updated_at = now()
    WHERE id = v_payment.id
    RETURNING * INTO v_payment;
    UPDATE public.orders
    SET payment_status = 'Paid',
        order_status = 'Paid',
        updated_at = now()
    WHERE id = p_order_id;
    INSERT INTO public.payment_events (
        payment_id, provider_event_id, event_type, event_payload,
        verification_status, processed_at
    ) VALUES (
        v_payment.id, p_capture_id, 'PAYPAL_CAPTURE_COMPLETED',
        jsonb_build_object(
            'paypal_order_id', p_paypal_order_id,
            'capture_id', p_capture_id,
            'amount', p_amount,
            'currency', p_currency
        ),
        'verified', now()
    );
    RETURN jsonb_build_object(
        'payment_id', v_payment.id,
        'provider_capture_id', v_payment.provider_capture_id,
        'status', v_payment.status
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.begin_paypal_payment_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_paypal_order_v1(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_paypal_payment_v1(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_paypal_capture_v1(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_paypal_payment_v1(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_paypal_order_v1(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_paypal_payment_v1(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_paypal_capture_v1(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
