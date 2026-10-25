"""Case loading and the boundary between server-held and client-visible data.

Two responsibilities, both security-relevant:

  1. Turn an authored case body into what the client is allowed to see. The
     projection names every field it includes, so a field added to the schema
     stays on the server until it is listed here.

  2. Resolve locale. Each locale carries its own answer key, since a Turkish
     pattern_check matches Turkish words and a Turkish span_select has Turkish
     offsets. Only the structural skeleton is shared.
"""

from __future__ import annotations

import hashlib
import pickle
import re
import time
from dataclasses import dataclass
from pathlib import Path

import yaml

import grading

PLACEHOLDER = re.compile(r"\{\{\s*([a-z0-9_]+)\s*\}\}")
SPAN_MARKER = re.compile(r"\[\[(.+?)\]\]", re.DOTALL)

DEFAULT_LOCALE = "tr"
SUPPORTED_LOCALES = ("tr", "en")


class CaseNotFound(Exception):
    pass


class LocaleMismatch(Exception):
    """Localized bodies disagree on structure, so their difficulty is not shared."""


@dataclass(frozen=True)
class Case:
    key: str
    locale: str
    body: dict

    @property
    def variant_keys(self) -> list[str]:
        return [v["key"] for v in self.body["variants"]]

    def variant_values(self, variant_key: str) -> dict:
        for v in self.body["variants"]:
            if v["key"] == variant_key:
                return v.get("values") or {}
        raise KeyError(f"unknown variant: {variant_key}")

    def step(self, step_key: str) -> dict:
        for s in self.body["steps"]:
            if s["id"] == step_key:
                return s
        raise KeyError(f"unknown step: {step_key}")


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def load_case(root: Path, case_key: str, locale: str = DEFAULT_LOCALE,
              conn=None, exact: bool = False) -> Case:
    """Load a case body, from the database first and the repository second.

    Cases written in the editor live in app.case_draft; the others live as
    files. Both sources are searched, so a case published from the editor opens
    like any other.

    A case missing in the language asked for is read in another, Turkish first:
    a case that has not been translated stays reachable in the language it was
    written in. With `exact`, only the language asked for will do, which is what
    grading needs, since each language has its own answer key.
    """
    if locale not in SUPPORTED_LOCALES:
        raise ValueError(f"unsupported locale: {locale}")
    candidates = [locale] if exact else list(dict.fromkeys(
        (locale, DEFAULT_LOCALE, *SUPPORTED_LOCALES)))

    if conn is not None:
        for candidate in candidates:
            row = conn.execute(
                "SELECT body FROM app.case_draft"
                " WHERE case_key = %s AND locale = %s::app.locale AND state = 'published'",
                (case_key, candidate),
            ).fetchone()
            if row is not None:
                return Case(key=case_key, locale=candidate, body=row[0])

    for candidate in candidates:
        path = _find_file(root, f"{case_key}.{candidate}.yaml")
        if path is not None:
            return Case(key=case_key, locale=candidate, body=_read_body(path))

    raise CaseNotFound(f"{case_key} has no body in {', '.join(candidates)}")


# A case list names every open case, so reading the bank file by file on each
# request would parse every body again. Bodies are parsed once per change of
# their file, and file names are looked up in an index of the case root.

_LOADER = getattr(yaml, "CSafeLoader", yaml.SafeLoader)
_BODIES: dict[str, tuple[int, bytes]] = {}
_FILES: dict[str, dict[str, Path]] = {}
_INDEXED_AT: dict[str, float] = {}
REINDEX_AFTER = 30.0


def _read_body(path: Path) -> dict:
    stamp = path.stat().st_mtime_ns
    hit = _BODIES.get(str(path))
    if hit is None or hit[0] != stamp:
        body = yaml.load(path.read_text(encoding="utf-8"), Loader=_LOADER)
        hit = (stamp, pickle.dumps(body))
        _BODIES[str(path)] = hit
    # A copy per caller, so a request cannot change the body the next one reads.
    return pickle.loads(hit[1])


def forget_files() -> None:
    """Read the case roots again on the next lookup, so a file added a moment
    ago is found: before the bank is published, or its languages brought up
    to date."""
    _FILES.clear()
    _INDEXED_AT.clear()


def _find_file(root: Path, name: str) -> Path | None:
    files = _FILES.get(str(root))
    path = files.get(name) if files is not None else None
    if path is not None and path.exists():
        return path
    # A name not in the index may belong to a file added since; the root is
    # read again, at most once per REINDEX_AFTER seconds.
    if files is None or path is not None or \
            time.monotonic() - _INDEXED_AT.get(str(root), 0.0) > REINDEX_AFTER:
        found: dict[str, Path] = {}
        for p in sorted(root.rglob("*.yaml")):
            found.setdefault(p.name, p)
        _FILES[str(root)] = found
        _INDEXED_AT[str(root)] = time.monotonic()
        return found.get(name)
    return None


