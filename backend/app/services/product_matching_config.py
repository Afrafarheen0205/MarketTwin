from typing import Final


RANKING_WEIGHTS: Final[dict[str, float]] = {
    "mandatory_satisfaction": 0.18,
    "product_relevance": 0.12,
    "preferred_brand": 0.14,
    "optional_specifications": 0.18,
    "use_case_relevance": 0.12,
    "customer_rating": 0.15,
    "rating_confidence": 0.06,
    "price_competitiveness": 0.03,
    "delivery_preference": 0.02,
}

# Bayesian rating: (rating * review_count + prior * prior_strength) /
# (review_count + prior_strength). The prior strength is a transparent confidence
# parameter, not an assumed size of the catalogue's review population.
BAYESIAN_GLOBAL_AVERAGE_RATING: Final[float] = 3.5
BAYESIAN_MINIMUM_REVIEW_CONFIDENCE: Final[float] = 50.0
MAX_NEAR_MATCHES: Final[int] = 20
MAX_AI_EXPLANATION_PRODUCTS: Final[int] = 5


def validate_ranking_weights() -> None:
    if not RANKING_WEIGHTS or any(weight < 0 for weight in RANKING_WEIGHTS.values()):
        raise ValueError("Product matching ranking weights must be non-negative.")
    if abs(sum(RANKING_WEIGHTS.values()) - 1.0) > 1e-9:
        raise ValueError("Product matching ranking weights must total 1.0.")


validate_ranking_weights()
