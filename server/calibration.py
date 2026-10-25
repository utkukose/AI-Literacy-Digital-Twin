"""How well a set of probability forecasts matches what happened.

A forecast is the probability that a step is answered right, and its outcome is
1 when the graded result reached the success threshold and 0 when it did not.
The same measures describe a person's own confidence and the twin's sealed
predictions, so the two can be set side by side.

The Brier score splits into three parts (Murphy, 1973):

    Brier = reliability - resolution + uncertainty

reliability is how far stated probabilities sit from the hit rates they turn
into (smaller is better), resolution is how much the hit rate changes from one
forecast level to another (larger is better), and uncertainty is the variance
of the outcomes themselves, which no forecaster controls. The identity is exact
when every forecast in a bin has the same value, as with the confidence levels
a person picks from; for continuous forecasts the bins make it approximate.

The area under the ROC curve of forecast against outcome is the chance that a
right answer carried a higher forecast than a wrong one. For a person's own
confidence this is metacognitive sensitivity: whether confidence tells right
from wrong at all, apart from how well it is scaled.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# A person picks confidence from 50% to 90% in steps of ten; each level is its
# own bin.
CONFIDENCE_EDGES = (0.5, 0.55, 0.65, 0.75, 0.85, 1.0)
# The twin's predictions are continuous; ten equal bins.
PREDICTION_EDGES = tuple(i / 10 for i in range(11))


@dataclass(frozen=True)
class Bin:
    low: float
    high: float
    n: int
    forecast: float
    hit_rate: float


@dataclass(frozen=True)
class Profile:
    n: int
    brier: float
    reliability: float
    resolution: float
    uncertainty: float
    mean_forecast: float
    hit_rate: float
    auroc: float | None
    bins: list[Bin] = field(default_factory=list)

    @property
    def gap(self) -> float:
        """Mean forecast minus hit rate: above zero is overconfidence."""
        return self.mean_forecast - self.hit_rate


def brier(forecasts: list[float], outcomes: list[int]) -> float:
    return sum((f - o) ** 2 for f, o in zip(forecasts, outcomes)) / len(forecasts)


def _bin_index(f: float, edges: tuple[float, ...]) -> int:
    for i in range(len(edges) - 1):
        if f < edges[i + 1]:
            return i
    return len(edges) - 2


def bins_of(forecasts: list[float], outcomes: list[int],
            edges: tuple[float, ...]) -> list[Bin]:
    groups: dict[int, list[tuple[float, int]]] = {}
    for f, o in zip(forecasts, outcomes):
        groups.setdefault(_bin_index(f, edges), []).append((f, o))
    out = []
    for i in sorted(groups):
        rows = groups[i]
        out.append(Bin(low=edges[i], high=edges[i + 1], n=len(rows),
                       forecast=sum(f for f, _ in rows) / len(rows),
                       hit_rate=sum(o for _, o in rows) / len(rows)))
    return out


def auroc(forecasts: list[float], outcomes: list[int]) -> float | None:
    """Mann-Whitney estimate, ties counted as half; None without both outcomes."""
    n1 = sum(outcomes)
    n0 = len(outcomes) - n1
    if n1 == 0 or n0 == 0:
        return None
    order = sorted(range(len(forecasts)), key=lambda i: forecasts[i])
    ranks = [0.0] * len(forecasts)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and forecasts[order[j + 1]] == forecasts[order[i]]:
            j += 1
        mean_rank = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[order[k]] = mean_rank
        i = j + 1
    rank_sum = sum(r for r, o in zip(ranks, outcomes) if o == 1)
    return (rank_sum - n1 * (n1 + 1) / 2) / (n1 * n0)


def profile(forecasts: list[float], outcomes: list[int],
            edges: tuple[float, ...]) -> Profile | None:
    if not forecasts:
        return None
    n = len(forecasts)
    base = sum(outcomes) / n
    bins = bins_of(forecasts, outcomes, edges)
    reliability = sum(b.n * (b.forecast - b.hit_rate) ** 2 for b in bins) / n
    resolution = sum(b.n * (b.hit_rate - base) ** 2 for b in bins) / n
    return Profile(
        n=n,
        brier=brier(forecasts, outcomes),
        reliability=reliability,
        resolution=resolution,
        uncertainty=base * (1 - base),
        mean_forecast=sum(forecasts) / n,
        hit_rate=base,
        auroc=auroc(forecasts, outcomes),
        bins=bins,
    )


def as_dict(p: Profile | None) -> dict | None:
    if p is None:
        return None
    return {
        "n": p.n, "brier": p.brier, "reliability": p.reliability,
        "resolution": p.resolution, "uncertainty": p.uncertainty,
        "mean_forecast": p.mean_forecast, "hit_rate": p.hit_rate,
        "gap": p.gap, "auroc": p.auroc,
        "bins": [{"low": b.low, "high": b.high, "n": b.n,
                  "forecast": b.forecast, "hit_rate": b.hit_rate} for b in p.bins],
    }


def from_bins(bins: list[Bin], squared_error: float) -> dict:
    """The same measures from per-bin counts, as a database returns them.

    `squared_error` is the sum of (forecast - outcome)^2 over every forecast,
    which the bins alone cannot give back.
    """
    n = sum(b.n for b in bins)
    base = sum(b.n * b.hit_rate for b in bins) / n
    return {
        "n": n,
        "brier": squared_error / n,
        "reliability": sum(b.n * (b.forecast - b.hit_rate) ** 2 for b in bins) / n,
        "resolution": sum(b.n * (b.hit_rate - base) ** 2 for b in bins) / n,
        "uncertainty": base * (1 - base),
        "mean_forecast": sum(b.n * b.forecast for b in bins) / n,
        "hit_rate": base,
        "bins": [{"low": b.low, "high": b.high, "n": b.n,
                  "forecast": b.forecast, "hit_rate": b.hit_rate} for b in bins],
    }
