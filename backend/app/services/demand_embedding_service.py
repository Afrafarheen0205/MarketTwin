import hashlib
import json
import logging
import math
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal, Mapping, Optional, Sequence

import httpx

from app.core.config import Settings, get_settings
from app.core.supabase import get_supabase_service_client
from app.services.ai.base import (
    AIProviderInvalidResponse,
    AIProviderTimeout,
    AIProviderUnavailable,
)

logger = logging.getLogger("markettwin.demand_embeddings")

EMBEDDING_DIMENSIONS = 768


class DemandEmbeddingPersistenceError(RuntimeError):
    """The generated demand embedding could not be persisted."""


class DemandEmbeddingSearchError(RuntimeError):
    """A semantic demand candidate search could not be completed safely."""


class DemandEmbeddingReadError(RuntimeError):
    """A stored demand embedding could not be read or validated."""


@dataclass(frozen=True)
class DemandEmbeddingResult:
    embedding: list[float]
    embedding_model: str
    embedding_version: str
    input_hash: str


@dataclass(frozen=True)
class DemandEmbeddingCandidate:
    demand_id: str
    cosine_distance: float
    cosine_similarity: float


@dataclass(frozen=True)
class StoredDemandEmbedding:
    embedding: list[float]
    embedding_model: str
    embedding_version: str
    input_hash: str


def _normalized_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        text = value
    else:
        text = json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    return " ".join(unicodedata.normalize("NFKC", text).split())


def _requirement_entries(value: Any) -> list[tuple[str, str]]:
    if isinstance(value, Mapping):
        source = value.items()
    elif isinstance(value, list):
        source = (
            (item.get("name") or item.get("type") or item.get("key"), item.get("value"))
            for item in value
            if isinstance(item, Mapping)
        )
    else:
        return []

    entries = []
    for name, requirement_value in source:
        normalized_name = _normalized_text(name)
        normalized_value = _normalized_text(requirement_value)
        if normalized_name and normalized_value:
            entries.append((normalized_name, normalized_value))
    return entries


def _collect_requirements(
    demand: Mapping[str, Any],
    normalized: Mapping[str, Any],
    requirement_name: str,
) -> list[tuple[str, str]]:
    entries = [
        *_requirement_entries(demand.get(requirement_name)),
        *_requirement_entries(normalized.get(requirement_name)),
    ]
    if requirement_name == "mandatory_requirements":
        for specification in demand.get("technical_specifications") or []:
            if isinstance(specification, Mapping) and specification.get("mandatory") is True:
                entries.extend(_requirement_entries([specification]))
    elif requirement_name == "optional_preferences":
        for specification in demand.get("technical_specifications") or []:
            if isinstance(specification, Mapping) and specification.get("mandatory") is False:
                entries.extend(_requirement_entries([specification]))

    unique = {(name.casefold(), value.casefold()): (name, value) for name, value in entries}
    return sorted(unique.values(), key=lambda item: (item[0].casefold(), item[1].casefold(), item))


def build_embedding_input(demand: Mapping[str, Any]) -> str:
    normalized = demand.get("normalized_requirements")
    if not isinstance(normalized, Mapping):
        normalized = {}

    product_name = _normalized_text(
        demand.get("product_name")
        or demand.get("title")
        or normalized.get("normalized_product_name")
    )
    product_type = _normalized_text(demand.get("product_type") or normalized.get("product_type"))
    category = _normalized_text(demand.get("category") or normalized.get("normalized_category"))
    description = _normalized_text(demand.get("description"))

    fields = []
    if product_name:
        fields.append(f"Product: {product_name}")
    if product_type and product_type.casefold() != product_name.casefold():
        fields.append(f"Product type: {product_type}")
    if category:
        fields.append(f"Category: {category}")
    if description:
        fields.append(f"Description: {description}")

    for label, key in (
        ("Mandatory requirements", "mandatory_requirements"),
        ("Optional preferences", "optional_preferences"),
    ):
        entries = _collect_requirements(demand, normalized, key)
        if entries:
            fields.append(f"{label}:")
            fields.extend(f"- {name}: {value}" for name, value in entries)

    if not fields:
        raise AIProviderInvalidResponse("Demand has no content to embed.")
    return "\n".join(fields)


