from decimal import Decimal

import pytest

from app.core.config import Settings
from app.services import paypal_currency


def _settings(rate: str = ""):
    return Settings(
        _env_file=None,
        PAYPAL_INR_TO_USD_TEST_RATE=rate,
    )


def test_inr_conversion_uses_decimal_rate_and_rounds_to_usd_cents(monkeypatch):
    monkeypatch.setattr(paypal_currency, "get_settings", lambda: _settings("0.01250000"))

    converted = paypal_currency.preview_paypal_conversion(Decimal("79999.00"), "INR")

    assert converted["original_amount"] == "79999.00"
    assert converted["original_currency"] == "INR"
    assert converted["paypal_amount"] == "999.99"
    assert converted["paypal_currency"] == "USD"
    assert converted["exchange_rate"] == "0.01250000"
    assert converted["exchange_rate_source"] == "Configured Sandbox test rate"
    assert converted["conversion_timestamp"]


def test_conversion_uses_half_up_rounding_for_cents():
    converted = paypal_currency.convert_paypal_amount(
        Decimal("1.00"),
        "INR",
        exchange_rate=Decimal("0.005"),
        exchange_rate_source="Configured Sandbox test rate",
    )

    assert converted.paypal_amount == Decimal("0.01")


@pytest.mark.parametrize("rate", ["", "not-a-rate", "0", "-1", "NaN", "Infinity"])
def test_missing_or_invalid_inr_rate_is_rejected(monkeypatch, rate):
    monkeypatch.setattr(paypal_currency, "get_settings", lambda: _settings(rate))

    with pytest.raises(paypal_currency.PayPalConversionError):
        paypal_currency.preview_paypal_conversion(Decimal("79999.00"), "INR")


def test_native_usd_orders_do_not_require_test_exchange_rate(monkeypatch):
    monkeypatch.setattr(paypal_currency, "get_settings", lambda: _settings())

    converted = paypal_currency.preview_paypal_conversion(Decimal("120.00"), "USD")

    assert converted["original_amount"] == "120.00"
    assert converted["paypal_amount"] == "120.00"
    assert converted["exchange_rate"] == "1.00000000"
    assert converted["exchange_rate_source"] == "Native USD order"


def test_retry_reuses_persisted_conversion_rate_without_current_configuration(monkeypatch):
    monkeypatch.setattr(paypal_currency, "get_settings", lambda: _settings())

    rate, source = paypal_currency.paypal_exchange_rate_for_payment(
        "INR",
        {
            "paypal_amount": "1000.00",
            "paypal_currency": "USD",
            "exchange_rate": "0.01250000",
            "exchange_rate_source": "Configured Sandbox test rate",
            "conversion_timestamp": "2026-01-01T00:00:00+00:00",
        },
    )

    assert rate == Decimal("0.01250000")
    assert source == "Configured Sandbox test rate"


def test_conversion_rejects_unsupported_source_currency():
    with pytest.raises(paypal_currency.PayPalConversionError, match="does not support conversion"):
        paypal_currency.convert_paypal_amount(Decimal("10.00"), "EUR")
