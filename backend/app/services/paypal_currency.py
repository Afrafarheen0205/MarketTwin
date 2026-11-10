from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from app.core.config import get_settings

_USD_CENT = Decimal("0.01")
_RATE_SCALE = Decimal("0.00000001")


class PayPalConversionError(ValueError):
    """A safe, user-displayable PayPal currency conversion error."""


@dataclass(frozen=True)
class PayPalConversion:
    original_amount: Decimal
    original_currency: str
    paypal_amount: Decimal
    paypal_currency: str
    exchange_rate: Decimal
    exchange_rate_source: str
    conversion_timestamp: datetime

    def as_dict(self) -> dict[str, str]:
        return {
            "original_amount": f"{self.original_amount:.2f}",
            "original_currency": self.original_currency,
            "paypal_amount": f"{self.paypal_amount:.2f}",
            "paypal_currency": self.paypal_currency,
            "exchange_rate": f"{self.exchange_rate:.8f}",
            "exchange_rate_source": self.exchange_rate_source,
            "conversion_timestamp": self.conversion_timestamp.isoformat(),
        }


def configured_inr_to_usd_rate() -> Decimal:
    raw_rate = get_settings().PAYPAL_INR_TO_USD_TEST_RATE.strip()
    if not raw_rate:
        raise PayPalConversionError(
            "PayPal Sandbox checkout requires an explicit "
            "PAYPAL_INR_TO_USD_TEST_RATE (USD per INR)."
        )
    try:
        rate = Decimal(raw_rate)
    except InvalidOperation as exc:
        raise PayPalConversionError(
            "PAYPAL_INR_TO_USD_TEST_RATE must be a positive decimal (USD per INR)."
        ) from exc
    if not rate.is_finite() or rate <= 0 or rate > Decimal("1000"):
        raise PayPalConversionError(
            "PAYPAL_INR_TO_USD_TEST_RATE must be a positive decimal no greater than 1000."
        )
    rate = rate.quantize(_RATE_SCALE, rounding=ROUND_HALF_UP)
    if rate <= 0:
        raise PayPalConversionError(
            "PAYPAL_INR_TO_USD_TEST_RATE is too small to represent safely."
        )
    return rate


def paypal_exchange_rate(original_currency: str) -> tuple[Decimal, str]:
    currency = original_currency.strip().upper()
    if currency == "INR":
        return configured_inr_to_usd_rate(), "Configured Sandbox test rate"
    if currency == "USD":
        return Decimal("1.00000000"), "Native USD order"
    raise PayPalConversionError(
        f"PayPal Sandbox checkout does not support conversion from {currency or 'unknown currency'}."
    )


def paypal_exchange_rate_for_payment(
    original_currency: str,
    payment: dict | None,
) -> tuple[Decimal, str]:
    if payment and any(
        payment.get(key) is not None
        for key in ("paypal_amount", "paypal_currency", "exchange_rate", "conversion_timestamp")
    ):
        try:
            rate = Decimal(str(payment["exchange_rate"]))
            paypal_amount = Decimal(str(payment["paypal_amount"]))
            paypal_currency = str(payment["paypal_currency"]).upper()
            source = payment["exchange_rate_source"]
        except (InvalidOperation, KeyError, TypeError, ValueError) as exc:
            raise PayPalConversionError(
                "The saved PayPal currency conversion is incomplete and requires review."
            ) from exc
        if (
            not rate.is_finite()
            or rate <= 0
            or not paypal_amount.is_finite()
            or paypal_amount <= 0
            or paypal_currency != "USD"
            or not isinstance(source, str)
            or not source
        ):
            raise PayPalConversionError(
                "The saved PayPal currency conversion is invalid and requires review."
            )
        return rate, source
    return paypal_exchange_rate(original_currency)


def convert_paypal_amount(
    original_amount: Decimal,
    original_currency: str,
    *,
    exchange_rate: Decimal | None = None,
    exchange_rate_source: str | None = None,
) -> PayPalConversion:
    currency = original_currency.strip().upper()
    if not original_amount.is_finite() or original_amount <= 0:
        raise PayPalConversionError("The original order amount must be positive and valid.")
    if exchange_rate is None or exchange_rate_source is None:
        exchange_rate, exchange_rate_source = paypal_exchange_rate(currency)
    if not exchange_rate.is_finite() or exchange_rate <= 0:
        raise PayPalConversionError("The PayPal exchange rate must be positive and valid.")
    rate = exchange_rate.quantize(_RATE_SCALE, rounding=ROUND_HALF_UP)
    if rate <= 0:
        raise PayPalConversionError("The PayPal exchange rate is too small to represent safely.")
    paypal_amount = (original_amount * rate).quantize(_USD_CENT, rounding=ROUND_HALF_UP)
    if not paypal_amount.is_finite() or paypal_amount <= 0:
        raise PayPalConversionError("The converted PayPal amount must be positive and valid.")
    return PayPalConversion(
        original_amount=original_amount.quantize(_USD_CENT, rounding=ROUND_HALF_UP),
        original_currency=currency,
        paypal_amount=paypal_amount,
        paypal_currency="USD",
        exchange_rate=rate,
        exchange_rate_source=exchange_rate_source,
        conversion_timestamp=datetime.now(timezone.utc),
    )


def preview_paypal_conversion(
    original_amount: Decimal,
    original_currency: str,
) -> dict[str, str]:
    rate, source = paypal_exchange_rate(original_currency)
    return convert_paypal_amount(
        original_amount,
        original_currency,
        exchange_rate=rate,
        exchange_rate_source=source,
    ).as_dict()
