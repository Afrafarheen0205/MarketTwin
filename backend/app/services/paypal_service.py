import base64
import httpx
from app.core.config import get_settings

settings = get_settings()


def _base_url() -> str:
    if settings.PAYPAL_MODE == "live":
        return "https://api-m.paypal.com"
    return "https://api-m.sandbox.paypal.com"


async def get_access_token() -> str:
    if not settings.PAYPAL_CLIENT_ID or not settings.PAYPAL_CLIENT_SECRET:
        raise RuntimeError("PayPal credentials are not configured.")
    auth = base64.b64encode(f"{settings.PAYPAL_CLIENT_ID}:{settings.PAYPAL_CLIENT_SECRET}".encode()).decode()
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{_base_url()}/v1/oauth2/token",
            headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"},
            data={"grant_type": "client_credentials"},
        )
        res.raise_for_status()
        return res.json()["access_token"]


async def create_paypal_order(amount: float, currency: str) -> dict:
    token = await get_access_token()
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{_base_url()}/v2/checkout/orders",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={
                "intent": "CAPTURE",
                "purchase_units": [{"amount": {"currency_code": currency, "value": f"{amount:.2f}"}}],
            },
        )
        res.raise_for_status()
        return res.json()


async def capture_paypal_order(order_id: str) -> dict:
    token = await get_access_token()
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{_base_url()}/v2/checkout/orders/{order_id}/capture",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        res.raise_for_status()
        return res.json()