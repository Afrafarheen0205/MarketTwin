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
    validation_errors: List[str] = []
    clarification_questions: List[str] = []

    product_name = demand.get("product_name")
    category = demand.get("category")
    brand = demand.get("brand")
    model_number = demand.get("model_number")
    description = demand.get("description")
    material = demand.get("material")
    certifications = demand.get("certifications") or []
    specs = demand.get("technical_specifications") or []
    dimensions = demand.get("dimensions") or {}
    quantity = demand.get("quantity")
    unit = demand.get("unit")
    target_price = demand.get("target_unit_price")
    max_budget = demand.get("maximum_budget")
    currency = demand.get("currency") or "USD"
    delivery_date = demand.get("required_delivery_date")
    lead_time = demand.get("expected_lead_time")
    delivery_address = demand.get("delivery_address") or {}
    additional = demand.get("additional_requirements")

    # Missing info detection
    if not dimensions:
        missing.append("dimensions")
        clarification_questions.append("Please provide product dimensions.")
    if not material:
        missing.append("material")
        clarification_questions.append("Please specify the required material.")
    if not certifications:
        missing.append("certifications")
    if quantity is None or quantity <= 0:
        validation_errors.append("Quantity must be greater than zero.")
    if target_price is not None and target_price < 0:
        validation_errors.append("Target unit price cannot be negative.")
    if max_budget is not None and max_budget < 0:
        validation_errors.append("Maximum budget cannot be negative.")

    # Normalize dimensions with unit conversion where possible
    normalized_dimensions = {}
    for key in ["length", "width", "height"]:
        val = dimensions.get(key)
        if val is not None:
            normalized_dimensions[key] = {"original": val, "unit": dimensions.get("unit")}
    if dimensions.get("unit"):
        # Convert to cm if possible
        unit = dimensions.get("unit")
        for key in ["length", "width", "height"]:
            val = dimensions.get(key)
            if val is not None and unit:
                converted = _convert_unit(float(val), unit, "cm")
                if converted is not None:
                    normalized_dimensions[key] = {
                        "original": val,
                        "original_unit": unit,
                        "normalized": converted,
                        "normalized_unit": "cm",
                    }

    normalized_material = _normalize_material(material)

    # Mandatory requirements
    mandatory = []
    if material:
        mandatory.append({"type": "material", "value": material, "normalized": normalized_material})
    if certifications:
        mandatory.append({"type": "certifications", "value": certifications})
    if quantity:
        mandatory.append({"type": "quantity", "value": quantity, "unit": unit})

    # Optional preferences
    optional = []
    if brand:
        optional.append({"type": "brand", "value": brand})
    if dimensions:
        optional.append({"type": "dimensions", "value": dimensions})

    # Commercial constraints
    commercial = {
        "quantity": quantity,
        "unit": unit,
        "target_unit_price": target_price,
        "maximum_budget": max_budget,
        "currency": currency,
    }

    # Delivery constraints
    delivery = {
        "required_delivery_date": delivery_date,
        "expected_lead_time": lead_time,
        "delivery_address": delivery_address,
    }

    # Normalized specifications
    normalized_specs = {}
    for spec in specs:
        name = spec.get("name") if isinstance(spec, dict) else None
        value = spec.get("value") if isinstance(spec, dict) else None
        if name:
            normalized_specs[name] = value

    status = "Needs Clarification" if missing or validation_errors else "Completed"

    return {
        "product_type": product_name,
        "normalized_product_name": product_name,
        "normalized_category": category,
        "normalized_material": normalized_material,
        "normalized_specifications": normalized_specs,
        "normalized_dimensions": normalized_dimensions,
        "mandatory_requirements": mandatory,
        "optional_preferences": optional,
        "commercial_constraints": commercial,
        "delivery_constraints": delivery,
        "missing_information": missing,
        "clarification_questions": clarification_questions,
        "validation_errors": validation_errors,
        "confidence_score": None,
        "status": status,
    }