#!/usr/bin/env python3
"""Case schema validator for the SDU AI Literacy Platform.

Usage:
    python validate_case.py cases/weekly/2026/2026-W34-fabricated-citation.yaml
    python validate_case.py cases/ --recursive
"""

import argparse
import re
import sys
from pathlib import Path
from re import _constants as RE_OPS
from re import _parser as RE_PARSER

import yaml

SCHEMA_VERSION = 1

DIMENSIONS = {
    "prompt_design",
    "verification",
    "integrity",
    "privacy",
    "manipulation",
    "op_security",
    "boundaries",
}

STEP_KINDS = {
    "span_select",
    "source_verify",
    "pattern_check",
    "reasoned_choice",
    "branching",
}

STATUSES = {"draft", "review", "scheduled", "live", "archived"}

SUPPORTED_LOCALES = ("tr", "en")

TOP_LEVEL_REQUIRED = [
    "schema_version",
    "id",
    "title",
    "type",
    "status",
    "faculty_scope",
    "estimated_minutes",
    "language",
    "author",
    "context",
    "variants",
    "steps",
    "debrief",
]

STEP_REQUIRED = [
    "id",
    "kind",
    "dimension",
    "points",
    "confidence",
    "prompt",
    "payload",
    "answer",
    "feedback",
]

PLACEHOLDER = re.compile(r"\{\{\s*([a-z0-9_]+)\s*\}\}")
SPAN_MARKER = re.compile(r"\[\[(.+?)\]\]", re.DOTALL)
# A key identifies a case and need not encode when the case runs. The dated
# form suits a case tied to a particular week and uses a capital W, which the
# general rule allows.
ID_KEY = re.compile(r"^[a-z0-9][A-Za-z0-9-]{4,60}$")
ID_DATED = re.compile(r"^\d{4}-W\d{2}-[a-z0-9-]+$")
ID_CORE = re.compile(r"^core-\d{2}-[a-z0-9-]+$")

# core     the handful everyone does, whenever they arrive
# weekly   featured for one week, with a window
# open     simply available; publish as many as you like, whenever
CASE_TYPES = {"core", "weekly", "open"}

AUDIENCES = {"student", "academic", "admin_staff"}

# Where on the campus map a case is set: the number of a building on the
# printed campus map, or one of the spots the map marks without a number.
# Left out for a case set off the campus, at home or on a train.
PLACE_NUMBERS = range(1, 58)
PLACE_SPOTS = ("amphi", "bus", "cafe", "dorm", "gate", "print", "sport")


