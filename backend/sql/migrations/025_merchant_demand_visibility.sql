-- Phase: merchant visibility for active customer demands.
--
-- Problem:
--   demands_select (015) only allows the owning customer or an admin to read a
--   demand. Merchants therefore receive zero rows from Supabase, and the
--   merchant "Available Demands" page renders an empty list. Realtime change
--   events are suppressed for the same reason because Supabase Realtime
--   enforces RLS for authenticated subscribers.
--
-- Fix:
--   Add a permissive SELECT policy so any registered merchant can read demands
--   that are still available for offers. Accepted, Cancelled, Expired,
--   Completed and Rejected demands stay hidden. Mirror the policy on
--   demand_normalized_requirements so the full requirement breakdown is
--   available, and make sure both tables are in the realtime publication.
--
--   Add submit_merchant_demand_offer_v1 so a merchant can place an offer
--   against a single customer demand (not only against a grouped pool). The
--   function mirrors submit_merchant_offer_v1 and is restricted to the
--   backend service role.

BEGIN;

-- Role helper ---------------------------------------------------------------
-- SECURITY DEFINER avoids recursing through the profiles RLS policies, the
-- same pattern used by is_admin() in migration 016.
CREATE OR REPLACE FUNCTION public.is_merchant()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'merchant'
    );
$$;

REVOKE ALL ON FUNCTION public.is_merchant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_merchant() TO authenticated, service_role;

-- Merchant demand visibility ------------------------------------------------
DROP POLICY IF EXISTS demands_merchant_select_active ON public.demands;
CREATE POLICY demands_merchant_select_active ON public.demands
    FOR SELECT
    USING (
        public.is_merchant()
        AND status::text IN (
            'Pending',
            'Submitted',
            'Under Review',
            'Grouped',
            'Bidding Open',
            'Offers Available',
            'Offers Received',
            'Approved'
        )
    );

DROP POLICY IF EXISTS normalized_requirements_merchant_select
    ON public.demand_normalized_requirements;
CREATE POLICY normalized_requirements_merchant_select
    ON public.demand_normalized_requirements
    FOR SELECT
    USING (
        public.is_merchant()
        AND EXISTS (
            SELECT 1
            FROM public.demands AS demand
            WHERE demand.id = demand_normalized_requirements.demand_id
              AND demand.status::text IN (
                  'Pending',
                  'Submitted',
                  'Under Review',
                  'Grouped',
                  'Bidding Open',
                  'Offers Available',
                  'Offers Received',
                  'Approved'
              )
        )
    );

-- Realtime publication ------------------------------------------------------
-- Realtime honours the policies above, so these tables now stream INSERT /
-- UPDATE / DELETE events to authenticated merchants.
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.demands;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.demand_normalized_requirements;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Direct customer-demand offers --------------------------------------------
-- The existing submit_merchant_offer_v1 only accepts a demand group. This
-- function quotes a single demand, validates the same commercial terms, and
-- records the offer against demand_id with group_id NULL.
CREATE INDEX IF NOT EXISTS idx_merchant_offers_demand_merchant
    ON public.merchant_offers(demand_id, merchant_id)
    WHERE group_id IS NULL;

CREATE OR REPLACE FUNCTION public.submit_merchant_demand_offer_v1(
    p_merchant_id UUID, p_demand_id UUID, p_offer_code TEXT, p_terms JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_demand public.demands%ROWTYPE;
    v_offer public.merchant_offers%ROWTYPE;
    v_merchant_name TEXT;
    v_merchant_rating NUMERIC;
    v_price NUMERIC;
    v_moq NUMERIC;
    v_delivery INTEGER;
    v_warranty INTEGER;
    v_currency TEXT;
    v_total NUMERIC;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_demand
    FROM public.demands
    WHERE id = p_demand_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DEMAND_NOT_FOUND';
    END IF;

    IF v_demand.status::text NOT IN (
        'Pending',
        'Submitted',
        'Under Review',
        'Grouped',
        'Bidding Open',
        'Offers Available',
        'Offers Received',
        'Approved'
    ) THEN
        RAISE EXCEPTION 'DEMAND_NOT_ACTIVE';
    END IF;

    SELECT
        COALESCE(NULLIF(btrim(profile.company), ''), NULLIF(btrim(profile.full_name), '')),
        merchant.rating
    INTO v_merchant_name, v_merchant_rating
    FROM public.profiles AS profile
    JOIN public.merchant_profiles AS merchant ON merchant.id = profile.id
    WHERE profile.id = p_merchant_id
      AND profile.role = 'merchant'
      AND lower(COALESCE(merchant.status, '')) NOT IN (
          'suspended', 'rejected', 'blocked', 'disabled', 'inactive'
      )
    FOR SHARE OF profile, merchant;

    IF NOT FOUND OR v_merchant_name IS NULL THEN
        RAISE EXCEPTION 'Merchant is not authorized' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.merchant_offers
        WHERE demand_id = v_demand.id
          AND merchant_id = p_merchant_id
          AND group_id IS NULL
    ) THEN
        RAISE EXCEPTION 'OFFER_DUPLICATE';
    END IF;

    v_currency := v_demand.currency;
    IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
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
    v_total := round(v_price * v_demand.target_quantity, 2);

    IF v_price <= 0 OR v_price >= 10000000000 OR v_moq <= 0
       OR v_demand.target_quantity IS NULL OR v_demand.target_quantity <= 0
       OR v_moq > v_demand.target_quantity
       OR v_delivery NOT BETWEEN 1 AND 90 OR v_warranty NOT BETWEEN 6 AND 120
       OR length(btrim(p_terms->>'spec_notes')) NOT BETWEEN 1 AND 10000
       OR length(btrim(p_terms->>'shipping_terms')) NOT BETWEEN 1 AND 2000
       OR v_total >= 10000000000 THEN
        RAISE EXCEPTION 'OFFER_INVALID_TERMS';
    END IF;

    INSERT INTO public.merchant_offers (
        offer_code, demand_id, group_id, currency, merchant_id, merchant_name, merchant_rating,
        demand_title, unit_price, original_target_price, total_offer_amount, quoted_quantity,
        min_order_quantity, delivery_days, warranty_months, spec_notes, shipping_terms, status
    ) VALUES (
        p_offer_code, v_demand.id, NULL, v_currency, p_merchant_id, v_merchant_name, v_merchant_rating,
        v_demand.title, v_price, COALESCE(v_demand.max_target_unit_price, v_demand.target_price), v_total, v_demand.target_quantity,
        v_moq, v_delivery, v_warranty, btrim(p_terms->>'spec_notes'), btrim(p_terms->>'shipping_terms'), 'Submitted'
    ) RETURNING * INTO v_offer;

    INSERT INTO public.offer_status_history (offer_id, previous_status, new_status, changed_by, remarks)
    VALUES (v_offer.id, NULL, 'Submitted', p_merchant_id, 'Direct demand offer submitted');

    UPDATE public.demands
    SET status = 'Offers Received', updated_at = now()
    WHERE id = v_demand.id
      AND status::text IN ('Pending', 'Submitted', 'Under Review', 'Offers Available', 'Bidding Open');

    RETURN to_jsonb(v_offer);
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_merchant_demand_offer_v1(UUID, UUID, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_merchant_demand_offer_v1(UUID, UUID, TEXT, JSONB)
    TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