def available_locales(root: Path, case_key: str, conn=None) -> list[str]:
    found = {loc for loc in SUPPORTED_LOCALES if list(root.rglob(f"{case_key}.{loc}.yaml"))}
    if conn is not None:
        rows = conn.execute(
            "SELECT locale::text FROM app.case_draft"
            " WHERE case_key = %s AND state = 'published'", (case_key,)).fetchall()
        found |= {r[0] for r in rows}
    return sorted(found)


def assert_locale_parity(root: Path, case_key: str) -> None:
    """Check that localized bodies are structurally identical.

    Item counts, span target counts and option counts must match across locales,
    because a single difficulty estimate is shared between them. If the English
    span_select has three targets where the Turkish has two, the two versions are
    different steps wearing one name and the estimate becomes meaningless.
    """
    shapes = {loc: skeleton(load_case(root, case_key, loc, exact=True))
              for loc in available_locales(root, case_key)}

    if len(shapes) < 2:
        return
    reference_locale, reference = next(iter(shapes.items()))
    for loc, shape in list(shapes.items())[1:]:
        if shape != reference:
            raise LocaleMismatch(
                f"{case_key}: {loc} does not match {reference_locale} structurally"
            )


def skeleton(case: Case) -> dict:
    """What every language version of a case shares: its variants and, step by
    step, the kind, area, points and the number of things to answer."""
    return {
        "variants": sorted(case.variant_keys),
        "steps": {
            s["id"]: (s["kind"], s["dimension"], s["points"], _shape(s))
            for s in case.body["steps"]
        },
    }


def matching_locales(root: Path, case_key: str, conn=None) -> tuple[list[str], list[str]]:
    """The languages a case can be offered in, and those it cannot.

    A version is offered when its structure matches the case's Turkish version,
    or its first one when it has no Turkish. A version that departs from it is
    held back rather than offered: the two would not be one case, and a person
    who solved one would not have solved the other.
    """
    shapes: dict[str, dict] = {}
    for loc in available_locales(root, case_key, conn):
        try:
            shapes[loc] = skeleton(load_case(root, case_key, loc, conn, exact=True))
        except (CaseNotFound, KeyError, TypeError, yaml.YAMLError):
            continue
    if not shapes:
        return [], []
    reference = shapes.get(DEFAULT_LOCALE) or next(iter(shapes.values()))
    offered = sorted(loc for loc, shape in shapes.items() if shape == reference)
    return offered, sorted(set(shapes) - set(offered))


def _shape(step: dict) -> tuple:
    """Structural fingerprint of a step, independent of any wording."""
    payload, answer = step.get("payload") or {}, step.get("answer") or {}
    kind = step["kind"]

    if kind == "span_select":
        return ("targets", len(SPAN_MARKER.findall(payload.get("text", ""))))
    if kind == "source_verify":
        truth = answer.get("truth") or {}
        return ("items", len(payload.get("items") or []),
                "real", sum(1 for v in truth.values() if v.get("exists")))
    if kind == "pattern_check":
        return ("forbidden", len(answer.get("forbidden") or []),
                "required", len(answer.get("required") or []))
    if kind == "reasoned_choice":
        return ("options", len(payload.get("options") or []),
                "reasons", len(payload.get("reasons") or []))
    if kind == "branching":
        return ("nodes", len(payload.get("nodes") or []))
    return ()


# ---------------------------------------------------------------------------
# Variant substitution and span extraction
# ---------------------------------------------------------------------------

def substitute(text: str, values: dict) -> str:
    def replace(match: re.Match) -> str:
        name = match.group(1)
        if name not in values:
            raise KeyError(f"undefined placeholder: {name}")
        return str(values[name])
    return PLACEHOLDER.sub(replace, text)


def substitute_all(obj, values: dict):
    """substitute() through every string of a nested body: a context, a note."""
    if isinstance(obj, str):
        return substitute(obj, values)
    if isinstance(obj, list):
        return [substitute_all(x, values) for x in obj]
    if isinstance(obj, dict):
        return {k: substitute_all(v, values) for k, v in obj.items()}
    return obj


def extract_spans(text: str) -> tuple[str, list[tuple[int, int]]]:
    """Strip [[ ]] markers and return offsets into the cleaned text.

    Authors mark targets inline; offsets are computed here, so case writing
    stays open to authors who do not write code.

    Substitution must run before this, since a variant value changes the length
    of everything after it.
    """
    clean, targets, cursor = [], [], 0
    position = 0

    for match in SPAN_MARKER.finditer(text):
        literal = text[cursor:match.start()]
        clean.append(literal)
        position += len(literal)

        inner = match.group(1)
        clean.append(inner)
        targets.append((position, position + len(inner)))
        position += len(inner)
        cursor = match.end()

    clean.append(text[cursor:])
    return "".join(clean), targets


