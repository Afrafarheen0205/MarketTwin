import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Optional


_NUMBER = r"(?:\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?!\d|,\d)"
_AMOUNT = rf"(?P<symbol>₹|Rs\.?|INR|USD|EUR|GBP|CAD|AUD|JPY|CNY|CHF|SGD|NZD|[$€£¥])?\s*(?P<number>{_NUMBER})\s*(?P<scale>k|thousand|lakh|lakhs|lac|lacs|million|mn|crore|crores)?\s*(?P<code>INR|USD|EUR|GBP|CAD|AUD|JPY|CNY|CHF|SGD|NZD|rupees?|dollars?|euros?|pounds?)?"
_AMOUNT_RE = re.compile(_AMOUNT, re.IGNORECASE)
_AMOUNT_RAW = rf"(?:₹|Rs\.?|INR|USD|EUR|GBP|CAD|AUD|JPY|CNY|CHF|SGD|NZD|[$€£¥])?\s*{_NUMBER}\s*(?:k|thousand|lakh|lakhs|lac|lacs|million|mn|crore|crores)?\s*(?:INR|USD|EUR|GBP|CAD|AUD|JPY|CNY|CHF|SGD|NZD|rupees?|dollars?|euros?|pounds?)?"
_RANGE_RE = re.compile(
    rf"(?P<left>{_AMOUNT_RAW})\s*(?:to|through|and|[-–—])\s*(?P<right>{_AMOUNT_RAW})",
    re.IGNORECASE,
)
_PRICE_CONTEXT = re.compile(
    r"\b(?:price|pricing|target|expect(?:ed|ing)?|cost|per\s+(?:unit|piece|item)|"
    r"budget|spend|pay|maximum|max|minimum|min|at\s+most|at\s+least|"
    r"not\s+more\s+than|not\s+less\s+than|below|under|up\s+to|"
    r"above|starting\s+from|cheaper\s+than|between|from|within|around|about|approximately|"
    r"approx(?:imately)?|total|altogether|in\s+all|for\s+\d+\s+(?:units?|pieces?|items?))\b",
    re.IGNORECASE,
)
_RANGE_CONTEXT = re.compile(
    r"\b(?:range|between|from|minimum|min|maximum|max|price|budget|target|"
    r"around|about|approximately|approx|roughly|per\s+(?:unit|piece|item))\b",
    re.IGNORECASE,
)
_TOTAL_CONTEXT = re.compile(
    r"\b(?:total|overall|altogether|in\s+all|whole\s+order|entire\s+order|"
    r"for\s+\d+(?:\.\d+)?\s+(?:units?|pieces?|items?|pcs))\b",
    re.IGNORECASE,
)
_WITHIN_CONTEXT = re.compile(r"\bwithin\b", re.IGNORECASE)
_ORDER_QUANTITY_CONTEXT = re.compile(
    r"\b\d+(?:\.\d+)?\s+(?:units?|pieces?|items?|pcs)\b",
    re.IGNORECASE,
)
_MAX_CONTEXT = re.compile(
    r"\b(?:maximum|max(?:imum)?|up\s+to|not\s+more\s+than|at\s+most|"
    r"no\s+more\s+than|below|under|within|ceiling|cap)\b",
    re.IGNORECASE,
)
_MIN_CONTEXT = re.compile(
    r"\b(?:minimum|min(?:imum)?|at\s+least|not\s+less\s+than|"
    r"no\s+less\s+than|above|starting\s+from|cheaper\s+than)\b",
    re.IGNORECASE,
)
_APPROX_CONTEXT = re.compile(
    r"\b(?:around|about|approximately|approx(?:imately)?|roughly|"
    r"circa|near(?:ly)?)\b",
    re.IGNORECASE,
)
_BUDGET_CONTEXT = re.compile(r"\b(?:budget|spend|afford|pay)\b", re.IGNORECASE)
_PER_UNIT_CONTEXT = re.compile(
    r"\b(?:per\s+(?:unit|piece|item)|each|apiece|per\s+pc)\b",
    re.IGNORECASE,
)
_NON_PRICE_SUFFIX = re.compile(
    r"^\s*(?:GB|TB|MB|V|volts?|W|kW|watts?|MHz|GHz|Hz|mAh|Ah|"
    r"kg|kilograms?|g|grams?|litres?|liters?|ml|meters?|metres?|cm|mm|"
    r"ft|inches?|units?|pieces?|items?|pcs|days?|weeks?|months?|years?|"
    r"hours?|minutes?|watches?|smartwatches?|laptops?|phones?|tanks?|"
    r"monitors?|chairs?|tables?|cameras?|printers?)\b",
    re.IGNORECASE,
)

