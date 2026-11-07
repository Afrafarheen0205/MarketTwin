import asyncio
import json
import logging
import math
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.core.config import Settings, get_settings

logger = logging.getLogger("markettwin.buyora_catalogue")

_MAX_RESPONSE_BYTES = 12 * 1024 * 1024
_CONNECT_TIMEOUT_SECONDS = 5.0
_RETRYABLE_STATUS_CODES = {500, 502, 503, 504}
_RETRY_BACKOFF_SECONDS = 0.25


class CatalogueUnavailable(Exception):
    """The configured external catalogue could not provide a valid response."""


class CatalogueTimeout(CatalogueUnavailable):
    """The external catalogue did not respond before the configured timeout."""


class CatalogueProduct(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    product_id: str = Field(alias="productId", min_length=1)
    name: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    discount_price: Optional[float] = Field(default=None, alias="discountPrice")
    currency: Optional[str] = None
    images: list[str] = Field(default_factory=list)
    specifications: dict[str, Any] = Field(default_factory=dict)
    stock: Optional[int] = None
    delivery_days: Optional[float] = Field(default=None, alias="deliveryDays")
    rating: Optional[float] = None
    reviews: Optional[int] = None
    featured: Optional[bool] = None
    best_seller: Optional[bool] = Field(default=None, alias="bestSeller")
    category_tag: Optional[str] = Field(default=None, alias="categoryTag")

    @field_validator("product_id", mode="before")
    @classmethod
    def preserve_nonempty_product_id(cls, value: Any) -> str:
        if value is None or not str(value).strip():
            raise ValueError("A catalogue product ID is required.")
        return str(value)

    @field_validator("price", "discount_price", "delivery_days", mode="before")
    @classmethod
    def normalize_nonnegative_number(cls, value: Any) -> Optional[float]:
        if value is None or isinstance(value, bool):
            return None
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(number) or number < 0:
            return None
        return number

    @field_validator("stock", "reviews", mode="before")
    @classmethod
    def normalize_nonnegative_integer(cls, value: Any) -> Optional[int]:
        if value is None or isinstance(value, bool):
            return None
        try:
            number = int(value)
        except (TypeError, ValueError):
            return None
        if number < 0 or str(value).strip() not in {str(number), f"{number}.0"}:
            return None
        return number

    @field_validator("rating", mode="before")
    @classmethod
    def normalize_rating_scale(cls, value: Any) -> Optional[float]:
        if value is None or isinstance(value, bool):
            return None
        try:
            rating = float(value)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(rating) or rating < 0 or rating > 100:
            return None
        if rating <= 5:
            return rating
        return rating / 20 if rating > 10 else None

    @field_validator("images", mode="before")
    @classmethod
    def normalize_images(cls, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [item for item in value if isinstance(item, str) and item.strip()]

    @field_validator("specifications", mode="before")
    @classmethod
    def normalize_specifications(cls, value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return {}
            return parsed if isinstance(parsed, dict) else {}
        return {}


class CatalogueSnapshot(BaseModel):
    products: list[CatalogueProduct]
    products_returned: int
    total_reported: Optional[int] = None
    pagination_supported: bool = False


class BuyoraCatalogueService:
    """Fetch and validate products from the configured Buyora API."""

    def __init__(
        self,
        settings: Optional[Settings] = None,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._transport = transport

    async def fetch_products(self) -> CatalogueSnapshot:
        url = self._settings.BUYORA_CATALOGUE_API_URL.strip().rstrip("/")
        parsed_url = urlparse(url)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            raise CatalogueUnavailable("The product catalogue endpoint is not configured correctly.")

        timeout = httpx.Timeout(
            self._settings.CATALOGUE_API_TIMEOUT_SECONDS,
            connect=_CONNECT_TIMEOUT_SECONDS,
        )
        if _diagnostics_enabled(self._settings):
            logger.info("Fetching Buyora catalogue from %s.", _safe_url(url))
        try:
            async with httpx.AsyncClient(
                timeout=timeout,
                transport=self._transport,
                follow_redirects=True,
            ) as client:
                products_payload, metadata = await asyncio.wait_for(
                    self._fetch_all_pages(client, url),
                    timeout=self._settings.CATALOGUE_API_TOTAL_TIMEOUT_SECONDS,
                )
        except asyncio.TimeoutError as exc:
            logger.warning("The Buyora catalogue exceeded its total request time budget.")
            raise CatalogueTimeout(
                "The product catalogue request exceeded its time budget."
            ) from exc
        except httpx.TimeoutException as exc:
            logger.warning("The Buyora catalogue request timed out.")
            raise CatalogueTimeout("The product catalogue request timed out.") from exc
        except httpx.RequestError as exc:
            logger.warning("The Buyora catalogue request failed.")
            raise CatalogueUnavailable("The product catalogue is unavailable.") from exc

        valid_products: list[CatalogueProduct] = []
        for index, record in enumerate(products_payload):
            if not isinstance(record, dict):
                logger.warning("Skipping invalid catalogue product record at index %s.", index)
                continue
            try:
                valid_products.append(CatalogueProduct.model_validate(record))
            except ValidationError:
                logger.warning("Skipping invalid catalogue product record at index %s.", index)

        unique_products: dict[str, CatalogueProduct] = {}
        for product in valid_products:
            unique_products.setdefault(product.product_id, product)
        if _diagnostics_enabled(self._settings):
            wanted_ids = {f"LAPTOP-{number}" for number in range(101, 111)}
            found_ids = sorted(wanted_ids.intersection(unique_products))
            logger.info(
                "Buyora catalogue retrieval complete: %s unique products; seeded laptop IDs found: %s.",
                len(unique_products),
                ", ".join(found_ids) if found_ids else "none",
            )

        return CatalogueSnapshot(
            products=list(unique_products.values()),
            products_returned=len(unique_products),
            total_reported=metadata.get("total"),
            pagination_supported=metadata.get("pagination_supported", False),
        )

    async def _fetch_all_pages(
        self,
        client: httpx.AsyncClient,
        url: str,
    ) -> tuple[list[Any], dict[str, Any]]:
        payload = await self._get_json(client, url, params=None)
        if not isinstance(payload, dict) or not isinstance(payload.get("products"), list):
            raise CatalogueUnavailable("The product catalogue returned an invalid response.")
        if payload.get("success") is False:
            raise CatalogueUnavailable("The product catalogue could not return products.")

        records = list(payload["products"])
        if _diagnostics_enabled(self._settings):
            logger.info("Buyora catalogue page 1 returned %s records.", len(records))
        metadata = _pagination_metadata(payload)
        if metadata["pagination_supported"]:
            for page in range(2, metadata["pages"] + 1):
                page_payload = await self._get_json(
                    client,
                    url,
                    params={metadata["page_parameter"]: page},
                )
                if not isinstance(page_payload, dict) or not isinstance(
                    page_payload.get("products"), list
                ):
                    raise CatalogueUnavailable("The product catalogue returned an invalid page.")
                if page_payload.get("success") is False:
                    raise CatalogueUnavailable("The product catalogue could not return a page.")
                if _diagnostics_enabled(self._settings):
                    logger.info(
                        "Buyora catalogue page %s returned %s records.",
                        page,
                        len(page_payload["products"]),
                    )
                records.extend(page_payload["products"])

        return records, metadata

    async def _get_json(
        self,
        client: httpx.AsyncClient,
        url: str,
        params: Optional[dict[str, int]],
    ) -> Any:
        retries = self._settings.CATALOGUE_API_MAX_RETRIES
        for attempt in range(retries + 1):
            try:
                async with client.stream(
                    "GET",
                    url,
                    params=params,
                    headers={"Cache-Control": "no-cache", "Pragma": "no-cache"},
                ) as response:
                    if response.status_code in _RETRYABLE_STATUS_CODES:
                        if attempt >= retries and response.status_code == 504:
                            raise CatalogueTimeout(
                                "The product catalogue gateway timed out."
                            )
                        if attempt >= retries:
                            logger.warning(
                                "The Buyora catalogue returned HTTP %s after retries.",
                                response.status_code,
                            )
                            raise CatalogueUnavailable(
                                "The product catalogue returned a transient server error."
                            )
                        logger.warning(
                            "Buyora returned transient HTTP %s; retrying request (%s/%s).",
                            response.status_code,
                            attempt + 1,
                            retries,
                        )
                    elif response.is_error:
                        logger.warning(
                            "The Buyora catalogue returned HTTP %s.",
                            response.status_code,
                        )
                        raise CatalogueUnavailable(
                            "The product catalogue returned an error."
                        )
                    else:
                        body = bytearray()
                        async for chunk in response.aiter_bytes():
                            body.extend(chunk)
                            if len(body) > _MAX_RESPONSE_BYTES:
                                raise CatalogueUnavailable(
                                    "The product catalogue response was too large."
                                )
                        try:
                            return json.loads(body)
                        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                            raise CatalogueUnavailable(
                                "The product catalogue returned invalid JSON."
                            ) from exc
            except httpx.TimeoutException:
                if attempt >= retries:
                    raise
                logger.warning(
                    "Buyora catalogue request timed out; retrying (%s/%s).",
                    attempt + 1,
                    retries,
                )
            except httpx.RequestError:
                if attempt >= retries:
                    raise
                logger.warning(
                    "Buyora catalogue request failed transiently; retrying (%s/%s).",
                    attempt + 1,
                    retries,
                )
            if attempt < retries:
                await asyncio.sleep(_RETRY_BACKOFF_SECONDS * (2**attempt))

        raise CatalogueUnavailable("The product catalogue request could not be completed.")


def _pagination_metadata(payload: dict[str, Any]) -> dict[str, Any]:
    pagination = payload.get("pagination")
    if isinstance(pagination, dict):
        pages = _positive_int(
            pagination.get("totalPages", pagination.get("total_pages", pagination.get("pages")))
        )
        if pages and pages > 1:
            total = _nonnegative_int(pagination.get("total", payload.get("count")))
            page_parameter = (
                "page"
                if "page" in pagination or "currentPage" in pagination or "current_page" in pagination
                else "page"
            )
            return {
                "pagination_supported": True,
                "pages": pages,
                "page_parameter": page_parameter,
                "total": total,
            }

    pages = _positive_int(payload.get("totalPages", payload.get("total_pages")))
    if pages and pages > 1:
        return {
            "pagination_supported": True,
            "pages": pages,
            "page_parameter": "page",
            "total": _nonnegative_int(payload.get("count", payload.get("total"))),
        }

    return {
        "pagination_supported": False,
        "pages": 1,
        "page_parameter": "page",
        "total": _nonnegative_int(payload.get("count", payload.get("total"))),
    }


def _safe_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if parsed.port:
        host = f"{host}:{parsed.port}"
    return parsed._replace(netloc=host, query="", fragment="").geturl()


def _diagnostics_enabled(settings: Settings) -> bool:
    return settings.DEBUG and settings.ENVIRONMENT.casefold() in {
        "development",
        "dev",
        "local",
        "test",
    }


def _positive_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _nonnegative_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None
