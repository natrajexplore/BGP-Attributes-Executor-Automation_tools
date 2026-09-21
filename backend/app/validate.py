from __future__ import annotations

import difflib
import re


def assert_regex(pattern: str, text: str) -> bool:
    return re.search(pattern, text or "", re.IGNORECASE | re.MULTILINE) is not None


def diff(before: str, after: str, label: str = "") -> str:
    lines = list(
        difflib.unified_diff(
            (before or "").splitlines(),
            (after or "").splitlines(),
            fromfile=f"{label} before",
            tofile=f"{label} after",
            lineterm="",
        )
    )
    return "\n".join(lines)


def evaluate(verify: list[dict], captured: dict[str, str]) -> list[dict]:
    """verify: [{device, command, expect_regex, [must_not_match]}] -> results"""
    results = []
    for v in verify:
        key = f"{v['device']} :: {v['command']}"
        text = captured.get(key, "")
        ok = True
        reasons = []
        if v.get("expect_regex"):
            hit = assert_regex(v["expect_regex"], text)
            ok = ok and hit
            if not hit:
                reasons.append(f"missing /{v['expect_regex']}/")
        if v.get("must_not_match"):
            miss = not assert_regex(v["must_not_match"], text)
            ok = ok and miss
            if not miss:
                reasons.append(f"unexpected /{v['must_not_match']}/")
        results.append(
            {"device": v["device"], "command": v["command"], "passed": ok,
             "reason": "; ".join(reasons) or "ok", "output": text}
        )
    return results
