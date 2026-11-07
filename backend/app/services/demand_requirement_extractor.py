import re
from typing import Any, Dict, List, Optional, Tuple


MATERIAL_ALIASES = {
    "ss": "stainless steel",
    "ss304": "stainless steel 304",
    "ss 304": "stainless steel 304",
    "stainless steel": "stainless steel",
}

UNIT_CONVERSIONS = {
    ("mm", "cm"): 0.1,
    ("cm", "mm"): 10.0,
    ("m", "cm"): 100.0,
    ("cm", "m"): 0.01,
    ("ml", "l"): 0.001,
    ("l", "ml"): 1000.0,
    ("g", "kg"): 0.001,
    ("kg", "g"): 1000.0,
}


def _normalize_material(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    key = value.strip().lower()
    return MATERIAL_ALIASES.get(key, key)


def _convert_unit(value: float, from_unit: str, to_unit: str) -> Optional[float]:
    from_unit = from_unit.lower().strip()
    to_unit = to_unit.lower().strip()
    if from_unit == to_unit:
        return value
    factor = UNIT_CONVERSIONS.get((from_unit, to_unit))
    if factor is None:
        return None
    return value * factor


def extract_requirements(demand: Dict[str, Any]) -> Dict[str, Any]:
    missing: List[str] = []
    clarification_questions: List[str] = []

    product_name = demand.get("product_name") or demand.get("title")
    category = demand.get("category")
    brand = demand.get("brand")
    model_number = demand.get("model_number")
    material = demand.get("material")
    specs = demand.get("technical_specifications") or []
    dimensions = demand.get("dimensions") or {}
    quantity = demand.get("quantity", demand.get("target_quantity"))
    unit = demand.get("unit")
    minimum_price = demand.get("minimum_target_unit_price", demand.get("min_target_unit_price"))
    maximum_price = demand.get("maximum_target_unit_price", demand.get("max_target_unit_price"))
    currency = demand.get("currency")
    lead_time = demand.get("expected_lead_time")

    if not product_name:
        missing.append("product_name")
        clarification_questions.append("Please specify the product.")
    if quantity is None or float(quantity) <= 0:
        missing.append("quantity")
        clarification_questions.append("Please specify a positive purchase quantity.")
    if not unit:
        missing.append("unit")
        clarification_questions.append("Please specify the quantity unit.")
    if minimum_price is None or float(minimum_price) <= 0:
        missing.append("minimum_target_unit_price")
        clarification_questions.append("Please specify a minimum target unit price.")
    if maximum_price is None or float(maximum_price) <= 0:
        missing.append("maximum_target_unit_price")
        clarification_questions.append("Please specify a maximum target unit price.")
    if minimum_price is not None and maximum_price is not None and float(maximum_price) < float(minimum_price):
        missing.append("valid_target_price_range")
        clarification_questions.append("The maximum target unit price must not be below the minimum.")
    if not currency:
        missing.append("currency")
        clarification_questions.append("Please specify a currency.")

    normalized_dimensions = {}
    for key in ["length", "width", "height"]:
        val = dimensions.get(key)
        if val is not None:
            normalized_dimensions[key] = {"original": val, "unit": dimensions.get("unit")}
    if dimensions.get("unit"):
        dimension_unit = dimensions.get("unit")
        for key in ["length", "width", "height"]:
            val = dimensions.get(key)
            if val is not None and dimension_unit:
                converted = _convert_unit(float(val), dimension_unit, "cm")
                if converted is not None:
                    normalized_dimensions[key] = {
                        "original": val,
                        "original_unit": dimension_unit,
                        "normalized": converted,
                        "normalized_unit": "cm",
                    }

    normalized_material = _normalize_material(material)
    normalized_specs = {}
    mandatory = []
    optional = []
    for spec in specs:
        name = spec.get("name") if isinstance(spec, dict) else None
        value = spec.get("value") if isinstance(spec, dict) else None
        if name:
            normalized_specs[name] = value
            entry = {"name": name, "value": value}
            (mandatory if spec.get("mandatory") is True else optional).append(entry)
    if material:
        normalized_specs.setdefault("material", material)
    if brand:
        normalized_specs.setdefault("brand", brand)
        optional.append({"name": "brand", "value": brand})
    if model_number:
        normalized_specs.setdefault("model_number", model_number)
        optional.append({"name": "model number", "value": model_number})

    status = "Needs Clarification" if missing else "Completed"

    return {
        "product_type": product_name,
        "normalized_product_name": product_name,
        "normalized_category": category,
        "normalized_material": normalized_material,
        "normalized_specifications": normalized_specs,
        "normalized_dimensions": normalized_dimensions,
        "mandatory_requirements": mandatory,
        "optional_preferences": optional,
        "commercial_constraints": {
            "quantity": quantity,
            "unit": unit,
            "minimum_target_unit_price": minimum_price,
            "maximum_target_unit_price": maximum_price,
            "currency": currency,
        },
        "delivery_constraints": {
            "expected_lead_time": lead_time,
        } if lead_time is not None else {},
        "missing_information": missing,
        "clarification_questions": clarification_questions,
        "validation_errors": [],
        "confidence_score": None,
        "status": status,
    }