def _shuffle_seed(pseudonym: str, step_key: str) -> int:
    digest = hashlib.sha256(f"{pseudonym}:{step_key}".encode()).digest()
    return int.from_bytes(digest[:8], "big")


def _deterministic_order(items: list[dict], seed: int) -> list[dict]:
    """Stable per-person ordering, so a reload never reshuffles the options."""
    return sorted(items, key=lambda item: hashlib.sha256(
        f"{seed}:{item['id']}".encode()).digest())


# ---------------------------------------------------------------------------
# Client projection
# ---------------------------------------------------------------------------

def client_step(case: Case, step_key: str, variant_key: str, pseudonym: str,
                node_id: str | None = None) -> dict:
    """Build exactly what the client receives for one step.

    Every field is named, so a key added to the case schema reaches the browser
    only once it is added here on purpose.
    """
    step = case.step(step_key)
    values = case.variant_values(variant_key)
    kind = step["kind"]
    seed = _shuffle_seed(pseudonym, step_key)

    out = {
        "step_key": step["id"],
        "kind": kind,
        "dimension": step["dimension"],
        "points": step["points"],
        "confidence": step["confidence"],
        "prompt": substitute(step["prompt"], values),
        "locale": case.locale,
    }
    payload = step.get("payload") or {}

    if kind == "span_select":
        text, _ = extract_spans(substitute(payload["text"], values))
        out["text"] = text
        out["min_selections"] = payload.get("min_selections", 1)
        out["max_selections"] = payload.get("max_selections")

    elif kind == "source_verify":
        items = [{"id": i["id"], "citation": substitute(i["citation"], values)}
                 for i in payload["items"]]
        out["items"] = _deterministic_order(items, seed)

    elif kind == "pattern_check":
        # Constraint patterns stay server-side: handing over the regex for the
        # national ID number is handing over the answer.
        out["seed_text"] = substitute(payload["seed_text"], values)
        out["max_chars"] = payload.get("max_chars")
        out["hint"] = substitute(payload["hint"], values) if payload.get("hint") else None

    elif kind == "reasoned_choice":
        out["options"] = _deterministic_order(
            [{"id": o["id"], "text": substitute(o["text"], values)}
             for o in payload["options"]], seed)
        out["reasons"] = _deterministic_order(
            [{"id": r["id"], "text": substitute(r["text"], values)}
             for r in payload.get("reasons") or []], seed + 1)
        # A step that weights reasons is asking for one, and the reason carries
        # part of the mark, so the flag follows from the reasons list.
        out["require_reason"] = bool(out["reasons"])

    elif kind == "branching":
        # One node at a time: the terminal texts state plainly which path goes
        # badly, so each stays hidden until a path reaches it.
        node = _find_node(payload, node_id or payload["start"])
        out["node"] = {
            "id": node["id"],
            "text": substitute(node["text"], values),
            "terminal": bool(node.get("terminal")),
            "options": _deterministic_order(
                [{"id": o["id"], "text": substitute(o["text"], values)}
                 for o in node.get("options") or []], seed),
        }

    else:
        raise ValueError(f"unknown step kind: {kind}")

    return out


def _find_node(payload: dict, node_id: str) -> dict:
    for node in payload["nodes"]:
        if node["id"] == node_id:
            return node
    raise KeyError(f"unknown branching node: {node_id}")


# ---------------------------------------------------------------------------
# Server-side answer key
# ---------------------------------------------------------------------------

def answer_key(case: Case, step_key: str, variant_key: str) -> dict:
    """Arguments the grader needs. Never serialized to a response."""
    step = case.step(step_key)
    values = case.variant_values(variant_key)
    kind = step["kind"]
    payload, answer = step.get("payload") or {}, step["answer"]

    if kind == "span_select":
        _, targets = extract_spans(substitute(payload["text"], values))
        return {"targets": targets,
                "tolerance": answer.get("tolerance_chars", 2),
                "partial_credit": answer.get("partial_credit", True)}

    if kind == "source_verify":
        return {"truth": answer["truth"]}

    if kind == "pattern_check":
        return {"forbidden": answer.get("forbidden") or [],
                "required": answer.get("required") or [],
                "max_chars": payload.get("max_chars")}

    if kind == "reasoned_choice":
        return {"correct_option": answer["correct_option"],
                "reason_weights": answer.get("reason_weights"),
                "option_weight": answer.get("option_weight", 0.5)}

    if kind == "branching":
        return {"scoring": answer.get("scoring", "path_mean")}

    raise ValueError(f"unknown step kind: {kind}")