_CURRENCIES = {
    "₹": "INR",
    "rs": "INR",
    "rs.": "INR",
    "inr": "INR",
    "rupee": "INR",
    "rupees": "INR",
    "usd": "USD",
    "$": "USD",
    "dollar": "USD",
    "dollars": "USD",
    "eur": "EUR",
    "€": "EUR",
    "euro": "EUR",
    "euros": "EUR",
    "gbp": "GBP",
    "£": "GBP",
    "pound": "GBP",
    "pounds": "GBP",
    "cad": "CAD",
    "aud": "AUD",
    "jpy": "JPY",
    "¥": "JPY",
    "cny": "CNY",
    "chf": "CHF",
    "sgd": "SGD",
    "nzd": "NZD",
}
SUPPORTED_CURRENCY_CODES = frozenset(_CURRENCIES.values())
_AMBIGUOUS_CURRENCY_SYMBOLS = {"$", "¥"}
_SCALES = {
    "k": Decimal(1000),
    "thousand": Decimal(1000),
    "lakh": Decimal(100000),
    "lakhs": Decimal(100000),
    "lac": Decimal(100000),
    "lacs": Decimal(100000),
    "million": Decimal(1000000),
    "mn": Decimal(1000000),
    "crore": Decimal(10000000),
    "crores": Decimal(10000000),
}


def _clause_context(text: str, start: int, end: int) -> str:
    boundaries = ".;!?,"
    clause_start = max((text.rfind(boundary, 0, start) for boundary in boundaries), default=-1)
    clause_end_candidates = [
        position
        for boundary in boundaries
        if (position := text.find(boundary, end)) >= 0
    ]
    clause_end = min(clause_end_candidates, default=len(text))
    return text[clause_start + 1:clause_end]


@dataclass
class PriceUnderstanding:
    values: dict[str, str] = field(default_factory=dict)
    clarification: Optional[str] = None


def _currency(match: re.Match[str]) -> Optional[str]:
    token = match.group("code") or match.group("symbol")
    return _CURRENCIES.get(token.casefold()) if token else None


def _amount(match: re.Match[str]) -> Decimal:
    number = Decimal(match.group("number").replace(",", ""))
    scale = match.group("scale")
    if scale:
        number *= _SCALES[scale.casefold()]
    return number


def _format_money(value: Decimal) -> str:
    normalized = value.normalize()
    return format(normalized, "f")


def _currency_for_matches(matches: list[re.Match[str]]) -> tuple[Optional[str], bool]:
    currencies = {
        currency
        for match in matches
        if (currency := _currency(match)) is not None
    }
    return (next(iter(currencies)) if len(currencies) == 1 else None, len(currencies) > 1)


