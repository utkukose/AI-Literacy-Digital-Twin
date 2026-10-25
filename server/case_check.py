"""Whether a valid case can actually be answered, variant by variant.

The validator checks a case's shape. This answers every variant twice through
the real graders, once as well as possible and once badly, the way the
interface would send the answers: span targets are marked word by word, a
decision is walked node by node. A case passes when the best answer scores full
marks and a poor one scores less.

A writing step is answered with a model answer: the one stored in the case as
`answer.model_answer`, or one passed in by the caller.
"""

from __future__ import annotations

import re

import case_loader as cl
import grading

TRIM_END = re.compile(r"[.,;:!?)\]}»\"']+$")
TRIM_START = re.compile(r"^[(\[{«\"']+")
LIMITS = {"prompt": 420, "span_text": 1400, "citation": 420, "option": 240,
          "reason": 240, "node_text": 700, "context": 900}


def marked_like_the_interface(text: str, targets: list) -> list:
    """The spans the interface sends when the words of each target are tapped."""
    toks = [(m.start(), m.end()) for m in re.finditer(r"\S+", text)]
    picked = sorted({i for s0, e0 in targets
                     for i, (s, e) in enumerate(toks) if s < e0 and e > s0})
    runs, run = [], None
    for i in picked:
        if run and i == run[1] + 1:
            run[1] = i
        else:
            if run:
                runs.append(run)
            run = [i, i]
    if run:
        runs.append(run)
    out = []
    for a, b in runs:
        first, last = text[toks[a][0]:toks[a][1]], text[toks[b][0]:toks[b][1]]
        lead = len(TRIM_START.match(first).group(0)) if TRIM_START.match(first) else 0
        m = TRIM_END.search(last)
        tail = len(m.group(0)) if m else 0
        out.append((toks[a][0] + lead, max(toks[a][0] + lead + 1, toks[b][1] - tail)))
    return out


def best_reason(answer: dict) -> str | None:
    weights = answer.get("reason_weights") or {}
    return max(weights, key=weights.get) if weights else None


def best_path(payload: dict) -> list[str]:
    """Option ids along the highest-scoring path through a branching step."""
    nodes = {n["id"]: n for n in payload["nodes"]}
    node, picked = nodes[payload["start"]], []
    while not node.get("terminal") and len(picked) < 12:
        option = max(node["options"], key=lambda o: o["outcome"])
        picked.append(option["id"])
        node = nodes[option["next"]]
    return picked


def problems(body: dict, model_answer: str | None = None) -> list[str]:
    """Everything that stops this case from being answered as intended."""
    out: list[str] = []
    key = body.get("id", "?")
    case = cl.Case(key=key, locale=body.get("language", "tr"), body=body)

    if len(body.get("context", "")) > LIMITS["context"]:
        out.append(f"context is longer than {LIMITS['context']} characters")

    for st in body.get("steps", []):
        sid, kind = st["id"], st["kind"]
        if len(st.get("prompt", "")) > LIMITS["prompt"]:
            out.append(f"{sid}: prompt is longer than {LIMITS['prompt']} characters")
        for v in case.variant_keys:
            ak = cl.answer_key(case, sid, v)
            client = cl.client_step(case, sid, v, "check")
            if kind == "span_select":
                if len(client["text"]) > LIMITS["span_text"]:
                    out.append(f"{sid}/{v}: passage longer than {LIMITS['span_text']}")
                sel = marked_like_the_interface(client["text"], ak["targets"])
                best = grading.grade_span_select(sel, **ak).outcome
                worst = grading.grade_span_select([], **ak).outcome
            elif kind == "source_verify":
                for it in client["items"]:
                    if len(it["citation"]) > LIMITS["citation"]:
                        out.append(f"{sid}/{v}: item {it['id']} longer than {LIMITS['citation']}")
                truth = {k: e["exists"] for k, e in ak["truth"].items()}
                best = grading.grade_source_verify(truth, ak["truth"]).outcome
                worst = grading.grade_source_verify({k: not x for k, x in truth.items()},
                                                    ak["truth"]).outcome
            elif kind == "pattern_check":
                good = (st.get("answer") or {}).get("model_answer") or model_answer
                if good is None:
                    out.append(f"{sid}: no model answer, so the rules cannot be checked")
                    break
                best = grading.grade_pattern_check(good, **ak).outcome
                worst = grading.grade_pattern_check(client["seed_text"], **ak).outcome
            elif kind == "reasoned_choice":
                a = st["answer"]
                for o in client["options"]:
                    if len(o["text"]) > LIMITS["option"]:
                        out.append(f"{sid}/{v}: option {o['id']} longer than {LIMITS['option']}")
                wrong = next(o["id"] for o in client["options"] if o["id"] != a["correct_option"])
                weights = a.get("reason_weights") or {}
                worst_reason = min(weights, key=weights.get) if weights else None
                best = grading.grade_reasoned_choice(a["correct_option"], best_reason(a), **ak).outcome
                worst = grading.grade_reasoned_choice(wrong, worst_reason, **ak).outcome
            elif kind == "branching":
                payload = st["payload"]
                for n in payload["nodes"]:
                    if len(n.get("text", "")) > LIMITS["node_text"]:
                        out.append(f"{sid}: node {n['id']} longer than {LIMITS['node_text']}")
                path_best = cl.branching_outcome(case, sid, best_path(payload))
                best = grading.grade_branching(path_best, ak["scoring"]).outcome
                nodes = {n["id"]: n for n in payload["nodes"]}
                node, worst_path = nodes[payload["start"]], []
                while not node.get("terminal") and len(worst_path) < 12:
                    o = min(node["options"], key=lambda x: x["outcome"])
                    worst_path.append(o["outcome"])
                    node = nodes[o["next"]]
                worst = grading.grade_branching(worst_path, ak["scoring"]).outcome
            else:
                out.append(f"{sid}: unknown kind {kind}")
                break
            if best < 0.999:
                out.append(f"{sid}/{v}: the best answer scores {best:.2f}, not 1.0")
            if worst >= best:
                out.append(f"{sid}/{v}: a poor answer scores as well as the best one")
    return out