class UnfinishedPath(ValueError):
    """The walked path has not reached a terminal node yet."""


# One answer for every path that cannot be walked, so a wrong option tells
# nothing about where the others lead.
INVALID_PATH = "invalid_path"


def branching_outcome(case: Case, step_key: str, option_ids: list[str]) -> list[float]:
    """Resolve a walked path into its outcome contributions."""
    payload = case.step(step_key)["payload"]
    outcomes, node = [], _find_node(payload, payload["start"])

    for option_id in option_ids:
        match = next((o for o in node.get("options") or [] if o["id"] == option_id), None)
        if node.get("terminal") or match is None:
            raise KeyError(INVALID_PATH)
        outcomes.append(float(match["outcome"]))
        node = _find_node(payload, match["next"])

    # Only a completed path is scored: under path_min, every later choice can
    # still lower the mark.
    if not node.get("terminal"):
        raise UnfinishedPath(f"the path stops at {node['id']}, which is not an ending")

    return outcomes


def branching_ending(case: Case, step_key: str, option_ids: list[str],
                     variant_key: str) -> str:
    """The text of the ending a completed path reached, shown once it is scored."""
    payload = case.step(step_key)["payload"]
    node = _find_node(payload, payload["start"])
    for option_id in option_ids:
        match = next(o for o in node.get("options") or [] if o["id"] == option_id)
        node = _find_node(payload, match["next"])
    return substitute(node["text"], case.variant_values(variant_key))


# ---------------------------------------------------------------------------
# The correct answers, once a case is open
# ---------------------------------------------------------------------------

def best_path(nodes: dict, start: str, scoring: str) -> tuple[float, list, dict]:
    """The highest-scoring way through a decision tree, scored as the grader does.

    Ties go to the shorter path. Returns the score, the (node, option) pairs
    along the way and the ending reached.
    """
    best = None

    def walk(node_id, outcomes, trail, seen):
        nonlocal best
        node = nodes[node_id]
        if node.get("terminal") or not node.get("options"):
            if outcomes:
                score = grading.grade_branching(outcomes, scoring).outcome
                rank = (score, -len(trail))
                if best is None or rank > best[0]:
                    best = (rank, score, trail, node)
            return
        for option in node["options"]:
            if option["next"] in seen:
                continue
            walk(option["next"], outcomes + [float(option["outcome"])],
                 trail + [(node, option)], seen | {option["next"]})

    walk(start, [], [], {start})
    if best is None:
        raise ValueError("the decision tree has no reachable ending")
    return best[1], best[2], best[3]


def reveal(case: Case, step_key: str, variant_key: str,
           submission: dict | None = None) -> dict:
    """What a step's correct answer looks like to the person who answered it.

    Sent only after app.reveal_open says the case is open. The submission, when
    given, lets a pattern_check rule say whether this person's text met it.
    """
    step = case.step(step_key)
    values = case.variant_values(variant_key)
    kind = step["kind"]
    payload, answer = step.get("payload") or {}, step.get("answer") or {}

    if kind == "span_select":
        text, targets = extract_spans(substitute(payload["text"], values))
        return {"kind": kind, "targets": [list(t) for t in targets],
                "phrases": [text[s:e] for s, e in targets]}

    if kind == "source_verify":
        return {"kind": kind, "items": [
            {"id": item_id, "exists": bool(entry["exists"]),
             "evidence": substitute(entry.get("evidence", ""), values)}
            for item_id, entry in answer["truth"].items()]}

    if kind == "pattern_check":
        text = (submission or {}).get("submission")
        rules = []
        for group in ("forbidden", "required"):
            for rule in answer.get(group) or []:
                item = {"label": rule["label"], "kind": group}
                if text is not None:
                    hit = grading._matches(rule, text)
                    item["ok"] = (not hit) if group == "forbidden" else hit
                rules.append(item)
        return {"kind": kind, "rules": rules}

    if kind == "reasoned_choice":
        weights = answer.get("reason_weights") or {}
        return {"kind": kind, "correct_option": answer["correct_option"],
                "reasons": [{"id": k, "weight": float(v)} for k, v in weights.items()]}

    if kind == "branching":
        nodes = {n["id"]: n for n in payload["nodes"]}
        scoring = answer.get("scoring", "path_mean")
        outcome, trail, end = best_path(nodes, payload["start"], scoring)
        return {"kind": kind, "outcome": outcome,
                "path": [{"situation": substitute(node["text"], values),
                          "choice": substitute(option["text"], values)}
                         for node, option in trail],
                "ending": substitute(end["text"], values)}

    raise ValueError(f"unknown step kind: {kind}")
