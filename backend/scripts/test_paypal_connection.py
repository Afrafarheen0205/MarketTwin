import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.services.paypal_service import (
    PayPalConnectionError,
    get_access_token_details,
    paypal_environment,
)


async def main() -> int:
    try:
        environment = paypal_environment()
    except PayPalConnectionError:
        configured_mode = get_settings().PAYPAL_MODE.strip().lower()
        environment = configured_mode if configured_mode in {"sandbox", "live"} else "invalid"
        print(f"PayPal environment: {environment}")
        print("Connection failed")
        print("Safe error: Invalid PayPal mode configuration.")
        return 1

    print(f"PayPal environment: {environment}")
    try:
        token = await get_access_token_details()
    except PayPalConnectionError as exc:
        print("Connection failed")
        print(f"Safe error: {exc}")
        return 1

    print("Connection successful")
    print(f"Token expiry duration: {token.expires_in} seconds")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
