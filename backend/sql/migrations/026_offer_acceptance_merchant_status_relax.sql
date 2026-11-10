-- 026: Relax merchant status check in accept_merchant_offer_v1 (Active/PENDING merchants allowed).
-- Group association is stored in selection.group_id and accepted_terms.group_id.
-- No orders.group_id column is introduced; group association stays in accepted_terms.
BEGIN;

DO $acceptance_schema_preflight$
BEGIN
    IF to_regclass('public.customer_offer_selections') IS NULL
       OR to_regclass('public.orders') IS NULL
       OR to_regclass('public.order_items') IS NULL
       OR to_regclass('public.payments') IS NULL
       OR to_regprocedure('public.resolve_demand_group_id_v1(uuid)') IS NULL
       OR to_regprocedure('public.lock_merchant_offer_group_v1(uuid)') IS NULL THEN
        RAISE EXCEPTION 'Offer acceptance requires migrations 001-021 and their table/function contracts';
    END IF;
    IF EXISTS (
        SELECT required.table_name, required.column_name
        FROM (VALUES
            ('customer_offer_selections', 'customer_id'),
            ('customer_offer_selections', 'demand_id'),
            ('customer_offer_selections', 'group_id'),
            ('orders', 'accepted_offer_id'),
            ('orders', 'selection_id'),
            ('orders', 'quantity'),
            ('orders', 'accepted_terms'),
            ('order_items', 'quantity'),
            ('payments', 'currency'),
            ('merchant_offers', 'currency'),
            ('demands', 'currency'),
            ('demands', 'unit')
        ) AS required(table_name, column_name)
        WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.columns actual
            WHERE actual.table_schema = 'public'
              AND actual.table_name = required.table_name
              AND actual.column_name = required.column_name
        )
    ) THEN
        RAISE EXCEPTION 'Offer acceptance schema contract is incomplete';
    END IF;
