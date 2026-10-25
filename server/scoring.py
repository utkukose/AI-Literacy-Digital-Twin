"""Scoring mathematics for the SDU AI Literacy Platform.

Pure functions with no database or framework dependency, so the rules that
decide a person's twin can be tested in isolation and reasoned about on paper.

Three quantities are produced and never mixed:

  theta       per-dimension ability, updated from the raw outcome only
  points      experience, updated from a proper scoring rule over confidence
  brier       calibration, reported on its own axis

Keeping them apart means that a person who is right most of the time but
wildly overconfident and a person who is right less often but knows exactly
where their limits are land on different vectors.
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass

# Confidence levels offered in the interface. The ceiling is deliberately below
# certainty: 90% already covers everything the scale is meant to teach.
CONFIDENCE_LEVELS = (0.50, 0.60, 0.70, 0.80, 0.90)

# Ability learning rate. High while the twin knows almost nothing about the
# person, then low enough that a single bad afternoon does not rewrite it.
K_EARLY = 0.40
K_LATE = 0.15
EARLY_ATTEMPTS = 10

# Difficulty learning rate, decaying with the number of observations so that a
# well-used step settles.
K_DIFFICULTY_BASE = 0.05
K_DIFFICULTY_HALFLIFE = 30

# Target success probability when selecting the next case: hard enough to be
# informative, easy enough to stay worth finishing.
TARGET_P = 0.65

# Point value retained by a weekly case after it closes and moves to archive.
ARCHIVE_POINT_RATIO = 0.30

CALIBRATION_WINDOW = 30

# An outcome at or above this counts as "got it right" when scoring confidence.
# Partial credit still reaches theta in full; it is only the confidence question
# that is binary, because that is what the person was asked to bet on.
SUCCESS_THRESHOLD = 0.80


def sigmoid(z: float) -> float:
    if z >= 0:
        return 1.0 / (1.0 + math.exp(-z))
    e = math.exp(z)
    return e / (1.0 + e)


def predict(theta: float, difficulty: float) -> float:
    """Probability that this person answers this step correctly.

    Recorded before the outcome is known, so the twin's predictions can be
    checked against what actually happened.
    """
    return sigmoid(theta - difficulty)


def ability_rate(attempts: int) -> float:
    return K_EARLY if attempts < EARLY_ATTEMPTS else K_LATE


def difficulty_rate(observations: int) -> float:
    return K_DIFFICULTY_BASE * K_DIFFICULTY_HALFLIFE / (K_DIFFICULTY_HALFLIFE + observations)


@dataclass(frozen=True)
class EloUpdate:
    p_predicted: float
    theta_before: float
    theta_after: float
    difficulty_before: float
    difficulty_after: float


def elo_update(
    theta: float,
    difficulty: float,
    outcome: float,
    attempts: int,
    observations: int,
    expected: float | None = None,
) -> EloUpdate:
    """Move ability and difficulty against each other by the surprise.

    Outcome is continuous in [0, 1], so partial credit on a span-marking or
    source-verification step carries its information into the update.
    `expected` is the prediction sealed when the step was shown; without one
    the prediction is made from the current theta and difficulty.
    """
    if not 0.0 <= outcome <= 1.0:
        raise ValueError(f"outcome must be in [0, 1], got {outcome}")

    p = predict(theta, difficulty) if expected is None else expected
    surprise = outcome - p

    return EloUpdate(
        p_predicted=p,
        theta_before=theta,
        theta_after=theta + ability_rate(attempts) * surprise,
        difficulty_before=difficulty,
        difficulty_after=difficulty - difficulty_rate(observations) * surprise,
    )


def is_success(outcome: float, threshold: float = SUCCESS_THRESHOLD) -> float:
    """Resolve a graded outcome into the event the person stated confidence in.

    Confidence answers "am I right about this?", which is a yes-or-no question,
    so it is scored against a binary success. The twin still receives the
    fine-grained outcome; only this one calculation rounds.
    """
    return 1.0 if outcome >= threshold else 0.0


def points_awarded(base_points: int, outcome: float, confidence: float | None,
                   point_ratio: float = 1.0) -> float:
    """Experience from a strictly proper scoring rule.

        raw = 1 - 4 * (confidence - success)^2

    Reading the curve: stating 50% earns nothing whatever happens, which is the
    honest price of "I don't know". Confident and right earns nearly the full
    value. Confident and wrong costs more than the step was worth.

    That asymmetry is the mechanic that devalues a shared answer. Someone
    repeating a number they were handed cannot calibrate their confidence to it,
    and the rule charges them for the gap.

    The rule is proper at every point on the scale: no confidence other than the
    person's true belief maximises the expected score. Nothing is clamped here,
    so a single step can go meaningfully negative; the running total is floored
    at zero for display only.
    """
    if confidence is None:
        return base_points * outcome * point_ratio
    if confidence not in CONFIDENCE_LEVELS:
        raise ValueError(f"confidence must be one of {CONFIDENCE_LEVELS}, got {confidence}")

    raw = 1.0 - 4.0 * (confidence - is_success(outcome)) ** 2
    return base_points * raw * point_ratio


def brier(outcome: float, confidence: float) -> float:
    """Squared error of the person's own confidence statement. Lower is better."""
    return (confidence - is_success(outcome)) ** 2


def calibration_index(recent_briers: list[float]) -> float | None:
    """Mean Brier over the most recent confidence-bearing steps.

    Reported next to the twin, never inside it.
    """
    window = recent_briers[-CALIBRATION_WINDOW:]
    if not window:
        return None
    return sum(window) / len(window)


def assign_variant(pseudonym: str, case_key: str, variant_keys: list[str]) -> str:
    """Pick one variant for this person and case, stably and without storage.

    Deterministic so that a reload, a second device, or a resumed session all
    land on the same variant. Salted with the case key so that a person does not
    receive the same variant position in every case of the term.
    """
    if not variant_keys:
        raise ValueError("case has no variants")
    digest = hashlib.sha256(f"{pseudonym}:{case_key}".encode()).digest()
    return variant_keys[int.from_bytes(digest[:8], "big") % len(variant_keys)]


def select_next_dimension(twin: dict[str, tuple[float, int]]) -> str:
    """Choose the dimension the twin knows least about.

    Ties break towards the lower ability, so a person is pushed at their weakest
    point.
    """
    if not twin:
        raise ValueError("twin state is empty")
    return min(twin.items(), key=lambda kv: (kv[1][1], kv[1][0]))[0]


def case_fit(theta: float, difficulty: float) -> float:
    """Distance from the target success probability. Lower fits better."""
    return abs(predict(theta, difficulty) - TARGET_P)
