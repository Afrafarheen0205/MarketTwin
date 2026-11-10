-- Read-only verification for public.create_customer_demand_v2.
-- Every executable statement in this file is SELECT/catalog inspection only.
-- This file is not a migration and does not reload the PostgREST schema cache.
-- Run against the intended Supabase project only after an administrator authorizes it.

-- 1. Function existence, exact argument/result contract, SECURITY DEFINER, and EXECUTE.
WITH candidates AS (
    SELECT
        procedure.oid,
        procedure.proargnames,
        procedure.proargtypes,
        procedure.prorettype,
        procedure.pronargs,
        procedure.prosecdef,
        pg_get_function_arguments(procedure.oid) AS declared_arguments,
        pg_get_function_identity_arguments(procedure.oid) AS identity_arguments
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'create_customer_demand_v2'
), inspected AS (
    SELECT
        candidates.*,
        (
            candidates.pronargs = 2
            AND candidates.proargnames[1] = 'p_submission_id'
            AND candidates.proargnames[2] = 'p_demand'
            AND (
                SELECT array_agg(format_type(argument.type_oid, NULL) ORDER BY argument.ordinality)
                FROM unnest(candidates.proargtypes)
                     WITH ORDINALITY AS argument(type_oid, ordinality)
            ) = ARRAY['uuid', 'jsonb']::TEXT[]
            AND format_type(candidates.prorettype, NULL) = 'jsonb'
        ) AS exact_expected_contract
    FROM candidates
)
SELECT
    count(*) > 0 AS function_exists,
    count(*) FILTER (WHERE exact_expected_contract) > 0 AS exact_expected_contract_exists,
    COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'declared_arguments', declared_arguments,
                'identity_arguments', identity_arguments,
                'return_type', format_type(prorettype, NULL),
                'exact_expected_contract', exact_expected_contract,
                'security_definer', prosecdef,
                'service_role_exists', to_regrole('service_role') IS NOT NULL,
                'service_role_has_execute', CASE
                    WHEN to_regrole('service_role') IS NULL THEN FALSE
                    ELSE has_function_privilege(to_regrole('service_role')::OID, oid, 'EXECUTE')
                END
            ) ORDER BY identity_arguments
        ),
        '[]'::JSONB
    ) AS function_candidates
FROM inspected;

-- 2. Public PostgREST schema exposure, when visible from this SQL session.
-- A NULL/empty setting means SQL cannot establish the API's configured schema list;
-- confirm it in Supabase Dashboard > API > Exposed schemas. This does not inspect cache state.
WITH visible_settings AS (
    SELECT
        NULLIF(current_setting('pgrst.db_schemas', TRUE), '') AS session_schemas,
        (
            SELECT split_part(configuration.setting, '=', 2)
            FROM pg_roles AS role
            CROSS JOIN LATERAL unnest(COALESCE(role.rolconfig, ARRAY[]::TEXT[])) AS configuration(setting)
            WHERE role.rolname = 'authenticator'
              AND configuration.setting LIKE 'pgrst.db_schemas=%'
            LIMIT 1
        ) AS authenticator_role_schemas
), chosen AS (
    SELECT
        session_schemas,
        authenticator_role_schemas,
        COALESCE(session_schemas, authenticator_role_schemas) AS schemas_to_check
    FROM visible_settings
)
SELECT
    session_schemas,
    authenticator_role_schemas,
    schemas_to_check,
    CASE
        WHEN schemas_to_check IS NULL THEN 'UNKNOWN: verify Supabase API Exposed schemas'
        WHEN EXISTS (
            SELECT 1
            FROM unnest(string_to_array(schemas_to_check, ',')) AS schema_name(name)
            WHERE btrim(schema_name.name) = 'public'
        ) THEN 'YES: public is listed in the SQL-visible setting'
        ELSE 'NO: public is not listed in the SQL-visible setting'
    END AS public_schema_exposure_status
FROM chosen;

-- 3. Migration 020 structural contract required by migration 021.
-- These objects prove the schema shape, not how or when it was deployed.
WITH relations AS (
    SELECT
        to_regclass('public.merchant_offers') AS offers_oid,
        to_regclass('public.demand_groups') AS groups_oid
), checks AS (
    SELECT
        EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'merchant_offers'
              AND column_name = 'group_id'
              AND udt_name = 'uuid'
              AND is_nullable = 'YES'
        ) AS nullable_uuid_group_id,
        EXISTS (
            SELECT 1
            FROM pg_constraint AS constraint_info
            CROSS JOIN relations
            WHERE constraint_info.conrelid = relations.offers_oid
              AND constraint_info.contype = 'f'
              AND constraint_info.confrelid = relations.groups_oid
              AND constraint_info.convalidated
              AND constraint_info.confdeltype = 'r'
              AND constraint_info.conkey = ARRAY[
                  (SELECT attribute.attnum
                   FROM pg_attribute AS attribute
                   WHERE attribute.attrelid = relations.offers_oid
                     AND attribute.attname = 'group_id'
                     AND NOT attribute.attisdropped)
              ]::SMALLINT[]
              AND constraint_info.confkey = ARRAY[
                  (SELECT attribute.attnum
                   FROM pg_attribute AS attribute
                   WHERE attribute.attrelid = relations.groups_oid
                     AND attribute.attname = 'id'
                     AND NOT attribute.attisdropped)
              ]::SMALLINT[]
        ) AS group_id_foreign_key_restrict,
        EXISTS (
            SELECT 1
            FROM pg_index AS index_info
            CROSS JOIN relations
            WHERE index_info.indexrelid = to_regclass('public.uq_merchant_offers_group_merchant')
              AND index_info.indrelid = relations.offers_oid
              AND index_info.indisunique
              AND index_info.indisvalid
              AND index_info.indisready
              AND index_info.indnkeyatts = 2
              AND index_info.indnatts = 2
              AND pg_get_indexdef(index_info.indexrelid, 1, TRUE) = 'group_id'
              AND pg_get_indexdef(index_info.indexrelid, 2, TRUE) = 'merchant_id'
              AND regexp_replace(
                  lower(pg_get_expr(index_info.indpred, index_info.indrelid)),
                  '[[:space:]()]', '', 'g'
              ) = 'group_idisnotnullandmerchant_idisnotnull'
        ) AS expected_unique_partial_index
)
SELECT
    nullable_uuid_group_id,
    group_id_foreign_key_restrict,
    expected_unique_partial_index,
    nullable_uuid_group_id
        AND group_id_foreign_key_restrict
        AND expected_unique_partial_index AS migration_020_schema_contract_present
