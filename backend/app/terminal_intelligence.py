"""Terminal log analysis and error detection."""

from __future__ import annotations

import re

ERROR_PATTERNS = [
    ("npm_missing_script", re.compile(r"Missing script:\s*\"?([^\"\n]+)\"?", re.I)),
    ("npm_module_not_found", re.compile(r"Cannot find module '([^']+)'", re.I)),
    ("vite_error", re.compile(r"\[vite\].*(error|failed)", re.I)),
    ("python_traceback", re.compile(r"Traceback \(most recent call last\):", re.I)),
    ("python_syntax", re.compile(r"SyntaxError: (.+)", re.I)),
    ("python_module", re.compile(r"ModuleNotFoundError: No module named '([^']+)'", re.I)),
    ("port_in_use", re.compile(r"EADDRINUSE|address already in use", re.I)),
]


def analyze_terminal_logs(logs: list[dict]) -> dict:
    combined = "\n".join(entry.get("message", "") for entry in logs[-200:])
    findings = []

    for code, pattern in ERROR_PATTERNS:
        match = pattern.search(combined)
        if match:
            findings.append(
                {
                    "code": code,
                    "message": match.group(0).strip(),
                    "detail": match.group(1).strip() if match.lastindex else "",
                }
            )

    failed = any(entry.get("stream") == "stderr" for entry in logs[-20:])
    return {
        "has_errors": bool(findings) or failed,
        "findings": findings,
        "log_lines": len(logs),
        "excerpt": combined[-4000:],
        "suggested_prompt": build_fix_prompt(findings, combined),
    }


def build_fix_prompt(findings: list[dict], combined: str) -> str:
    if not findings and not combined.strip():
        return "Investigate why the project run failed and fix the workspace."

    issue = findings[0]["message"] if findings else combined.splitlines()[-1]
    return (
        "The project run failed. Analyze the terminal output below, identify the root cause, "
        "edit the necessary files, and explain the fix.\n\n"
        f"Issue:\n{issue}\n\nTerminal output:\n{combined[-5000:]}"
    )
