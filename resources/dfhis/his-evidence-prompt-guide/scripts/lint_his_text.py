#!/usr/bin/env python3
"""Static guardrails for HIS prompts and responses.

This linter catches observable failure patterns. It does not judge clinical or
business correctness and never replaces evidence review.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass
class Finding:
    level: str
    code: str
    message: str


REDACTED_VALUES = {"<redacted>", "[redacted]", "***", "${secret_from_env}"}


def looks_redacted(value: str) -> bool:
    normalized = value.strip().strip("'\"").lower()
    return normalized in REDACTED_VALUES or normalized.startswith("${") or "example" in normalized


def secret_findings(text: str) -> list[Finding]:
    findings: list[Finding] = []
    assignment = re.compile(
        r"(?im)\b(password|passwd|api[_-]?key|access[_-]?token|secret|private[_-]?key)\b"
        r"\s*[:=]\s*([^\s,;]+)"
    )
    for match in assignment.finditer(text):
        value = match.group(2)
        if len(value.strip("'\"")) >= 6 and not looks_redacted(value):
            findings.append(Finding("ERROR", "POSSIBLE_SECRET", f"Possible unredacted {match.group(1)} assignment."))
            break

    prefix_patterns = [
        r"\bsk-[A-Za-z0-9_-]{16,}\b",
        r"\bghp_[A-Za-z0-9]{20,}\b",
        r"\bpt-[A-Za-z0-9_-]{20,}\b",
        r"\bAKIA[0-9A-Z]{16}\b",
        r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b",
    ]
    if any(re.search(pattern, text) for pattern in prefix_patterns):
        findings.append(Finding("ERROR", "SECRET_PATTERN", "Text contains a credential-like token pattern."))
    return findings


def lint_prompt(text: str) -> list[Finding]:
    findings = secret_findings(text)
    chinese_trigger = re.search(r"部分相关.{0,20}(必须|都要|全部).{0,20}(加载|读取)", text)
    chinese_negated = bool(
        chinese_trigger and re.search(r"不因|不要|禁止", text[max(0, chinese_trigger.start() - 10) : chinese_trigger.start()])
    )
    if (chinese_trigger and not chinese_negated) or re.search(r"partially relevant.{0,40}(must|load)", text, re.I):
        findings.append(Finding("WARN", "OVERBROAD_SKILL_TRIGGER", "Partially relevant skills are loaded too broadly."))
    if re.search(r"(?:/root/|/Users/[^/]+/)", text):
        findings.append(Finding("WARN", "HARDCODED_ENV_PATH", "Stable prompt contains an environment-specific absolute path."))
    if len(text) >= 500:
        required_concepts = {
            "evidence": r"证据|依据|source",
            "boundary": r"边界|未验证|推断|不确定",
            "failure": r"失败|超时|限流|阻断",
            "security": r"密钥|密码|令牌|敏感|secret|token",
            "authorization": r"授权|权限|只读|修改边界",
        }
        missing = [name for name, pattern in required_concepts.items() if not re.search(pattern, text, re.I)]
        if missing:
            findings.append(Finding("WARN", "MISSING_CORE_CONCEPTS", "Long prompt omits: " + ", ".join(missing)))
    return findings


def lint_response(text: str) -> list[Finding]:
    findings = secret_findings(text)
    if re.search(r"API call failed|HTTP\s*429|timed out|TimeoutError|达到.{0,10}(上限|限额)", text, re.I):
        findings.append(Finding("ERROR", "PROVIDER_ERROR_AS_ANSWER", "Provider/tool error text appears in the delivered response."))
    process_chatter = re.compile(
        r"现在我.{0,20}(拿到|获取|掌握|拥有)|让我.{0,12}(整理|综合|总结)|"
        r"(?:证据|信息).{0,8}(已经|已).{0,8}(足够|充分|完整)|分析完成"
    )
    if process_chatter.search(text):
        findings.append(Finding("WARN", "INTERNAL_PROCESS_CHATTER", "Remove internal progress or scratchpad-style transition text."))
    if re.search(r"(?:用|见|根据)(?:上面|前面|上述).{0,16}(SQL|代码|结果|分析)", text, re.I):
        findings.append(Finding("WARN", "DANGLING_REFERENCE", "Ensure the referenced SQL/code/result exists in the same final response."))
    if re.search(r"`(?:/[^`\n]+|https?://[^`\n]+)`[。；;，,.]", text):
        findings.append(Finding("WARN", "PATH_TRAILING_PUNCTUATION", "Copyable path or URL has trailing punctuation."))
    return findings


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Lint a HIS prompt or response from a file or stdin.")
    parser.add_argument("--kind", choices=("prompt", "response"), required=True)
    parser.add_argument("--json", action="store_true", dest="as_json")
    parser.add_argument("path", nargs="?", default="-")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    text = sys.stdin.read() if args.path == "-" else Path(args.path).read_text(encoding="utf-8")
    findings = lint_prompt(text) if args.kind == "prompt" else lint_response(text)
    if args.as_json:
        print(json.dumps([asdict(item) for item in findings], ensure_ascii=False, indent=2))
    elif findings:
        for item in findings:
            print(f"{item.level} {item.code}: {item.message}")
    else:
        print("PASS")
    if any(item.level == "ERROR" for item in findings):
        return 2
    if findings:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