END;
$acceptance_schema_preflight$;
DO $acceptance_preflight$
BEGIN
    IF EXISTS (
        SELECT customer_id, demand_id
        FROM public.customer_offer_selections
        GROUP BY customer_id, demand_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate customer/demand selections require manual review';
    END IF;
    IF EXISTS (
        SELECT selection_id FROM public.orders
        WHERE selection_id IS NOT NULL
        GROUP BY selection_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate orders per selection require manual review';
    END IF;
END;
$acceptance_preflight$;

ALTER TABLE public.orders
    ALTER COLUMN quantity TYPE NUMERIC USING quantity::NUMERIC;
ALTER TABLE public.order_items
    ALTER COLUMN quantity TYPE NUMERIC USING quantity::NUMERIC;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_offer_selection_demand
    ON public.customer_offer_selections(customer_id, demand_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_selection
    ON public.orders(selection_id) WHERE selection_id IS NOT NULL;

DO $acceptance_index_contract$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_index AS index_info
        WHERE index_info.indexrelid = to_regclass('public.uq_customer_offer_selection_demand')
          AND index_info.indrelid = 'public.customer_offer_selections'::regclass
          AND index_info.indisunique AND index_info.indisvalid AND index_info.indisready
          AND index_info.indnkeyatts = 2 AND index_info.indnatts = 2
          AND pg_get_indexdef(index_info.indexrelid, 1, TRUE) = 'customer_id'
          AND pg_get_indexdef(index_info.indexrelid, 2, TRUE) = 'demand_id'
          AND index_info.indpred IS NULL
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_index AS index_info
        WHERE index_info.indexrelid = to_regclass('public.uq_orders_selection')
          AND index_info.indrelid = 'public.orders'::regclass
          AND index_info.indisunique AND index_info.indisvalid AND index_info.indisready
          AND index_info.indnkeyatts = 1 AND index_info.indnatts = 1
          AND pg_get_indexdef(index_info.indexrelid, 1, TRUE) = 'selection_id'
          AND regexp_replace(lower(pg_get_expr(index_info.indpred, index_info.indrelid)), '[[:space:]()]', '', 'g')
              = 'selection_idisnotnull'
    ) THEN
        RAISE EXCEPTION 'Existing offer acceptance indexes do not match the required contracts';
    END IF;
END;
$acceptance_index_contract$;

CREATE OR REPLACE FUNCTION public.accept_merchant_offer_v1(
    p_customer_id UUID, p_demand_id UUID, p_offer_id UUID,
    p_terms_accepted BOOLEAN, p_expected_unit_price NUMERIC, p_expected_quantity NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_offer public.merchant_offers%ROWTYPE;
    v_demand public.demands%ROWTYPE;
    v_group public.demand_groups%ROWTYPE;
    v_selection public.customer_offer_selections%ROWTYPE;
    v_order public.orders%ROWTYPE;
    v_group_id UUID;
    v_total NUMERIC;
    v_product JSONB;
    v_delivery JSONB;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
    END IF;
    IF p_terms_accepted IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'OFFER_INVALID_TERMS';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_customer_id AND role = 'customer') THEN
        RAISE EXCEPTION 'Customer is not authorized' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_demand FROM public.demands WHERE id = p_demand_id AND customer_id = p_customer_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Demand is not authorized' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_offer FROM public.merchant_offers WHERE id = p_offer_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Offer is not authorized' USING ERRCODE = '42501';
    END IF;
    v_group_id := COALESCE(v_offer.group_id, v_demand.group_id);
    IF v_group_id IS NOT NULL THEN
        v_group := public.lock_merchant_offer_group_v1(v_group_id);
    END IF;
    SELECT * INTO v_demand FROM public.demands WHERE id = p_demand_id AND customer_id = p_customer_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Demand is not authorized' USING ERRCODE = '42501';
    END IF;
    IF v_demand.group_id IS NOT NULL AND public.resolve_demand_group_id_v1(v_demand.group_id) IS DISTINCT FROM v_group.id THEN
        RAISE EXCEPTION 'Group changed during locking' USING ERRCODE = '40001';
    END IF;
    SELECT * INTO v_selection FROM public.customer_offer_selections
    WHERE customer_id = p_customer_id AND demand_id = p_demand_id;
    IF FOUND THEN
        IF v_selection.offer_id <> p_offer_id THEN
            RAISE EXCEPTION 'OFFER_ALREADY_SELECTED';
        END IF;
        SELECT * INTO v_order FROM public.orders WHERE selection_id = v_selection.id AND customer_id = p_customer_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Legacy selection has no atomic order; manual review required';
        END IF;
        RETURN to_jsonb(v_selection) || jsonb_build_object('order', to_jsonb(v_order));
    END IF;
    IF v_offer.demand_id IS NULL THEN
        PERFORM 1 FROM public.demand_group_members
        WHERE group_id = v_group.id AND customer_id = p_customer_id
          AND membership_status = 'active' AND removed_at IS NULL FOR UPDATE;
        IF NOT FOUND OR v_demand.group_id IS NULL THEN
            RAISE EXCEPTION 'Membership is not authorized' USING ERRCODE = '42501';
        END IF;
    END IF;
    SELECT * INTO v_offer FROM public.merchant_offers WHERE id = p_offer_id FOR UPDATE;
    IF NOT FOUND OR (v_offer.demand_id IS NOT NULL AND v_offer.demand_id <> p_demand_id)
       OR (v_offer.demand_id IS NULL AND (v_offer.group_id IS NULL OR v_offer.group_id IS DISTINCT FROM v_group.id))
       OR (v_offer.group_id IS NOT NULL AND v_offer.group_id IS DISTINCT FROM v_group.id) THEN
        RAISE EXCEPTION 'Offer is not authorized' USING ERRCODE = '42501';
    END IF;
    IF v_demand.currency IS NULL OR v_demand.currency !~ '^[A-Z]{3}$'
       OR v_offer.currency IS DISTINCT FROM v_demand.currency THEN
        RAISE EXCEPTION 'OFFER_CURRENCY_MISMATCH';
    END IF;
    IF v_offer.status NOT IN ('Submitted','Under Review')
       OR (v_group.id IS NOT NULL AND v_group.group_status IS DISTINCT FROM 'Approved') THEN
        RAISE EXCEPTION 'OFFER_NOT_ACTIVE';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles AS profile JOIN public.merchant_profiles AS merchant ON merchant.id = profile.id
        WHERE profile.id = v_offer.merchant_id AND profile.role = 'merchant' AND lower(COALESCE(merchant.status, '')) NOT IN ('suspended', 'rejected', 'blocked', 'disabled', 'inactive')
    ) THEN
        RAISE EXCEPTION 'OFFER_NOT_ACTIVE';
    END IF;
    IF p_expected_unit_price IS DISTINCT FROM v_offer.unit_price THEN
        RAISE EXCEPTION 'OFFER_STALE_PRICE';
    END IF;
    IF p_expected_quantity IS DISTINCT FROM v_demand.target_quantity THEN
        RAISE EXCEPTION 'OFFER_STALE_QUANTITY';
    END IF;
    IF v_demand.target_quantity <= 0 OR v_demand.target_quantity < COALESCE(v_offer.min_order_quantity, 1)
       OR v_offer.unit_price::TEXT IN ('NaN','Infinity','-Infinity') OR v_offer.unit_price <= 0
       OR round(v_offer.unit_price, 2) <> v_offer.unit_price THEN
        RAISE EXCEPTION 'OFFER_INVALID_TERMS';
    END IF;
    v_total := round(v_demand.target_quantity * v_offer.unit_price, 2);
    IF v_total >= 10000000000 THEN
        RAISE EXCEPTION 'OFFER_INVALID_TERMS';
    END IF;
    v_product := jsonb_build_object('product_name', COALESCE(v_offer.demand_title, v_demand.title),
        'spec_notes', v_offer.spec_notes, 'warranty_months', v_offer.warranty_months);
    v_delivery := jsonb_build_object('shipping_terms', v_offer.shipping_terms, 'delivery_days', v_offer.delivery_days);
    INSERT INTO public.customer_offer_selections (
        selection_reference, customer_id, demand_id, group_id, offer_id, merchant_id,
        selected_quantity, selected_unit, agreed_unit_price, currency, estimated_total,
        delivery_terms_snapshot, product_terms_snapshot, compliance_snapshot
    ) VALUES (
        'SEL-' || upper(replace(gen_random_uuid()::TEXT, '-', '')), p_customer_id, p_demand_id, v_group.id, p_offer_id, v_offer.merchant_id,
        v_demand.target_quantity, v_demand.unit, v_offer.unit_price, v_demand.currency, v_total,
        v_delivery, v_product, jsonb_build_object('terms_accepted', TRUE, 'validation_version', 'offer-v1')
    ) RETURNING * INTO v_selection;
    INSERT INTO public.orders (
        order_number, demand_id, demand_code, customer_id, product_name, merchant_id, merchant_name,
        quantity, total_price, status, accepted_offer_id, selection_id, accepted_terms,
        fulfillment_status, payment_status, order_status
    ) VALUES (
        'ORD-' || upper(replace(gen_random_uuid()::TEXT, '-', '')), p_demand_id, v_demand.demand_code,
        p_customer_id, v_product->>'product_name', v_offer.merchant_id, v_offer.merchant_name,
        v_demand.target_quantity, v_total, 'Approved', v_offer.id, v_selection.id,
        jsonb_build_object('group_id', v_group.id, 'offer_id', v_offer.id, 'offer_code', v_offer.offer_code,
            'selection_id', v_selection.id, 'product', v_product, 'delivery', v_delivery,
            'merchant_name', v_offer.merchant_name, 'unit_price', v_offer.unit_price, 'currency', v_demand.currency,
            'quantity', v_demand.target_quantity, 'total_price', v_total, 'quoted_quantity', v_offer.quoted_quantity),
        'Not Started', 'Not Initiated', 'Pending Payment'
    ) RETURNING * INTO v_order;
    INSERT INTO public.order_items (order_id, demand_id, product_name, quantity, unit_price, total_price)
    VALUES (v_order.id, p_demand_id, v_order.product_name, v_order.quantity, v_offer.unit_price, v_total);
    INSERT INTO public.payments (order_id, amount, currency, status, provider)
    VALUES (v_order.id, v_total, v_demand.currency, 'Not Initiated', 'paypal');
    INSERT INTO public.offer_status_history (offer_id, previous_status, new_status, changed_by, remarks)
    VALUES (v_offer.id, v_offer.status, v_offer.status, p_customer_id,
        jsonb_build_object('action', 'customer_selection', 'selection_id', v_selection.id, 'order_id', v_order.id)::TEXT);
    INSERT INTO public.notifications (user_id, title, description, type, action_url)
    VALUES (p_customer_id, 'Order created', 'Your offer was accepted. Payment has not been initiated.', 'order', '/customer/orders');
    RETURN to_jsonb(v_selection) || jsonb_build_object('order', to_jsonb(v_order));
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_offer_order_write_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            IF OLD.selection_id IS NOT NULL OR OLD.accepted_offer_id IS NOT NULL THEN
                RAISE EXCEPTION 'Offer orders require the trusted backend' USING ERRCODE = '42501';
            END IF;
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            IF NEW.selection_id IS NOT NULL OR NEW.accepted_offer_id IS NOT NULL THEN
                RAISE EXCEPTION 'Offer orders require the trusted backend' USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_offer_order_write_v1 ON public.orders;
CREATE TRIGGER guard_offer_order_write_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_offer_order_write_v1();
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.customer_offer_selections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_merchant_offer_v1(UUID, UUID, UUID, BOOLEAN, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_offer_order_write_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_merchant_offer_v1(UUID, UUID, UUID, BOOLEAN, NUMERIC, NUMERIC) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;