def understand_price(
    text: str,
    *,
    quantity: Optional[Decimal] = None,
) -> PriceUnderstanding:
    """Extract explicit price semantics; preserve ambiguity instead of guessing."""
    ranges = list(_RANGE_RE.finditer(text))
    for candidate in ranges:
        context = _clause_context(text, candidate.start(), candidate.end())
        left_match = _AMOUNT_RE.fullmatch(candidate.group("left"))
        right_match = _AMOUNT_RE.fullmatch(candidate.group("right"))
        if left_match is None or right_match is None:
            continue
        if _NON_PRICE_SUFFIX.match(text[candidate.end():]):
            continue
        has_currency_or_scale = any(
            _currency(match) is not None or match.group("scale")
            for match in (left_match, right_match)
        )
        if not _RANGE_CONTEXT.search(context) and not has_currency_or_scale:
            continue
        if any(
            match.group("symbol") in _AMBIGUOUS_CURRENCY_SYMBOLS
            and not match.group("code")
            for match in (left_match, right_match)
        ):
            return PriceUnderstanding(
                clarification="Which currency does that symbol refer to?"
            )
        left, right = _amount(left_match), _amount(right_match)
        if left <= 0 or right <= 0:
            return PriceUnderstanding(clarification="Please clarify the positive price range you want.")
        if right_match.group("scale") is None and left_match.group("scale"):
            right *= _SCALES[left_match.group("scale").casefold()]
        elif left_match.group("scale") is None and right_match.group("scale"):
            left *= _SCALES[right_match.group("scale").casefold()]
        currency, conflict = _currency_for_matches([left_match, right_match])
        if conflict:
            return PriceUnderstanding(clarification="Which currency should I use for that price range?")
        if right < left:
            return PriceUnderstanding(clarification="Please clarify the price range; its minimum is above its maximum.")
        explicit_total = bool(_TOTAL_CONTEXT.search(context))
        within_with_quantity = bool(
            _WITHIN_CONTEXT.search(context)
            and _ORDER_QUANTITY_CONTEXT.search(context)
        )
        if (
            (explicit_total or within_with_quantity)
            and not _PER_UNIT_CONTEXT.search(context)
        ):
            return PriceUnderstanding(
                values={
                    "total_budget": _format_money(right),
                    "price_type": "total_budget",
                    "is_derived": "false",
                    **({"currency": currency} if currency else {}),
                }
            )
        return PriceUnderstanding(
            values={
                "min_target_unit_price": _format_money(left),
                "max_target_unit_price": _format_money(right),
                "price_type": "range",
                "is_derived": "false",
                **({"currency": currency} if currency else {}),
            }
        )

    candidates: list[tuple[re.Match[str], str]] = []
    for match in _AMOUNT_RE.finditer(text):
        if not match.group("number"):
            continue
        start, end = match.span()
        if _NON_PRICE_SUFFIX.match(text[end:]):
            continue
        context = _clause_context(text, start, end)
        explicit_currency = _currency(match) is not None
        if not _PRICE_CONTEXT.search(context) and not explicit_currency:
            continue
        if not explicit_currency and not _PRICE_CONTEXT.search(context):
            continue
        try:
            amount = _amount(match)
        except InvalidOperation:
            continue
        if amount <= 0:
            return PriceUnderstanding(clarification="Please provide a positive price or budget amount.")
        candidates.append((match, context))

    if not candidates:
        return PriceUnderstanding()

    if any(
        candidate.group("symbol") in _AMBIGUOUS_CURRENCY_SYMBOLS
        and not candidate.group("code")
        for candidate, _ in candidates
    ):
        return PriceUnderstanding(
            clarification="Which currency does that symbol refer to?"
        )

    values: dict[str, str] = {}
    currencies: set[str] = set()
    for candidate, context in candidates:
        amount = _amount(candidate)
        local_context = context[:candidate.start() - max(
            (text.rfind(boundary, 0, candidate.start()) for boundary in ".;!?,"),
            default=-1,
        ) - 1]
        if currency_code := _currency(candidate):
            currencies.add(currency_code)

        explicit_total = bool(_TOTAL_CONTEXT.search(context))
        within_with_quantity = bool(
            _WITHIN_CONTEXT.search(context)
            and _ORDER_QUANTITY_CONTEXT.search(context)
        )
        if (
            (explicit_total or within_with_quantity)
            and not _PER_UNIT_CONTEXT.search(context)
        ):
            values.update({
                "total_budget": _format_money(amount),
                "price_type": "total_budget",
                "is_derived": "false",
            })
            if quantity is not None and quantity > 0:
                values["derived_max_unit_budget"] = _format_money(amount / quantity)
                values["derived_unit_budget_source"] = "total_budget_divided_by_quantity"
                values["derived_max_unit_budget_is_derived"] = "true"
            continue
        if (
            _WITHIN_CONTEXT.search(context)
            and not _ORDER_QUANTITY_CONTEXT.search(context)
            and not _PER_UNIT_CONTEXT.search(context)
        ):
            values.update({
                "budget": _format_money(amount),
                "price_type": "ambiguous_budget",
                "is_derived": "false",
                "price_clarification": (
                    "Is that your budget for each unit or for the whole order?"
                ),
            })
            continue
        if _MAX_CONTEXT.search(local_context):
            values["max_target_unit_price"] = _format_money(amount)
            values["price_type"] = "range" if "min_target_unit_price" in values else "maximum"
            values["is_derived"] = "false"
            continue
        if _MIN_CONTEXT.search(local_context):
            values["min_target_unit_price"] = _format_money(amount)
            values["price_type"] = "range" if "max_target_unit_price" in values else "minimum"
            values["is_derived"] = "false"
            continue
        if _APPROX_CONTEXT.search(local_context):
            values["target_unit_price"] = _format_money(amount)
            values["price_type"] = "approximate"
            values["is_derived"] = "false"
            continue
        if _BUDGET_CONTEXT.search(local_context):
            if _PER_UNIT_CONTEXT.search(context):
                values["max_target_unit_price"] = _format_money(amount)
                values["price_type"] = "maximum"
                values["is_derived"] = "false"
            else:
                values.update({
                    "budget": _format_money(amount),
                    "price_type": "ambiguous_budget",
                    "is_derived": "false",
                    "price_clarification": (
                        "Is that your budget for each unit or for the whole order?"
                    ),
                })
            continue
        values["target_unit_price"] = _format_money(amount)
        values["price_type"] = "exact"
        values["is_derived"] = "false"

    if len(currencies) > 1:
        return PriceUnderstanding(clarification="Which currency should I use for those prices?")
    if currencies:
        values["currency"] = next(iter(currencies))
    if "total_budget" in values and quantity is not None and quantity > 0:
        total_budget = Decimal(values["total_budget"])
        values["derived_max_unit_budget"] = _format_money(total_budget / quantity)
        values["derived_unit_budget_source"] = "total_budget_divided_by_quantity"
        values["derived_max_unit_budget_is_derived"] = "true"
    if (
        "min_target_unit_price" in values
        and "max_target_unit_price" in values
        and Decimal(values["min_target_unit_price"]) > Decimal(values["max_target_unit_price"])
    ):
        return PriceUnderstanding(
            clarification="Please clarify the price range; its minimum is above its maximum."
        )
    return PriceUnderstanding(values=values)
