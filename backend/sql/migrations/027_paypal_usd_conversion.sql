-- Persist the PayPal Sandbox USD terms without changing the MarketTwin order
-- amount/currency stored in payments.amount and payments.currency.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.orders') IS NULL
       OR to_regclass('public.payments') IS NULL
       OR to_regclass('public.payment_events') IS NULL THEN
        RAISE EXCEPTION 'PayPal currency conversion requires orders, payments, and payment_events';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments'
          AND column_name = 'amount' AND data_type = 'numeric'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments'
          AND column_name = 'currency'
    ) THEN
        RAISE EXCEPTION 'Payments schema does not contain the reviewed original amount and currency columns';
    END IF;
END;
$preflight$;

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS paypal_amount NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS paypal_currency TEXT,
    ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8),
    ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
    ADD COLUMN IF NOT EXISTS conversion_timestamp TIMESTAMPTZ;

DO $constraints$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.payments'::regclass
          AND conname = 'payments_paypal_conversion_complete'
    ) THEN
        ALTER TABLE public.payments
            ADD CONSTRAINT payments_paypal_conversion_complete CHECK (
                (
                    paypal_amount IS NULL
                    AND paypal_currency IS NULL
                    AND exchange_rate IS NULL
                    AND exchange_rate_source IS NULL
                    AND conversion_timestamp IS NULL
                )
                OR
                (
                    paypal_amount IS NOT NULL
                    AND paypal_amount > 0
                    AND paypal_currency IS NOT NULL
                    AND paypal_currency = 'USD'
                    AND exchange_rate IS NOT NULL
                    AND exchange_rate > 0
                    AND exchange_rate_source IS NOT NULL
                    AND btrim(exchange_rate_source) <> ''
                    AND conversion_timestamp IS NOT NULL
                )
            ) NOT VALID;
        ALTER TABLE public.payments
            VALIDATE CONSTRAINT payments_paypal_conversion_complete;
    END IF;
END;
$constraints$;

CREATE OR REPLACE FUNCTION public.begin_paypal_payment_v2(
    p_customer_id UUID,
    p_order_id UUID,
    p_exchange_rate NUMERIC
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
    v_rate NUMERIC(18,8);
    v_paypal_amount NUMERIC(12,2);
    v_rate_source TEXT;
    v_conversion_timestamp TIMESTAMPTZ;
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
        IF v_payment.amount IS DISTINCT FROM v_order.total_price
           OR upper(btrim(v_payment.currency)) IS DISTINCT FROM v_currency THEN
            RAISE EXCEPTION 'Stored original payment terms do not match the order' USING ERRCODE = '22023';
        END IF;
        IF v_payment.paypal_amount IS NOT NULL
           OR v_payment.paypal_currency IS NOT NULL
           OR v_payment.exchange_rate IS NOT NULL
           OR v_payment.exchange_rate_source IS NOT NULL
           OR v_payment.conversion_timestamp IS NOT NULL THEN
            IF v_payment.paypal_amount IS NULL
               OR v_payment.paypal_currency <> 'USD'
               OR v_payment.exchange_rate IS NULL OR v_payment.exchange_rate <= 0
               OR v_payment.exchange_rate_source IS NULL
               OR v_payment.conversion_timestamp IS NULL
               OR v_payment.paypal_amount <> round(v_order.total_price * v_payment.exchange_rate, 2) THEN
                RAISE EXCEPTION 'Saved PayPal conversion is invalid' USING ERRCODE = '22023';
            END IF;
            v_rate := v_payment.exchange_rate;
            v_paypal_amount := v_payment.paypal_amount;
            v_rate_source := v_payment.exchange_rate_source;
            v_conversion_timestamp := v_payment.conversion_timestamp;
        END IF;
    END IF;

    IF v_rate IS NULL THEN
        IF v_currency = 'INR' THEN
            IF p_exchange_rate IS NULL
               OR p_exchange_rate <= 0
               OR p_exchange_rate::TEXT IN ('NaN', 'Infinity', '-Infinity') THEN
                RAISE EXCEPTION 'A positive INR-to-USD exchange rate is required' USING ERRCODE = '22023';
            END IF;
            v_rate := round(p_exchange_rate, 8);
            v_rate_source := 'Configured Sandbox test rate';
        ELSIF v_currency = 'USD' THEN
            v_rate := 1.00000000;
            v_rate_source := 'Native USD order';
        ELSE
            RAISE EXCEPTION 'PayPal Sandbox checkout supports INR-to-USD conversion and native USD orders only' USING ERRCODE = '22023';
        END IF;

        IF v_rate <= 0 THEN
            RAISE EXCEPTION 'Exchange rate is too small to represent safely' USING ERRCODE = '22023';
        END IF;
        v_paypal_amount := round(v_order.total_price * v_rate, 2);
        IF v_paypal_amount <= 0 OR v_paypal_amount > 9999999999.99 THEN
            RAISE EXCEPTION 'Converted PayPal amount is invalid' USING ERRCODE = '22023';
        END IF;
        v_conversion_timestamp := now();
    END IF;

    IF v_payment.id IS NOT NULL THEN
        UPDATE public.payments
        SET provider = 'paypal',
            amount = v_order.total_price,
            currency = v_currency,
            paypal_amount = v_paypal_amount,
            paypal_currency = 'USD',
            exchange_rate = v_rate,
            exchange_rate_source = v_rate_source,
            conversion_timestamp = v_conversion_timestamp,
            status = 'Creating',
            provider_order_id = NULL,
            provider_capture_id = NULL,
            captured_at = NULL,
            updated_at = now()
        WHERE id = v_payment.id
        RETURNING * INTO v_payment;
    ELSE
        INSERT INTO public.payments (
            order_id, provider, amount, currency, paypal_amount, paypal_currency,
            exchange_rate, exchange_rate_source, conversion_timestamp, status
        ) VALUES (
            p_order_id, 'paypal', v_order.total_price, v_currency,
            v_paypal_amount, 'USD', v_rate, v_rate_source, v_conversion_timestamp,
            'Creating'
        ) RETURNING * INTO v_payment;
    END IF;

    UPDATE public.orders SET payment_status = 'Creating', updated_at = now() WHERE id = p_order_id;
    RETURN jsonb_build_object(
        'payment_id', v_payment.id,
        'amount', v_payment.amount,
        'currency', v_payment.currency,
        'paypal_amount', v_payment.paypal_amount,
        'paypal_currency', v_payment.paypal_currency,
        'exchange_rate', v_payment.exchange_rate,
        'exchange_rate_source', v_payment.exchange_rate_source,
        'conversion_timestamp', v_payment.conversion_timestamp,
        'status', v_payment.status
    );
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
       OR p_currency IS DISTINCT FROM 'USD' THEN
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
           AND v_payment.paypal_amount = p_amount
           AND v_payment.paypal_currency = p_currency THEN
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
    IF v_payment.paypal_amount IS NULL
       OR v_payment.paypal_currency IS DISTINCT FROM 'USD'
       OR p_amount <> v_payment.paypal_amount
       OR p_currency <> v_payment.paypal_currency THEN
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
            'original_amount', v_payment.amount,
            'original_currency', v_payment.currency,
            'paypal_amount', p_amount,
            'paypal_currency', p_currency,
            'exchange_rate', v_payment.exchange_rate,
            'exchange_rate_source', v_payment.exchange_rate_source,
            'conversion_timestamp', v_payment.conversion_timestamp
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

REVOKE ALL ON FUNCTION public.begin_paypal_payment_v2(UUID, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_paypal_payment_v2(UUID, UUID, NUMERIC) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