def calculate_embedding_input_hash(embedding_input: str, embedding_version: str) -> str:
    if not isinstance(embedding_input, str) or not isinstance(embedding_version, str) or not embedding_version:
        raise ValueError("Embedding input and version are required to calculate a hash.")
    return hashlib.sha256(f"{embedding_version}\0{embedding_input}".encode("utf-8")).hexdigest()


def _validated_embedding(payload: Any) -> list[float]:
    if not isinstance(payload, dict):
        raise AIProviderInvalidResponse("Ollama returned an invalid embedding response.")

    embeddings = payload.get("embeddings")
    if not isinstance(embeddings, list) or len(embeddings) != 1:
        raise AIProviderInvalidResponse("Ollama returned an empty or malformed embedding response.")

    vector = embeddings[0]
    if not isinstance(vector, list) or len(vector) != EMBEDDING_DIMENSIONS:
        raise AIProviderInvalidResponse(
            f"Ollama embedding must contain exactly {EMBEDDING_DIMENSIONS} dimensions."
        )

    result = []
    for value in vector:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise AIProviderInvalidResponse("Ollama embedding contains a non-numeric value.")
        try:
            numeric_value = float(value)
        except (OverflowError, ValueError) as exc:
            raise AIProviderInvalidResponse("Ollama embedding contains an invalid value.") from exc
        if not math.isfinite(numeric_value):
            raise AIProviderInvalidResponse("Ollama embedding contains a non-finite value.")
        result.append(numeric_value)
    return result


