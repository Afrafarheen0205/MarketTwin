-- DRAFT ONLY: semantic demand embedding persistence and search.
-- Requires the pgvector extension named "vector" to be installed already.
-- The extension namespace is resolved from pg_extension; this migration does not
-- install, relocate, or upgrade it. It intentionally adds no demand FK because
-- the current application does not define demand-deletion behavior for embeddings.
-- Search is exact cosine distance over model/version-filtered rows. No ANN index
-- is created because the repository does not pin a pgvector version or workload.
-- This is a one-shot migration draft and does not backfill or alter existing data.

BEGIN;

DO $embedding_contract$
DECLARE
    v_vector_schema NAME;
    v_vector_type_oid OID;
BEGIN
    SELECT extension_schema.nspname
      INTO v_vector_schema
    FROM pg_extension AS extension
    JOIN pg_namespace AS extension_schema
      ON extension_schema.oid = extension.extnamespace
    WHERE extension.extname = 'vector';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Demand embeddings require the pgvector extension named vector to be installed first';
    END IF;

    SELECT vector_type.oid
      INTO v_vector_type_oid
    FROM pg_type AS vector_type
    JOIN pg_namespace AS type_schema
      ON type_schema.oid = vector_type.typnamespace
    WHERE type_schema.nspname = v_vector_schema
      AND vector_type.typname = 'vector';

    IF NOT FOUND
       OR NOT EXISTS (
           SELECT 1
           FROM pg_operator AS cosine_operator
           JOIN pg_namespace AS operator_schema
             ON operator_schema.oid = cosine_operator.oprnamespace
           WHERE operator_schema.nspname = v_vector_schema
             AND cosine_operator.oprname = '<=>'
             AND cosine_operator.oprleft = v_vector_type_oid
             AND cosine_operator.oprright = v_vector_type_oid
       )
       OR NOT EXISTS (
           SELECT 1
           FROM pg_proc AS dimensions_function
           JOIN pg_namespace AS function_schema
             ON function_schema.oid = dimensions_function.pronamespace
           WHERE function_schema.nspname = v_vector_schema
             AND dimensions_function.proname = 'vector_dims'
            AND dimensions_function.pronargs = 1
            AND dimensions_function.proargtypes[0] = v_vector_type_oid
       ) THEN
        RAISE EXCEPTION 'Installed vector extension lacks the required type, dimensions function, or cosine operator';
    END IF;

    IF to_regclass('public.demand_embeddings') IS NOT NULL
       OR EXISTS (
           SELECT 1
           FROM pg_proc AS existing_function
           JOIN pg_namespace AS function_schema
             ON function_schema.oid = existing_function.pronamespace
           WHERE function_schema.nspname = 'public'
             AND existing_function.proname = 'search_demand_embedding_candidates_v1'
       ) THEN
        RAISE EXCEPTION 'Existing demand embedding objects require explicit schema review';
    END IF;

    EXECUTE format($ddl$
        CREATE TABLE public.demand_embeddings (
            demand_id UUID PRIMARY KEY,
            embedding %1$I.vector(768) NOT NULL,
            embedding_model TEXT NOT NULL CHECK (embedding_model <> ''),
            embedding_version TEXT NOT NULL CHECK (embedding_version <> ''),
            input_hash TEXT NOT NULL CHECK (input_hash <> ''),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    $ddl$, v_vector_schema);

    EXECUTE format($ddl$
        CREATE FUNCTION public.search_demand_embedding_candidates_v1(
            p_query_embedding %1$I.vector(768),
            p_exclude_demand_id UUID,
            p_candidate_limit INTEGER,
            p_max_cosine_distance DOUBLE PRECISION,
            p_embedding_model TEXT,
            p_embedding_version TEXT
        )
        RETURNS TABLE(demand_id UUID, cosine_distance DOUBLE PRECISION)
        LANGUAGE SQL
        STABLE
        SECURITY INVOKER
        SET search_path = pg_catalog, public
        AS $function$
            SELECT stored.demand_id,
                   (stored.embedding OPERATOR(%1$I.<=>) p_query_embedding)::DOUBLE PRECISION
                       AS cosine_distance
            FROM public.demand_embeddings AS stored
            WHERE p_query_embedding IS NOT NULL
              AND %1$I.vector_dims(p_query_embedding) = 768
              AND p_candidate_limit BETWEEN 1 AND 100
              AND p_max_cosine_distance BETWEEN 0 AND 2
              AND p_embedding_model IS NOT NULL
              AND btrim(p_embedding_model) <> ''
              AND p_embedding_version IS NOT NULL
              AND btrim(p_embedding_version) <> ''
              AND stored.embedding_model = p_embedding_model
              AND stored.embedding_version = p_embedding_version
              AND stored.demand_id IS DISTINCT FROM p_exclude_demand_id
              AND stored.embedding OPERATOR(%1$I.<=>) p_query_embedding
                    <= p_max_cosine_distance
            ORDER BY stored.embedding OPERATOR(%1$I.<=>) p_query_embedding,
                     stored.demand_id
            LIMIT CASE
                WHEN p_candidate_limit BETWEEN 1 AND 100 THEN p_candidate_limit
                ELSE 0
            END
        $function$
    $ddl$, v_vector_schema);
END;
$embedding_contract$;

CREATE INDEX demand_embeddings_model_version_idx
    ON public.demand_embeddings(embedding_model, embedding_version);

ALTER TABLE public.demand_embeddings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.demand_embeddings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.demand_embeddings TO service_role;

DO $embedding_function_permissions$
DECLARE
    v_vector_schema NAME;
BEGIN
    SELECT extension_schema.nspname
      INTO v_vector_schema
    FROM pg_extension AS extension
    JOIN pg_namespace AS extension_schema
      ON extension_schema.oid = extension.extnamespace
    WHERE extension.extname = 'vector';

    EXECUTE format(
        'REVOKE ALL ON FUNCTION public.search_demand_embedding_candidates_v1(%1$I.vector(768), UUID, INTEGER, DOUBLE PRECISION, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role',
        v_vector_schema
    );
    EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.search_demand_embedding_candidates_v1(%1$I.vector(768), UUID, INTEGER, DOUBLE PRECISION, TEXT, TEXT) TO service_role',
        v_vector_schema
    );
END;
$embedding_function_permissions$;

NOTIFY pgrst, 'reload schema';

COMMIT;