def place_of(value) -> str | None:
    """The place as the map names it, or None when the value names no place."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int) or (isinstance(value, str) and value.isdigit()):
        return str(int(value)) if int(value) in PLACE_NUMBERS else None
    return value if value in PLACE_SPOTS else None


class Report:
    def __init__(self, path):
        self.path = path
        self.errors = []
        self.warnings = []

    def error(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)

    @property
    def ok(self):
        return not self.errors


def walk_strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for value in node.values():
            yield from walk_strings(value)
    elif isinstance(node, list):
        for value in node:
            yield from walk_strings(value)


def check_top_level(case, path, rep):
    """The fields every case carries. A draft in the editor has no file, so
    the checks that compare the case with its file name are left out."""
    for field in TOP_LEVEL_REQUIRED:
        if field not in case:
            rep.error(f"missing top-level field: {field}")

    if case.get("schema_version") != SCHEMA_VERSION:
        rep.error(f"schema_version must be {SCHEMA_VERSION}")

    title = case.get("title")
    if not isinstance(title, str) or not title.strip():
        rep.error("title must be a non-empty text")

    case_id = case.get("id", "")
    if not isinstance(case_id, str):
        rep.error("id must be a text")
        case_id = ""
    if path is not None:
        # Filenames carry the locale: <case-id>.<locale>.yaml
        stem, _, locale = path.stem.rpartition(".")
        if locale not in SUPPORTED_LOCALES:
            rep.error(f"filename must end in .{{{'|'.join(SUPPORTED_LOCALES)}}}.yaml")
            stem = path.stem
        elif case.get("language") != locale:
            rep.error(f"language '{case.get('language')}' does not match filename locale '{locale}'")
        if case_id != stem:
            rep.error(f"id '{case_id}' does not match filename stem '{stem}'")

    case_type = case.get("type")
    if case_type not in CASE_TYPES:
        rep.error(f"type must be one of {sorted(CASE_TYPES)}: '{case_type}'")
    elif case_type == "core" and not ID_CORE.match(case_id):
        rep.error(f"core id must match core-NN-slug: '{case_id}'")
    elif not ID_KEY.match(case_id):
        rep.error("id must start with a lowercase letter or a digit and use only letters, digits"
                  f" and hyphens, 5-61 characters: '{case_id}'")

    if case.get("status") not in STATUSES:
        rep.error(f"invalid status: '{case.get('status')}'")

    # Optional: who the case is written for. Used as the audience when the case
    # is first published; the panel can change it afterwards.
    if "audience" in case:
        audience = case.get("audience")
        if (not isinstance(audience, list) or not audience
                or not set(audience) <= AUDIENCES):
            rep.error(f"audience must be a non-empty list drawn from {sorted(AUDIENCES)}")

    if case_type == "weekly":
        # A weekly case is one that is featured for a week, so it needs the
        # window. An open case may have one and does not need one.
        publish, close = case.get("publish_at"), case.get("close_at")
        if not publish or not close:
            rep.error("weekly cases require publish_at and close_at")
        elif str(publish) >= str(close):
            rep.error("publish_at must precede close_at")

    minutes = case.get("estimated_minutes")
    if isinstance(minutes, int) and minutes > 20:
        rep.warn(f"estimated_minutes is {minutes}; target is 12-15")

    if case.get("place") is not None and place_of(case.get("place")) is None:
        rep.error(f"place must be a building number on the campus map "
                  f"({PLACE_NUMBERS.start}-{PLACE_NUMBERS.stop - 1}) or one of "
                  f"{', '.join(PLACE_SPOTS)}: '{case.get('place')}'")


def check_variants(case, rep):
    variants = case.get("variants") or []
    if not isinstance(variants, list) or not variants:
        rep.error("variants must be a non-empty list")
        return set()

    if case.get("type") == "weekly" and len(variants) < 3:
        rep.error(f"weekly cases need at least 3 variants, found {len(variants)}")

    key_sets = []
    seen_keys = set()
    for i, variant in enumerate(variants):
        key = variant.get("key")
        if not key:
            rep.error(f"variant #{i} has no key")
        elif key in seen_keys:
            rep.error(f"duplicate variant key: {key}")
        else:
            seen_keys.add(key)
        key_sets.append(set((variant.get("values") or {}).keys()))

    if key_sets and any(k != key_sets[0] for k in key_sets[1:]):
        rep.error("all variants must define the same value keys")

    return key_sets[0] if key_sets else set()


def check_placeholders(case, defined_keys, rep):
    used = set()
    for text in walk_strings(case.get("steps") or []):
        used.update(PLACEHOLDER.findall(text))
    # The title, the opening text and the solution note are filled in with the
    # person's variant as well, so a placeholder there has to be defined too.
    for part in ("title", "context", "debrief"):
        for text in walk_strings(case.get(part) or ""):
            used.update(PLACEHOLDER.findall(text))

    for name in sorted(used - defined_keys):
        rep.error(f"placeholder {{{{{name}}}}} is not defined in variants")
    for name in sorted(defined_keys - used):
        rep.warn(f"variant value '{name}' is never used")


ANSWER_MARKERS = re.compile(
    r"(\(\s*doğru(\s+(cevap|yanıt|seçenek))?\s*\)"
    r"|\[\s*correct\s*\]"
    r"|\bdoğru\s+cevap\s*[:=]"
    r"|\bcorrect\s+answer\s*[:=]"
    r"|✓|✔)",
    re.I,
)


def check_answer_not_leaked(step, rep):
    for text in walk_strings(step.get("payload") or {}):
        match = ANSWER_MARKERS.search(text)
        if match:
            rep.error(
                f"step {step.get('id')}: payload contains an answer marker "
                f"('{match.group(0).strip()}'); the client must not receive it"
            )
            return


def check_span_select(step, rep):
    payload = step.get("payload") or {}
    text = payload.get("text", "")
    if "[[" in text or "]]" in text:
        opens, closes = text.count("[["), text.count("]]")
        if opens != closes:
            rep.error(f"step {step['id']}: unbalanced [[ ]] markers ({opens} vs {closes})")
    targets = SPAN_MARKER.findall(text)
    if not targets:
        rep.error(f"step {step['id']}: span_select has no [[...]] targets")
    min_sel = payload.get("min_selections", 1)
    max_sel = payload.get("max_selections")
    if max_sel is not None and len(targets) > max_sel:
        rep.error(f"step {step['id']}: {len(targets)} targets exceeds max_selections {max_sel}")
    if min_sel > len(targets):
        rep.error(f"step {step['id']}: min_selections {min_sel} exceeds target count {len(targets)}")


def check_source_verify(step, rep):
    items = (step.get("payload") or {}).get("items") or []
    truth = (step.get("answer") or {}).get("truth") or {}
    item_ids = {item.get("id") for item in items}
    if not item_ids:
        rep.error(f"step {step['id']}: source_verify has no items")
    missing = item_ids - set(truth)
    extra = set(truth) - item_ids
    if missing:
        rep.error(f"step {step['id']}: no truth entry for {sorted(missing)}")
    if extra:
        rep.error(f"step {step['id']}: truth entry for unknown items {sorted(extra)}")
    for item_id, entry in truth.items():
        if "exists" not in entry:
            rep.error(f"step {step['id']}: truth.{item_id} missing 'exists'")
        if not entry.get("evidence"):
            rep.error(f"step {step['id']}: truth.{item_id} missing 'evidence'")
    real = sum(1 for e in truth.values() if e.get("exists"))
    if truth and (real == 0 or real == len(truth)):
        rep.warn(f"step {step['id']}: all items share the same truth value")


def check_pattern_check(step, rep):
    answer = step.get("answer") or {}
    groups = ("forbidden", "required")
    if not any(answer.get(g) for g in groups):
        rep.error(f"step {step['id']}: pattern_check needs forbidden or required constraints")
    for group in groups:
        for constraint in answer.get(group) or []:
            pattern = constraint.get("pattern")
            if not pattern:
                rep.error(f"step {step['id']}: {group} constraint without pattern")
                continue
            try:
                re.compile(pattern)
            except re.error as exc:
                rep.error(f"step {step['id']}: invalid regex '{pattern}': {exc}")
            else:
                if slow_pattern(pattern):
                    rep.error(f"step {step['id']}: regex '{pattern}' repeats a repetition"
                              " or an alternation and can take very long on some answers")
            if not constraint.get("label"):
                rep.error(f"step {step['id']}: constraint '{pattern}' has no label")


def slow_pattern(pattern: str) -> bool:
    r"""Whether a pattern repeats, without limit, something that can itself match
    in more than one way: another unbounded repetition or an alternation, as in
    (\w+\s?)* or (a|aa)+. Such a pattern can take exponential time on an
    answer that almost matches, and every answer of every student runs it."""
    def walk(sub, inside: bool) -> bool:
        for op, av in sub:
            if op in (RE_OPS.MAX_REPEAT, RE_OPS.MIN_REPEAT):
                low, high, body = av
                unbounded = high == RE_OPS.MAXREPEAT
                if inside and unbounded:
                    return True
                if walk(body, inside or unbounded):
                    return True
            elif op == RE_OPS.SUBPATTERN:
                if walk(av[3], inside):
                    return True
            elif op == RE_OPS.BRANCH:
                if inside:
                    return True
                if any(walk(alt, inside) for alt in av[1]):
                    return True
            elif op in (RE_OPS.ASSERT, RE_OPS.ASSERT_NOT):
                if walk(av[1], inside):
                    return True
        return False
    return walk(RE_PARSER.parse(pattern), False)


def check_reasoned_choice(step, rep):
    payload = step.get("payload") or {}
    answer = step.get("answer") or {}
    option_ids = {o.get("id") for o in payload.get("options") or []}
    reason_ids = {r.get("id") for r in payload.get("reasons") or []}

    if len(option_ids) < 2:
        rep.error(f"step {step['id']}: needs at least 2 options")
    if answer.get("correct_option") not in option_ids:
        rep.error(f"step {step['id']}: correct_option not among options")

    if payload.get("require_reason"):
        weights = answer.get("reason_weights") or {}
        if set(weights) != reason_ids:
            rep.error(f"step {step['id']}: reason_weights must cover exactly the listed reasons")
        if weights and max(weights.values()) < 1.0:
            rep.error(f"step {step['id']}: no reason carries full weight")
    weight = answer.get("option_weight", 0.5)
    if not 0 <= weight <= 1:
        rep.error(f"step {step['id']}: option_weight must be in [0, 1]")


def check_branching(step, rep):
    payload = step.get("payload") or {}
    nodes = {n.get("id"): n for n in payload.get("nodes") or []}
    start = payload.get("start")

    if start not in nodes:
        rep.error(f"step {step['id']}: start node '{start}' not defined")
        return

    reachable, stack = set(), [start]
    while stack:
        node_id = stack.pop()
        if node_id in reachable:
            continue
        reachable.add(node_id)
        node = nodes[node_id]
        options = node.get("options") or []
        if node.get("terminal"):
            if options:
                rep.error(f"step {step['id']}: terminal node '{node_id}' has options")
            continue
        if not options:
            rep.error(f"step {step['id']}: non-terminal node '{node_id}' has no options")
        for option in options:
            nxt = option.get("next")
            if nxt not in nodes:
                rep.error(f"step {step['id']}: option '{option.get('id')}' points to unknown node '{nxt}'")
                continue
            outcome = option.get("outcome")
            if not isinstance(outcome, (int, float)) or not 0 <= outcome <= 1:
                rep.error(f"step {step['id']}: option '{option.get('id')}' outcome must be in [0, 1]")
            stack.append(nxt)

    for node_id in set(nodes) - reachable:
        rep.error(f"step {step['id']}: node '{node_id}' is unreachable")
    # Every way through the tree is walked when the answers are shown, so the
    # tree is kept small and may not loop back on itself.
    if any(len(n.get("options") or []) > BRANCH_LIMITS["options"] for n in nodes.values()):
        rep.error(f"step {step['id']}: a node offers more than {BRANCH_LIMITS['options']} options")
    if len(nodes) > BRANCH_LIMITS["nodes"]:
        rep.error(f"step {step['id']}: more than {BRANCH_LIMITS['nodes']} nodes")
    else:
        # Counted only for a tree within the node limit, so the walk stays short.
        paths = _count_paths(nodes, start)
        if paths is None:
            rep.error(f"step {step['id']}: the decision tree loops back on itself")
        elif paths > BRANCH_LIMITS["paths"]:
            rep.error(f"step {step['id']}: more than {BRANCH_LIMITS['paths']} ways through the tree")
    if not any(nodes[n].get("terminal") for n in reachable):
        rep.error(f"step {step['id']}: no terminal node is reachable")
    if (step.get("answer") or {}).get("scoring") not in {"path_mean", "path_min"}:
        rep.error(f"step {step['id']}: scoring must be path_mean or path_min")
    if step.get("confidence"):
        rep.error(f"step {step['id']}: a branching step does not ask for confidence"
                  " (set confidence: false)")


BRANCH_LIMITS = {"nodes": 30, "options": 5, "paths": 200}


def _count_paths(nodes: dict, start: str) -> int | None:
    """The number of ways from the start to an ending, or None when a way
    leads back to a node already on it."""
    counted: dict[str, int] = {}

    def count(node_id: str, on_path: frozenset) -> int | None:
        if node_id in on_path:
            return None
        if node_id in counted:
            return counted[node_id]
        node = nodes.get(node_id) or {}
        options = [o for o in node.get("options") or [] if o.get("next") in nodes]
        if node.get("terminal") or not options:
            counted[node_id] = 1
            return 1
        total = 0
        for option in options:
            n = count(option["next"], on_path | {node_id})
            if n is None:
                return None
            total += n
        counted[node_id] = total
        return total

    return count(start, frozenset())


KIND_CHECKS = {
    "span_select": check_span_select,
    "source_verify": check_source_verify,
    "pattern_check": check_pattern_check,
    "reasoned_choice": check_reasoned_choice,
    "branching": check_branching,
}


def check_steps(case, rep):
    steps = case.get("steps")
    if steps is not None and not isinstance(steps, list):
        raise Unreadable("list:steps")
    if not steps:
        rep.error("case has no steps")
        return []

    seen = set()
    for index, step in enumerate(steps, start=1):
        if not isinstance(step, dict):
            raise Unreadable(f"step:{index}")
        try:
            _check_step(step, seen, rep)
        except SHAPE_ERRORS:
            raise Unreadable(f"step:{index}") from None

    return sorted(seen)


def _check_step(step, seen, rep):
    step_id = step.get("id")
    if not step_id:
        rep.error("step without id")
        return
    if not isinstance(step_id, str):
        raise TypeError("a step id is a text")
    if step_id in seen:
        rep.error(f"duplicate step id: {step_id}")
    seen.add(step_id)

    for field in STEP_REQUIRED:
        if field not in step:
            rep.error(f"step {step_id}: missing field '{field}'")

    if step.get("dimension") not in DIMENSIONS:
        rep.error(f"step {step_id}: unknown dimension '{step.get('dimension')}'")

    kind = step.get("kind")
    if kind not in STEP_KINDS:
        rep.error(f"step {step_id}: unknown kind '{kind}'")
        return

    points = step.get("points")
    if not isinstance(points, int) or not 1 <= points <= 10:
        rep.error(f"step {step_id}: points must be an integer in 1..10")

    feedback = step.get("feedback") or {}
    for key in ("correct", "incorrect"):
        if not feedback.get(key):
            rep.error(f"step {step_id}: feedback.{key} is empty")

    check_answer_not_leaked(step, rep)
    KIND_CHECKS[kind](step, rep)


# A case written by hand can put a value of the wrong type anywhere: a list
# where a text belongs, a number where a mapping does. The checks read each part
# by the type it should have, so such a value stops them.
SHAPE_ERRORS = (AttributeError, KeyError, TypeError, ValueError, IndexError)


class Unreadable(Exception):
    """A part of the case holds a value of a type the checks cannot read.

    `part` names it: case, variants, texts or debrief for a value inside that
    part, step:<n> for one inside the n-th step, and list:variants, list:steps
    or map:debrief when the part itself is not a list or a mapping.
    """

    def __init__(self, part: str):
        super().__init__(part)
        self.part = part


def check_case(case, rep, path=None):
    """Every check on the content of a case, and its step ids.

    A draft in the editor has no file, so without `path` the checks that
    compare a case with its file name are left out. Raises Unreadable when a
    part holds a value of the wrong type: the editor refuses such a body rather
    than saving one it could not show.
    """
    def part(name, check):
        try:
            return check()
        except SHAPE_ERRORS:
            raise Unreadable(name) from None

    for name, kind, label in (("variants", list, "list:variants"),
                              ("steps", list, "list:steps"),
                              ("debrief", dict, "map:debrief")):
        if case.get(name) is not None and not isinstance(case[name], kind):
            raise Unreadable(label)
    part("case", lambda: check_top_level(case, path, rep))
    defined = part("variants", lambda: check_variants(case, rep))
    part("texts", lambda: check_placeholders(case, defined, rep))
    step_ids = check_steps(case, rep)
    part("debrief", lambda: check_debrief(case, step_ids, rep))
    return step_ids


def check_debrief(case, step_ids, rep):
    debrief = case.get("debrief") or {}
    for key in ("summary", "takeaway", "sources"):
        if not debrief.get(key):
            rep.error(f"debrief.{key} is empty")

    per_step = debrief.get("per_step") or {}
    for step_id in step_ids:
        if not per_step.get(step_id):
            rep.error(f"debrief.per_step missing entry for step '{step_id}'")
    for step_id in set(per_step) - set(step_ids):
        rep.error(f"debrief.per_step has entry for unknown step '{step_id}'")

    for source in debrief.get("sources") or []:
        if "http" not in source and "doi" not in source.lower():
            rep.warn(f"debrief source has no resolvable link: {source[:60]}")


def check_review_gate(case, rep):
    if case.get("status") != "live":
        return
    reviewer = (case.get("reviewed_by") or "").strip()
    if not reviewer:
        rep.error("status is 'live' but reviewed_by is empty")
    elif reviewer == (case.get("author") or "").strip():
        rep.error("reviewed_by must differ from author")


def validate(path):
    rep = Report(path)
    try:
        case = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        rep.error(f"YAML parse error: {exc}")
        return rep

    if not isinstance(case, dict):
        rep.error("top level must be a mapping")
        return rep

    try:
        check_case(case, rep, path)
    except Unreadable as exc:
        rep.error(f"a value of the wrong type in {exc.part}")
        return rep
    check_review_gate(case, rep)
    return rep


def check_locale_parity(paths, rep_by_path):
    """Localized bodies of one case must be structurally identical.

    A single difficulty estimate is shared across locales. If the English body
    of a step has four references where the Turkish has five, the two are
    different steps sharing a name and the estimate describes neither.
    """
    from collections import defaultdict
    groups = defaultdict(dict)
    for path in paths:
        stem, _, locale = path.stem.rpartition(".")
        if locale in SUPPORTED_LOCALES:
            groups[stem][locale] = path

    for stem, by_locale in groups.items():
        if len(by_locale) < 2:
            continue
        shapes = {}
        for locale, path in sorted(by_locale.items()):
            case = yaml.safe_load(path.read_text(encoding="utf-8"))
            shapes[locale] = _structure(case)

        reference_locale, reference = next(iter(shapes.items()))
        for locale, shape in list(shapes.items())[1:]:
            if shape == reference:
                continue
            differing = sorted(
                k for k in set(shape) | set(reference)
                if shape.get(k) != reference.get(k)
            )
            rep_by_path[by_locale[locale]].error(
                f"structure differs from {reference_locale} at: {differing}"
            )


def _structure(case):
    """Wording-independent fingerprint used for cross-locale comparison."""
    out = {"variants": sorted(v.get("key") for v in case.get("variants") or []),
           "place": place_of(case.get("place"))}
    for step in case.get("steps") or []:
        payload = step.get("payload") or {}
        answer = step.get("answer") or {}
        kind = step.get("kind")

        if kind == "span_select":
            detail = ("targets", len(SPAN_MARKER.findall(payload.get("text", ""))))
        elif kind == "source_verify":
            truth = answer.get("truth") or {}
            detail = ("items", len(payload.get("items") or []),
                      "real", sum(1 for v in truth.values() if v.get("exists")))
        elif kind == "pattern_check":
            detail = ("forbidden", len(answer.get("forbidden") or []),
                      "required", len(answer.get("required") or []))
        elif kind == "reasoned_choice":
            detail = ("options", len(payload.get("options") or []),
                      "reasons", len(payload.get("reasons") or []),
                      "correct", answer.get("correct_option"))
        elif kind == "branching":
            detail = ("nodes", len(payload.get("nodes") or []),
                      "scoring", answer.get("scoring"))
        else:
            detail = ()

        out[step.get("id")] = (kind, step.get("dimension"), step.get("points"), detail)
    return out


def main():
    parser = argparse.ArgumentParser(description="Validate case YAML files.")
    parser.add_argument("target", type=Path)
    parser.add_argument("--recursive", action="store_true")
    parser.add_argument("--strict", action="store_true", help="treat warnings as failures")
    args = parser.parse_args()

    if args.target.is_dir():
        pattern = "**/*.yaml" if args.recursive else "*.yaml"
        paths = sorted(args.target.glob(pattern))
    else:
        paths = [args.target]

    if not paths:
        print("no case files found")
        return 1

    reports = {path: validate(path) for path in paths}
    check_locale_parity(paths, reports)

    failed = 0
    for path in paths:
        rep = reports[path]
        status = "PASS" if rep.ok else "FAIL"
        print(f"[{status}] {path}")
        for msg in rep.errors:
            print(f"    error: {msg}")
        for msg in rep.warnings:
            print(f"    warn:  {msg}")
        if not rep.ok or (args.strict and rep.warnings):
            failed += 1

    print(f"\n{len(paths) - failed}/{len(paths)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
