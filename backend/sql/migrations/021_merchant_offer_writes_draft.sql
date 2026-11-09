-- DRAFT ONLY. Requires reviewed 019b and 020 plus migrations 001-018.
-- No legacy quantity is inferred from today's group totals or rounded money.
BEGIN;

DO $preflight$
BEGIN
    IF to_regprocedure('public.resolve_demand_group_id_v1(uuid)') IS NULL
       OR to_regprocedure('public.resolve_demand_group_family_v1(text,text)') IS NULL
       OR to_regclass('public.uq_merchant_offers_group_merchant') IS NULL
       OR to_regclass('public.offer_status_history') IS NULL
       OR to_regclass('public.customer_offer_selections') IS NULL THEN
        RAISE EXCEPTION 'Merchant offer write prerequisites are missing';
    END IF;
END;
$preflight$;

ALTER TABLE public.merchant_offers
    ADD COLUMN IF NOT EXISTS quoted_quantity NUMERIC,
    ADD COLUMN IF NOT EXISTS currency TEXT;

ALTER TABLE public.merchant_offers
    ALTER COLUMN min_order_quantity TYPE NUMERIC USING min_order_quantity::NUMERIC,
    ALTER COLUMN quoted_quantity TYPE NUMERIC USING quoted_quantity::NUMERIC;

DO $offer_currency_preflight$
BEGIN
    IF EXISTS (
        SELECT demand.group_id
        FROM public.demands AS demand
        JOIN public.merchant_offers AS offer ON offer.group_id = demand.group_id
        JOIN public.demand_groups AS demand_group ON demand_group.id = demand.group_id
        GROUP BY demand.group_id
        HAVING count(DISTINCT demand.currency) <> 1
            OR count(*) FILTER (WHERE demand.currency IS NULL) > 0
            OR bool_or(demand_group.currency IS NOT NULL AND demand_group.currency <> demand.currency)
    ) THEN
        RAISE EXCEPTION 'Grouped offers require one known demand currency per group';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.merchant_offers AS offer
        LEFT JOIN public.demands AS demand ON demand.id = offer.demand_id
        LEFT JOIN public.demand_groups AS demand_group ON demand_group.id = offer.group_id
        WHERE (offer.currency IS NOT NULL AND demand.currency IS NOT NULL
               AND offer.currency <> demand.currency)
           OR (offer.currency IS NOT NULL AND demand_group.currency IS NOT NULL
               AND offer.currency <> demand_group.currency)
           OR (demand.currency IS NOT NULL AND demand_group.currency IS NOT NULL
               AND demand.currency <> demand_group.currency)
    ) THEN
        RAISE EXCEPTION 'Conflicting offer, demand, or group currencies require manual review';
    END IF;
END;
$offer_currency_preflight$;

UPDATE public.merchant_offers AS offer
SET currency = COALESCE(
    offer.currency,
    (SELECT demand.currency FROM public.demands AS demand WHERE demand.id = offer.demand_id),
    (SELECT demand_group.currency FROM public.demand_groups AS demand_group WHERE demand_group.id = offer.group_id),
    (SELECT min(demand.currency) FROM public.demands AS demand WHERE demand.group_id = offer.group_id)
)
WHERE offer.currency IS NULL;

DO $offer_contract$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.merchant_offers
        WHERE (currency IS NOT NULL AND currency !~ '^[A-Z]{3}$')
           OR min_order_quantity IS NOT NULL AND min_order_quantity <= 0
           OR quoted_quantity IS NOT NULL AND quoted_quantity <= 0
    ) THEN
        RAISE EXCEPTION 'Existing offer currency or quantity requires manual review';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.merchant_offers'::regclass
          AND conname = 'merchant_offers_currency_iso_check'
    ) THEN
        ALTER TABLE public.merchant_offers
            ADD CONSTRAINT merchant_offers_currency_iso_check
            CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.merchant_offers'::regclass
          AND conname = 'merchant_offers_quantities_positive_check'
    ) THEN
        ALTER TABLE public.merchant_offers
            ADD CONSTRAINT merchant_offers_quantities_positive_check
            CHECK ((min_order_quantity IS NULL OR min_order_quantity > 0)
               AND (quoted_quantity IS NULL OR quoted_quantity > 0));
    END IF;
