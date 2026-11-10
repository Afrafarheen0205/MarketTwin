DEFAULT_MERCHANT_OPPORTUNITY_THRESHOLD = 50


def is_merchant_opportunity_eligible(
    distinct_compatible_customer_count: int,
    threshold: int = DEFAULT_MERCHANT_OPPORTUNITY_THRESHOLD,
) -> bool:
    if distinct_compatible_customer_count < 0 or threshold < 0:
        raise ValueError("Customer counts and thresholds cannot be negative.")
    return distinct_compatible_customer_count > threshold