class DemandEmbeddingService:
    """Generate and validate demand embeddings with Ollama's embedding API."""

    def __init__(
        self,
        settings: Optional[Settings] = None,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._transport = transport

    async def generate(self, demand: Mapping[str, Any]) -> DemandEmbeddingResult:
        embedding_input = build_embedding_input(demand)
        embedding_version = self._settings.OLLAMA_EMBEDDING_VERSION
        input_hash = calculate_embedding_input_hash(embedding_input, embedding_version)
        timeout = httpx.Timeout(self._settings.OLLAMA_EMBEDDING_TIMEOUT_SECONDS)

        try:
            async with httpx.AsyncClient(
                timeout=timeout,
                transport=self._transport,
            ) as client:
                response = await client.post(
                    f"{self._settings.OLLAMA_EMBEDDING_BASE_URL.rstrip('/')}/api/embed",
                    json={
                        "model": self._settings.OLLAMA_EMBEDDING_MODEL,
                        "input": embedding_input,
                    },
                )
                response.raise_for_status()
        except httpx.TimeoutException as exc:
            logger.warning("Ollama demand embedding request timed out.")
            raise AIProviderTimeout("The embedding provider timed out.") from exc
        except httpx.HTTPStatusError as exc:
            logger.warning("Ollama demand embedding returned HTTP %s.", exc.response.status_code)
            raise AIProviderUnavailable("The embedding provider returned an error.") from exc
        except httpx.RequestError as exc:
            logger.warning(
                "Ollama demand embedding request failed (%s).",
                type(exc).__name__,
            )
            raise AIProviderUnavailable("The embedding provider is unavailable.") from exc

        try:
            payload = response.json()
        except (ValueError, json.JSONDecodeError) as exc:
            logger.warning("Ollama demand embedding returned malformed JSON.")
            raise AIProviderInvalidResponse("The embedding provider returned an invalid response.") from exc

        return DemandEmbeddingResult(
            embedding=_validated_embedding(payload),
            embedding_model=self._settings.OLLAMA_EMBEDDING_MODEL,
            embedding_version=embedding_version,
            input_hash=input_hash,
        )


def get_demand_embedding(
    demand_id: str,
    client: Optional[Any] = None,
) -> Optional[StoredDemandEmbedding]:
    """Read and validate a stored vector using the service-role client only."""
    if not isinstance(demand_id, str) or not demand_id.strip():
        raise DemandEmbeddingReadError("A demand ID is required to read an embedding.")

    try:
        database_client = client if client is not None else get_supabase_service_client()
        if database_client is None:
            raise DemandEmbeddingReadError("Supabase service-role client is not configured.")
        response = (
            database_client.table("demand_embeddings")
            .select("embedding, embedding_model, embedding_version, input_hash")
            .eq("demand_id", demand_id)
            .limit(1)
            .execute()
        )
        rows = response.data
        if rows is None:
            raise DemandEmbeddingReadError("Stored embedding lookup returned an invalid response.")
        if isinstance(rows, Mapping):
            row = rows
        elif isinstance(rows, list):
            if not rows:
                return None
            row = rows[0]
        else:
            raise DemandEmbeddingReadError("Stored embedding lookup returned an invalid response.")
        if not isinstance(row, Mapping):
            raise DemandEmbeddingReadError("Stored embedding row is invalid.")

        vector_value = row.get("embedding")
        if isinstance(vector_value, str):
            try:
                vector_value = json.loads(vector_value)
            except json.JSONDecodeError as exc:
                raise DemandEmbeddingReadError("Stored embedding vector is malformed.") from exc
        try:
            vector = _validated_embedding({"embeddings": [vector_value]})
        except AIProviderInvalidResponse as exc:
            raise DemandEmbeddingReadError("Stored embedding vector is invalid.") from exc

        model = row.get("embedding_model")
        version = row.get("embedding_version")
        input_hash = row.get("input_hash")
        if not all(isinstance(value, str) and value for value in (model, version, input_hash)):
            raise DemandEmbeddingReadError("Stored embedding metadata is invalid.")
        return StoredDemandEmbedding(vector, model, version, input_hash)
    except DemandEmbeddingReadError:
        raise
    except Exception as exc:
        logger.warning("Stored demand embedding read failed (%s).", type(exc).__name__)
        raise DemandEmbeddingReadError("Could not read the stored demand embedding.") from None


def persist_demand_embedding(
    demand_id: str,
    result: DemandEmbeddingResult,
    client: Optional[Any] = None,
) -> Literal["saved", "unchanged"]:
    """Persist an embedding through the configured backend Supabase client."""
    if not isinstance(demand_id, str) or not demand_id.strip():
        raise DemandEmbeddingPersistenceError("A demand ID is required to persist an embedding.")
    if not all(
        isinstance(value, str) and value.strip()
        for value in (result.embedding_model, result.embedding_version, result.input_hash)
    ):
        raise DemandEmbeddingPersistenceError("Embedding metadata is incomplete.")

    try:
        vector = _validated_embedding({"embeddings": [result.embedding]})
    except AIProviderInvalidResponse:
        raise DemandEmbeddingPersistenceError("The embedding vector is invalid.") from None

    try:
        database_client = client if client is not None else get_supabase_service_client()
        if database_client is None:
            raise DemandEmbeddingPersistenceError("Supabase is not configured.")

        table = database_client.table("demand_embeddings")
        existing_result = (
            table.select("embedding_model, embedding_version, input_hash")
            .eq("demand_id", demand_id)
            .execute()
        )
        existing_rows = existing_result.data
        if existing_rows is None:
            raise DemandEmbeddingPersistenceError("Could not verify the stored embedding.")

        existing = existing_rows[0] if existing_rows else None
        if existing and all(
            existing.get(field) == value
            for field, value in (
                ("embedding_model", result.embedding_model),
                ("embedding_version", result.embedding_version),
                ("input_hash", result.input_hash),
            )
        ):
            return "unchanged"

        payload = {
            "demand_id": demand_id,
            "embedding": vector,
            "embedding_model": result.embedding_model,
            "embedding_version": result.embedding_version,
            "input_hash": result.input_hash,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        save_result = database_client.table("demand_embeddings").upsert(
            payload,
            on_conflict="demand_id",
        ).execute()
        if not save_result.data:
            raise DemandEmbeddingPersistenceError("Supabase did not confirm the embedding write.")
        return "saved"
    except DemandEmbeddingPersistenceError:
        raise
    except Exception as exc:
        logger.warning(
            "Demand embedding persistence failed (%s).",
            type(exc).__name__,
        )
        raise DemandEmbeddingPersistenceError("Could not persist the demand embedding.") from None


def search_demand_embedding_candidates(
    query_embedding: Sequence[float],
    embedding_model: str,
    embedding_version: str,
    exclude_demand_id: Optional[str] = None,
    candidate_limit: int = 20,
    max_cosine_distance: float = 0.4,
    client: Optional[Any] = None,
) -> list[DemandEmbeddingCandidate]:
    """Search compatible demand embeddings through the read-only pgvector RPC."""
    if isinstance(query_embedding, (str, bytes)):
        raise AIProviderInvalidResponse("Query embedding must be a numeric vector.")
    try:
        vector = _validated_embedding({"embeddings": [list(query_embedding)]})
    except (TypeError, AIProviderInvalidResponse) as exc:
        raise AIProviderInvalidResponse("Query embedding must contain 768 finite numeric values.") from exc

    if (
        isinstance(candidate_limit, bool)
        or not isinstance(candidate_limit, int)
        or not 1 <= candidate_limit <= 100
    ):
        raise ValueError("Candidate limit must be an integer from 1 to 100.")
    if (
        isinstance(max_cosine_distance, bool)
        or not isinstance(max_cosine_distance, (int, float))
        or not math.isfinite(max_cosine_distance)
        or not 0 <= max_cosine_distance <= 2
    ):
        raise ValueError("Maximum cosine distance must be finite and between 0 and 2.")
    if not all(
        isinstance(value, str) and value.strip()
        for value in (embedding_model, embedding_version)
    ):
        raise ValueError("Embedding model and version are required for candidate search.")
    if exclude_demand_id is not None and (
        not isinstance(exclude_demand_id, str) or not exclude_demand_id.strip()
    ):
        raise ValueError("Excluded demand ID must be a non-empty string when provided.")

    rpc_params = {
        "p_query_embedding": vector,
        "p_exclude_demand_id": exclude_demand_id,
        "p_candidate_limit": candidate_limit,
        "p_max_cosine_distance": float(max_cosine_distance),
        "p_embedding_model": embedding_model,
        "p_embedding_version": embedding_version,
    }

    try:
        database_client = client if client is not None else get_supabase_service_client()
        if database_client is None:
            raise DemandEmbeddingSearchError("Supabase is not configured.")
        response = database_client.rpc(
            "search_demand_embedding_candidates_v1",
            rpc_params,
        ).execute()
        rows = response.data
        if rows is None:
            raise DemandEmbeddingSearchError("Candidate search returned an invalid response.")
    except DemandEmbeddingSearchError:
        raise
    except Exception as exc:
        logger.warning(
            "Demand embedding search failed (%s).",
            type(exc).__name__,
        )
        raise DemandEmbeddingSearchError("Could not search demand embedding candidates.") from None

    if isinstance(rows, dict):
        rows = [rows]
    if not isinstance(rows, list):
        raise DemandEmbeddingSearchError("Candidate search returned an invalid response.")

    candidates = []
    for row in rows:
        if not isinstance(row, Mapping):
            raise DemandEmbeddingSearchError("Candidate search returned an invalid candidate.")
        demand_id = row.get("demand_id")
        distance = row.get("cosine_distance")
        if (
            not isinstance(demand_id, str)
            or not demand_id
            or isinstance(distance, bool)
            or not isinstance(distance, (int, float))
            or not math.isfinite(distance)
            or not 0 <= distance <= 2
        ):
            raise DemandEmbeddingSearchError("Candidate search returned invalid scores.")
        if demand_id == exclude_demand_id or distance > max_cosine_distance:
            continue
        candidates.append(
            DemandEmbeddingCandidate(
                demand_id=demand_id,
                cosine_distance=float(distance),
                cosine_similarity=1.0 - float(distance),
            )
        )

    candidates.sort(key=lambda candidate: (candidate.cosine_distance, candidate.demand_id))
    return candidates[:candidate_limit]