END;
$offer_contract$;

CREATE OR REPLACE FUNCTION public.lock_merchant_offer_group_v1(p_group_id UUID)
RETURNS public.demand_groups
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_group public.demand_groups%ROWTYPE;
    v_family RECORD;
    v_locked_family RECORD;
    v_group_id UUID;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
    END IF;
    v_group_id := public.resolve_demand_group_id_v1(p_group_id);
    SELECT * INTO STRICT v_group FROM public.demand_groups WHERE id = v_group_id;
    SELECT * INTO v_family FROM public.resolve_demand_group_family_v1(v_group.product_title, v_group.category);
    IF v_family.product_family_key IS NOT NULL AND v_family.category_key IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(v_family.category_key || ':' || v_family.product_family_key, 0));
    END IF;
    v_group_id := public.resolve_demand_group_id_v1(p_group_id);
    SELECT * INTO STRICT v_group FROM public.demand_groups WHERE id = v_group_id FOR UPDATE;
    SELECT * INTO v_locked_family FROM public.resolve_demand_group_family_v1(v_group.product_title, v_group.category);
    IF v_locked_family.product_family_key IS DISTINCT FROM v_family.product_family_key
       OR v_locked_family.category_key IS DISTINCT FROM v_family.category_key
       OR public.resolve_demand_group_id_v1(p_group_id) IS DISTINCT FROM v_group.id THEN
        RAISE EXCEPTION 'Group changed during locking' USING ERRCODE = '40001';
    END IF;
    RETURN v_group;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_merchant_offer_v1(
    p_merchant_id UUID, p_group_id UUID, p_offer_code TEXT, p_terms JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_group public.demand_groups%ROWTYPE;
    v_offer public.merchant_offers%ROWTYPE;
    v_merchant_name TEXT;
    v_merchant_rating NUMERIC;
    v_price NUMERIC;
    v_moq NUMERIC;
    v_delivery INTEGER;
    v_warranty INTEGER;
    v_currency TEXT;
    v_group_demand_count INTEGER;
    v_group_currency_count INTEGER;
    v_group_currency_nonnull_count INTEGER;
    v_total NUMERIC;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
    END IF;
    v_group := public.lock_merchant_offer_group_v1(p_group_id);
    SELECT COALESCE(NULLIF(btrim(profile.company), ''), NULLIF(btrim(profile.full_name), '')), merchant.rating
    INTO v_merchant_name, v_merchant_rating
    FROM public.profiles AS profile
    JOIN public.merchant_profiles AS merchant ON merchant.id = profile.id
    WHERE profile.id = p_merchant_id AND profile.role = 'merchant' AND merchant.status = 'APPROVED'
    FOR SHARE OF profile, merchant;
    IF NOT FOUND OR v_merchant_name IS NULL THEN
        RAISE EXCEPTION 'Merchant is not authorized' USING ERRCODE = '42501';
    END IF;
    IF v_group.group_status IS DISTINCT FROM 'Approved'
       OR v_group.bidding_status IS DISTINCT FROM 'open'
       OR v_group.bidding_start > now()
       OR v_group.bidding_deadline <= now() THEN
        RAISE EXCEPTION 'OFFER_GROUP_CLOSED';
    END IF;
    IF EXISTS (SELECT 1 FROM public.merchant_offers WHERE group_id = v_group.id AND merchant_id = p_merchant_id) THEN
        RAISE EXCEPTION 'OFFER_DUPLICATE';
    END IF;
    SELECT min(demand.currency), count(*), count(DISTINCT demand.currency), count(demand.currency)
    INTO v_currency, v_group_demand_count, v_group_currency_count, v_group_currency_nonnull_count
    FROM public.demands AS demand
    WHERE demand.group_id = v_group.id;
    IF v_group_demand_count = 0 OR v_group_currency_count <> 1
       OR v_group_currency_nonnull_count <> v_group_demand_count
       OR v_currency IS NULL
       OR (v_group.currency IS NOT NULL AND v_group.currency <> v_currency) THEN
        RAISE EXCEPTION 'OFFER_CURRENCY_MISMATCH';
    END IF;
    IF p_terms IS NULL OR jsonb_typeof(p_terms) <> 'object'
       OR NOT (p_terms ?& ARRAY['unit_price','min_order_quantity','delivery_days','warranty_months','spec_notes','shipping_terms'])
       OR (p_terms - ARRAY['unit_price','min_order_quantity','delivery_days','warranty_months','spec_notes','shipping_terms']) <> '{}'::jsonb
       OR p_offer_code IS NULL OR p_offer_code !~ '^OFF-[0-9A-F]{32}$' THEN
        RAISE EXCEPTION 'OFFER_INVALID_TERMS';
    END IF;
     IF COALESCE(p_terms->>'unit_price', '') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
         OR COALESCE(p_terms->>'min_order_quantity', '') !~ '^[0-9]{1,10}(\.[0-9]+)?$'
       OR COALESCE(p_terms->>'delivery_days', '') !~ '^[0-9]{1,2}$'
       OR COALESCE(p_terms->>'warranty_months', '') !~ '^[0-9]{1,3}$'
       OR jsonb_typeof(p_terms->'spec_notes') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_terms->'shipping_terms') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'OFFER_INVALID_TERMS';
    END IF;
    v_price := (p_terms->>'unit_price')::NUMERIC;
    v_moq := (p_terms->>'min_order_quantity')::NUMERIC;
    v_delivery := (p_terms->>'delivery_days')::INTEGER;
    v_warranty := (p_terms->>'warranty_months')::INTEGER;
    v_total := round(v_price * v_group.total_quantity, 2);
    IF v_price <= 0 OR v_price >= 10000000000 OR v_moq <= 0
       OR v_group.total_quantity <= 0 OR v_moq > v_group.total_quantity
       OR v_delivery NOT BETWEEN 1 AND 90 OR v_warranty NOT BETWEEN 6 AND 120
       OR length(btrim(p_terms->>'spec_notes')) NOT BETWEEN 1 AND 10000
       OR length(btrim(p_terms->>'shipping_terms')) NOT BETWEEN 1 AND 2000
       OR v_total >= 10000000000 THEN
        RAISE EXCEPTION 'OFFER_INVALID_TERMS';
    END IF;
    INSERT INTO public.merchant_offers (
        offer_code, group_id, currency, merchant_id, merchant_name, merchant_rating,
        demand_title, unit_price, total_offer_amount, quoted_quantity,
        min_order_quantity, delivery_days, warranty_months, spec_notes, shipping_terms, status
    ) VALUES (
        p_offer_code, v_group.id, v_currency, p_merchant_id, v_merchant_name, v_merchant_rating,
        v_group.product_title, v_price, v_total, v_group.total_quantity,
        v_moq, v_delivery, v_warranty, btrim(p_terms->>'spec_notes'), btrim(p_terms->>'shipping_terms'), 'Submitted'
    ) RETURNING * INTO v_offer;
    INSERT INTO public.offer_status_history (offer_id, previous_status, new_status, changed_by, remarks)
    VALUES (v_offer.id, NULL, 'Submitted', p_merchant_id, 'Offer submitted');
    RETURN to_jsonb(v_offer);
