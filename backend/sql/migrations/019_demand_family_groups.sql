ALTER TABLE public.demand_groups
    ALTER COLUMN total_quantity TYPE NUMERIC USING total_quantity::NUMERIC;
ALTER TABLE public.demand_group_members
    ALTER COLUMN quantity_committed TYPE NUMERIC USING quantity_committed::NUMERIC;

CREATE OR REPLACE FUNCTION public.demand_product_family_key_v1(p_product_name TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE normalized.family_key
        WHEN 'smart watches' THEN 'smartwatch'
        WHEN 'smartwatches' THEN 'smartwatch'
        ELSE normalized.family_key
    END
    FROM (
        SELECT btrim(regexp_replace(
            regexp_replace(
                regexp_replace(
                    lower(coalesce(p_product_name, '')),
                    '\s+(with|featuring|including|equipped\s+with|having)\s+.*$',
                    '',
                    'i'
                ),
                '\m(black|blue|brown|gold|gray|green|grey|orange|pink|purple|red|silver|white|yellow)\M',
                ' ',
                'gi'
            ),
            '[^a-z0-9]+',
            ' ',
            'g'
        )) AS family_key
    ) AS normalized;
$$;

REVOKE ALL ON FUNCTION public.demand_product_family_key_v1(TEXT)
    FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_customer_demand_with_family_group_v1(
    p_submission_id UUID,
    p_demand JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_demand JSONB;
    v_demand_id UUID;
    v_customer_id UUID;
    v_category TEXT;
    v_family_key TEXT;
    v_group_id UUID;
    v_group_code TEXT;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'This operation requires the backend service role'
            USING ERRCODE = '42501';
    END IF;

    v_demand := public.create_customer_demand_v1(p_submission_id, p_demand);
    v_demand_id := NULLIF(v_demand->>'id', '')::UUID;
    v_customer_id := NULLIF(v_demand->>'customer_id', '')::UUID;
    v_category := NULLIF(btrim(v_demand->>'category'), '');
    v_family_key := NULLIF(
        btrim(p_demand #>> '{normalized_requirements,product_family_key}'),
        ''
    );

    IF v_demand_id IS NULL OR v_customer_id IS NULL OR v_category IS NULL
       OR v_family_key IS NULL THEN
        RAISE EXCEPTION 'Saved demand is missing product-family information'
            USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(lower(v_category) || ':' || v_family_key, 0)
    );

        SELECT demand_group.id INTO v_group_id
        FROM public.demand_groups AS demand_group
        WHERE lower(btrim(demand_group.category)) = lower(v_category)
            AND (
                    demand_group.normalized_product_type = v_family_key
                    OR EXISTS (
                            SELECT 1
                            FROM public.demands AS grouped_demand
                            WHERE grouped_demand.group_id = demand_group.id
                                AND public.demand_product_family_key_v1(grouped_demand.title) = v_family_key
                    )
            )
        ORDER BY CASE WHEN demand_group.normalized_product_type = v_family_key THEN 0 ELSE 1 END,
                         demand_group.created_at,
                         demand_group.id
    LIMIT 1
    FOR UPDATE;

    IF v_group_id IS NULL THEN
        v_group_code := 'GRP-' || upper(replace(gen_random_uuid()::TEXT, '-', ''));
        INSERT INTO public.demand_groups (
            group_code,
            group_reference,
            normalized_product_type,
            product_title,
            category,
            threshold_quantity,
            group_status,
            compatibility_summary
        ) VALUES (
            v_group_code,
            v_group_code,
            v_family_key,
            btrim(v_demand->>'title'),
            v_category,
            1,
            'Proposed',
            jsonb_build_object(
                'basis', 'same product family and category',
                'specifications_are_customer_specific', true
            )
        )
        RETURNING id INTO v_group_id;
    END IF;

    UPDATE public.demands AS demand
    SET group_id = v_group_id
    WHERE demand.group_id IS NULL
      AND demand.status::TEXT IN ('Submitted', 'Under Review')
      AND lower(btrim(demand.category)) = lower(v_category)
      AND public.demand_product_family_key_v1(demand.title) = v_family_key;
    IF NOT EXISTS (
    SELECT 1
    FROM public.demands AS demand
    WHERE demand.id = v_demand_id
      AND demand.customer_id = v_customer_id
      AND demand.group_id = v_group_id
) THEN
    RAISE EXCEPTION
        'Saved demand is not associated with its resolved product group'
        USING ERRCODE = '23514';
END IF;

    INSERT INTO public.demand_group_members (
        group_id,
        customer_id,
        demand_id,
        quantity_committed,
        membership_status
    )
    SELECT v_group_id,
           demand.customer_id,
           (array_agg(demand.id ORDER BY demand.created_at, demand.id))[1],
           sum(demand.target_quantity),
           'active'
    FROM public.demands AS demand
    WHERE demand.group_id = v_group_id
      AND demand.customer_id IS NOT NULL
    GROUP BY demand.customer_id
    ON CONFLICT (group_id, customer_id) DO UPDATE
    SET demand_id = EXCLUDED.demand_id,
        quantity_committed = EXCLUDED.quantity_committed,
        membership_status = 'active',
        removed_at = NULL;

    UPDATE public.demand_groups AS demand_group
    SET participating_demand_count = counts.demand_count,
        participants_count = counts.customer_count,
        total_quantity = counts.requested_quantity,
        total_requested_quantity = counts.requested_quantity,
        compatibility_summary = demand_group.compatibility_summary || jsonb_build_object(
            'participating_demand_count', counts.demand_count,
            'distinct_customer_count', counts.customer_count
        ),
        updated_at = now()
    FROM (
         SELECT count(*)::INTEGER AS demand_count,
             count(DISTINCT customer_id)::INTEGER AS customer_count,
             coalesce(sum(target_quantity), 0) AS requested_quantity
         FROM public.demands
         WHERE group_id = v_group_id
    ) AS counts
    WHERE demand_group.id = v_group_id;

    SELECT to_jsonb(demand) INTO v_demand
    FROM public.demands AS demand
    WHERE demand.id = v_demand_id
      AND demand.customer_id = v_customer_id;

    RETURN v_demand;
END;
$$;

REVOKE ALL ON FUNCTION public.create_customer_demand_with_family_group_v1(UUID, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_demand_with_family_group_v1(UUID, JSONB)
    TO service_role;

NOTIFY pgrst, 'reload schema';