FROM checks;

-- 4. Migration 021 explicit preflight relations and columns, plus its direct prerequisites.
WITH required_relations(object_name) AS (
    VALUES
        ('public.demand_groups'),
        ('public.demand_group_members'),
        ('public.demands'),
        ('public.demand_group_reviews'),
        ('public.customer_offer_selections'),
        ('public.merchant_offers'),
        ('public.orders'),
        ('public.demand_normalized_requirements'),
        ('public.profiles')
), required_columns(table_name, column_name) AS (
    VALUES
        ('demand_groups', 'group_status'),
        ('demand_groups', 'status'),
        ('demand_groups', 'bidding_status'),
        ('demand_groups', 'approved_at'),
        ('demand_groups', 'approved_by'),
        ('demand_groups', 'total_requested_quantity'),
        ('demand_groups', 'participating_demand_count'),
        ('demand_group_members', 'demand_id'),
        ('demand_group_members', 'membership_status'),
        ('demand_group_members', 'removed_at'),
        ('demand_group_members', 'joined_at'),
        ('demand_group_members', 'original_target_price'),
        ('demand_group_members', 'original_budget'),
        ('demands', 'group_id'),
        ('demands', 'target_quantity'),
        ('demands', 'updated_at'),
        ('demand_normalized_requirements', 'updated_at'),
        ('customer_offer_selections', 'group_id'),
        ('customer_offer_selections', 'demand_id'),
        ('merchant_offers', 'demand_id'),
        ('merchant_offers', 'group_id'),
        ('orders', 'demand_id'),
        ('orders', 'selection_id'),
        ('profiles', 'id')
), checks AS (
    SELECT
        'relation'::TEXT AS dependency_type,
        required.object_name AS dependency_name,
        to_regclass(required.object_name) IS NOT NULL AS exists
    FROM required_relations AS required
    UNION ALL
    SELECT
        'column',
        format('public.%I.%I', required.table_name, required.column_name),
        EXISTS (
            SELECT 1
            FROM information_schema.columns AS actual
            WHERE actual.table_schema = 'public'
              AND actual.table_name = required.table_name
              AND actual.column_name = required.column_name
        )
    FROM required_columns AS required
    UNION ALL
    SELECT 'function', 'public.create_customer_demand_v1(uuid,jsonb)',
           to_regprocedure('public.create_customer_demand_v1(uuid,jsonb)') IS NOT NULL
    UNION ALL
    SELECT 'function', 'public.is_admin()',
           to_regprocedure('public.is_admin()') IS NOT NULL
    UNION ALL
    SELECT 'function', 'auth.role()',
           to_regprocedure('auth.role()') IS NOT NULL
    UNION ALL
    SELECT 'type', 'public.demand_status',
           to_regtype('public.demand_status') IS NOT NULL
)
SELECT dependency_type, dependency_name, exists
FROM checks
ORDER BY dependency_type, dependency_name;

-- 5. Supabase CLI migration history, matched by BOTH version and canonical name.
-- This assumes the standard supabase_migrations.schema_migrations table exists.
-- If absent, or if migrations were applied manually, this history cannot establish application state.
WITH expected(version, migration_stem) AS (
    VALUES
        ('020', 'merchant_offers_group_id_draft'),
        ('021', 'semantic_group_reconciliation_draft')
), history AS (
    SELECT version, name
    FROM supabase_migrations.schema_migrations
    WHERE version IN ('020', '021')
)
SELECT
    expected.version,
    expected.migration_stem AS expected_migration_name,
    count(history.version) > 0 AS version_recorded,
    COALESCE(bool_or(
        lower(COALESCE(history.name, '')) = expected.migration_stem
        OR lower(COALESCE(history.name, '')) = expected.version || '_' || expected.migration_stem
        OR regexp_replace(lower(COALESCE(history.name, '')), '^[0-9]+[_-]', '') = expected.migration_stem
    ), FALSE) AS expected_version_and_name_recorded,
    COALESCE(
        string_agg(
            format('%s: %s', history.version, COALESCE(history.name, '<name unavailable>')),
            ', ' ORDER BY history.name
        ),
        '<no history row>'
    ) AS all_history_rows_for_version
FROM expected
LEFT JOIN history
  ON history.version = expected.version
GROUP BY expected.version, expected.migration_stem
ORDER BY expected.version;