END;
$function$;

CREATE OR REPLACE FUNCTION public.revise_merchant_offer_v1(
    p_merchant_id UUID, p_offer_id UUID, p_unit_price NUMERIC, p_expected_unit_price NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_offer public.merchant_offers%ROWTYPE;
    v_group public.demand_groups%ROWTYPE;
    v_group_id UUID;
    v_total NUMERIC;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
    END IF;
    SELECT group_id INTO v_group_id FROM public.merchant_offers WHERE id = p_offer_id AND merchant_id = p_merchant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Offer is not authorized' USING ERRCODE = '42501';
    END IF;
    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'OFFER_LEGACY_QUANTITY';
    END IF;
    v_group := public.lock_merchant_offer_group_v1(v_group_id);
    PERFORM 1 FROM public.profiles AS profile
    JOIN public.merchant_profiles AS merchant ON merchant.id = profile.id
    WHERE profile.id = p_merchant_id AND profile.role = 'merchant' AND merchant.status = 'APPROVED'
    FOR SHARE OF profile, merchant;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Merchant is not authorized' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_offer FROM public.merchant_offers WHERE id = p_offer_id AND merchant_id = p_merchant_id FOR UPDATE;
    IF NOT FOUND OR v_offer.group_id IS DISTINCT FROM v_group.id THEN
        RAISE EXCEPTION 'OFFER_NOT_REVISABLE';
    END IF;
    IF v_group.group_status IS DISTINCT FROM 'Approved' OR v_group.bidding_status IS DISTINCT FROM 'open'
       OR v_group.bidding_start > now() OR v_group.bidding_deadline <= now() THEN
        RAISE EXCEPTION 'OFFER_GROUP_CLOSED';
    END IF;
    IF v_offer.status NOT IN ('Submitted', 'Under Review')
       OR EXISTS (SELECT 1 FROM public.customer_offer_selections WHERE offer_id = v_offer.id)
       OR EXISTS (SELECT 1 FROM public.orders WHERE accepted_offer_id = v_offer.id) THEN
        RAISE EXCEPTION 'OFFER_NOT_REVISABLE';
    END IF;
    IF v_offer.quoted_quantity IS NULL THEN
        RAISE EXCEPTION 'OFFER_LEGACY_QUANTITY';
    END IF;
    IF p_expected_unit_price IS DISTINCT FROM v_offer.unit_price THEN
        RAISE EXCEPTION 'OFFER_STALE_PRICE';
    END IF;
    IF p_unit_price IS NULL OR p_unit_price::TEXT IN ('NaN','Infinity','-Infinity')
       OR p_unit_price <= 0 OR p_unit_price >= 10000000000 OR round(p_unit_price, 2) <> p_unit_price THEN
        RAISE EXCEPTION 'OFFER_INVALID_TERMS';
    END IF;
    v_total := round(p_unit_price * v_offer.quoted_quantity, 2);
    IF v_total >= 10000000000 THEN
        RAISE EXCEPTION 'OFFER_INVALID_TERMS';
    END IF;
    IF p_unit_price = v_offer.unit_price THEN
        RETURN to_jsonb(v_offer);
    END IF;
    INSERT INTO public.offer_status_history (offer_id, previous_status, new_status, changed_by, remarks)
    VALUES (v_offer.id, v_offer.status, v_offer.status, p_merchant_id,
        jsonb_build_object('action', 'price_revision', 'previous_unit_price', v_offer.unit_price,
            'unit_price', p_unit_price, 'quoted_quantity', v_offer.quoted_quantity)::TEXT);
    UPDATE public.merchant_offers SET unit_price = p_unit_price, total_offer_amount = v_total
    WHERE id = v_offer.id RETURNING * INTO v_offer;
    RETURN to_jsonb(v_offer);
END;
$function$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.merchant_offers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.offer_status_history FROM PUBLIC, anon, authenticated;
ALTER TABLE public.offer_status_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION public.lock_merchant_offer_group_v1(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_merchant_offer_v1(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revise_merchant_offer_v1(UUID, UUID, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_merchant_offer_group_v1(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_merchant_offer_v1(UUID, UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.revise_merchant_offer_v1(UUID, UUID, NUMERIC, NUMERIC) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;