from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "sql"
    / "migrations"
    / "024_demand_embeddings_draft.sql"
)


def test_embedding_migration_is_a_safe_pgvector_draft():
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    assert "draft only" in sql
    assert "does not" in sql
    assert "install, relocate, or upgrade it" in sql
    assert "where extension.extname = 'vector'" in sql
    assert "%1$i.vector(768)" in sql
    assert "existing demand embedding objects require explicit schema review" in sql
    assert "create extension" not in sql
    assert "drop table" not in sql
    assert "dimensions_function.proargtypes[0] = v_vector_type_oid" in sql


def test_embedding_table_matches_writer_persistence_contract():
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    table_start = sql.index("create table public.demand_embeddings")
    table_end = sql.index("$ddl$", table_start)
    table = sql[table_start:table_end]

    assert "demand_id uuid primary key" in table
    assert "embedding %1$i.vector(768) not null" in table
    assert "embedding_model text not null" in table
    assert "embedding_version text not null" in table
    assert "input_hash text not null" in table
    assert "updated_at timestamptz not null default now()" in table
    assert "demand_embeddings_model_version_idx" in sql


def test_search_rpc_matches_python_parameters_and_return_shape():
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    for parameter in (
        "p_query_embedding %1$i.vector(768)",
        "p_exclude_demand_id uuid",
        "p_candidate_limit integer",
        "p_max_cosine_distance double precision",
        "p_embedding_model text",
        "p_embedding_version text",
    ):
        assert parameter in sql
    assert "returns table(demand_id uuid, cosine_distance double precision)" in sql
    assert "vector_dims(p_query_embedding) = 768" in sql
    assert "stored.embedding_model = p_embedding_model" in sql
    assert "stored.embedding_version = p_embedding_version" in sql
    assert "stored.demand_id is distinct from p_exclude_demand_id" in sql
    assert "p_max_cosine_distance between 0 and 2" in sql
    assert "order by stored.embedding operator(%1$i.<=>) p_query_embedding" in sql


def test_embedding_table_and_rpc_are_service_role_only():
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    assert "alter table public.demand_embeddings enable row level security" in sql
    assert "from public, anon, authenticated" in sql
    assert "grant select, insert, update on table public.demand_embeddings to service_role" in sql
    assert "security invoker" in sql
    assert "from public, anon, authenticated, service_role" in sql
    assert "to service_role" in sql
    assert "notify pgrst, 'reload schema'" in sql