"""Graders for the five step kinds.

Every grader returns a continuous outcome in [0, 1] and is purely rule-based. A
case that cannot be graded by these functions cannot be published, which keeps
the weekly cadence affordable.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

Span = tuple[int, int]


@dataclass(frozen=True)
class Grade:
    outcome: float
    detail: dict


# ---------------------------------------------------------------------------
# span_select
# ---------------------------------------------------------------------------

ADJACENT_GAP = 3


def split_adjacent(selected: list[Span], targets: list[Span], tolerance: int) -> list[Span]:
    """Read one mark that runs over neighbouring targets as one mark per target.

    The interface marks whole words, and consecutive words form one mark. Two
    targets separated only by a comma and a space ("bölüm, kayıt_yılı") cannot
    then be marked apart. A mark that starts at the first target, ends at the
    last, and has nothing but a short gap between them is counted as those
    targets. A mark that takes in other words is left as it is.
    """
    out: list[Span] = []
    for sel in selected:
        inside = sorted(t for t in targets
                        if t[0] >= sel[0] - tolerance and t[1] <= sel[1] + tolerance)
        if (len(inside) >= 2
                and abs(inside[0][0] - sel[0]) <= tolerance
                and abs(inside[-1][1] - sel[1]) <= tolerance
                and all(b[0] - a[1] <= ADJACENT_GAP for a, b in zip(inside, inside[1:]))):
            out.extend(inside)
        else:
            out.append(sel)
    return out


def grade_span_select(
    selected: list[Span],
    targets: list[Span],
    tolerance: int = 2,
    partial_credit: bool = True,
) -> Grade:
    """F1 over marked spans against authored targets.

    F1 balances recall against precision, so neither marking the whole passage
    nor marking nothing scores well.
    """
    if not targets:
        raise ValueError("span_select step has no targets")

    selected = split_adjacent(selected, targets, tolerance)
    unmatched = list(targets)
    hits = 0
    for sel in selected:
        for i, tgt in enumerate(unmatched):
            if abs(sel[0] - tgt[0]) <= tolerance and abs(sel[1] - tgt[1]) <= tolerance:
                unmatched.pop(i)
                hits += 1
                break

    precision = hits / len(selected) if selected else 0.0
    recall = hits / len(targets)
    f1 = 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)

    if not partial_credit:
        f1 = 1.0 if f1 == 1.0 else 0.0

    return Grade(f1, {"hits": hits, "precision": precision, "recall": recall,
                      "missed": len(unmatched)})


# ---------------------------------------------------------------------------
# source_verify
# ---------------------------------------------------------------------------

def grade_source_verify(answers: dict[str, bool], truth: dict[str, dict]) -> Grade:
    """Balanced accuracy over real and fabricated references.

    Averaging the two class rates makes a blanket answer, such as calling
    everything fabricated, score at chance.
    """
    if not truth:
        raise ValueError("source_verify step has no truth entries")
    missing = set(truth) - set(answers)
    if missing:
        raise ValueError(f"no answer submitted for {sorted(missing)}")

    real = [k for k, v in truth.items() if v["exists"]]
    fake = [k for k, v in truth.items() if not v["exists"]]

    rates = []
    if real:
        rates.append(sum(answers[k] is True for k in real) / len(real))
    if fake:
        rates.append(sum(answers[k] is False for k in fake) / len(fake))

    return Grade(sum(rates) / len(rates),
                 {"real_correct": rates[0] if real else None,
                  "fake_correct": rates[-1] if fake else None})


# ---------------------------------------------------------------------------
# pattern_check
# ---------------------------------------------------------------------------

# Case bodies declare regex flags per rule, and each rule is matched with its
# own flags: a forbidden (selin|aktaş) relies on "i" to catch "Selin Aktaş".
_FLAGS = {"i": re.IGNORECASE, "m": re.MULTILINE, "s": re.DOTALL, "x": re.VERBOSE}


def _matches(rule: dict, text: str) -> bool:
    flags = 0
    for letter in rule.get("flags", "") or "":
        if letter not in _FLAGS:
            raise ValueError(f"unknown regex flag {letter!r} in rule {rule.get('label')!r}")
        flags |= _FLAGS[letter]
    return re.search(rule["pattern"], text, flags) is not None


def grade_pattern_check(
    submission: str,
    forbidden: list[dict],
    required: list[dict],
    max_chars: int | None = None,
) -> Grade:
    """Fraction of constraints satisfied, with hard failures short-circuiting.

    A hard-failing forbidden pattern is one where the submission still carries an
    identifier. It zeroes the step whatever else is satisfied, so a rewrite that
    leaks a national ID number earns no marks.
    """
    if max_chars is not None and len(submission) > max_chars:
        return Grade(0.0, {"reason": "over_length", "length": len(submission)})

    violations, satisfied, total = [], 0, 0

    for c in forbidden:
        total += 1
        if _matches(c, submission):
            violations.append(c["label"])
            if c.get("hard_fail"):
                return Grade(0.0, {"reason": "hard_fail", "violations": violations})
        else:
            satisfied += 1

    for c in required:
        total += 1
        if _matches(c, submission):
            satisfied += 1
        else:
            violations.append(f"eksik: {c['label']}")

    return Grade(satisfied / total if total else 0.0,
                 {"satisfied": satisfied, "total": total, "violations": violations})


# ---------------------------------------------------------------------------
# reasoned_choice
# ---------------------------------------------------------------------------

def grade_reasoned_choice(
    chosen_option: str,
    chosen_reason: str | None,
    correct_option: str,
    reason_weights: dict[str, float] | None = None,
    option_weight: float = 0.5,
) -> Grade:
    """Split the mark between the decision and the reason behind it.

    The reason carries real weight because the same correct decision reached for
    a wrong reason will not transfer to the next case. A plausible-but-shallow
    justification is authored to score partially.
    """
    if not 0.0 <= option_weight <= 1.0:
        raise ValueError("option_weight must be in [0, 1]")

    option_score = 1.0 if chosen_option == correct_option else 0.0
    if reason_weights is None:
        return Grade(option_score, {"option": option_score, "reason": None})

    reason_score = reason_weights.get(chosen_reason, 0.0) if chosen_reason else 0.0
    outcome = option_weight * option_score + (1 - option_weight) * reason_score
    return Grade(outcome, {"option": option_score, "reason": reason_score})


# ---------------------------------------------------------------------------
# branching
# ---------------------------------------------------------------------------

def grade_branching(path_outcomes: list[float], scoring: str = "path_mean") -> Grade:
    """Score a decision path.

    path_min is for cases whose real-world counterpart is irreversible: once a
    patient record has been pasted into a chat window, no later decision in the
    path undoes it.
    """
    if not path_outcomes:
        raise ValueError("branching step recorded no decisions")
    if scoring == "path_min":
        outcome = min(path_outcomes)
    elif scoring == "path_mean":
        outcome = sum(path_outcomes) / len(path_outcomes)
    else:
        raise ValueError(f"unknown branching scoring: {scoring}")

    return Grade(outcome, {"decisions": len(path_outcomes),
                           "worst": min(path_outcomes)})


# ---------------------------------------------------------------------------
# The client contract
# ---------------------------------------------------------------------------

# What a browser sends, and which grader argument it becomes. Client names
# describe what the person did and stay independent of the graders' parameters.
SUBMISSION_FIELDS: dict[str, dict[str, str]] = {
    "span_select":     {"spans": "selected"},
    "source_verify":   {"answers": "answers"},
    "pattern_check":   {"text": "submission"},
    "reasoned_choice": {"option": "chosen_option", "reason": "chosen_reason"},
    "branching":       {"path_outcomes": "path_outcomes"},
}

REQUIRED_FIELDS: dict[str, set[str]] = {
    "span_select": {"spans"},
    "source_verify": {"answers"},
    "pattern_check": {"text"},
    "reasoned_choice": {"option"},
    "branching": {"path_outcomes"},
}


class BadSubmission(ValueError):
    """The submission is not the shape this kind of step takes."""


def normalise_submission(kind: str, submission: dict) -> dict:
    """Translate one client submission into grader arguments.

    Unknown fields are rejected, since a client sending ``selected`` instead of
    ``spans`` is a bug that an error makes visible.
    """
    mapping = SUBMISSION_FIELDS.get(kind)
    if mapping is None:
        raise BadSubmission(f"unknown step kind: {kind}")

    unknown = set(submission) - set(mapping)
    if unknown:
        raise BadSubmission(
            f"{kind} does not take {sorted(unknown)}; expected {sorted(mapping)}"
        )
    missing = REQUIRED_FIELDS[kind] - set(submission)
    if missing:
        raise BadSubmission(f"{kind} needs {sorted(missing)}")

    out = {mapping[k]: v for k, v in submission.items()}
    if kind == "span_select":
        out["selected"] = [tuple(x) for x in out["selected"]]
    return out


GRADERS = {
    "span_select": grade_span_select,
    "source_verify": grade_source_verify,
    "pattern_check": grade_pattern_check,
    "reasoned_choice": grade_reasoned_choice,
    "branching": grade_branching,
}
