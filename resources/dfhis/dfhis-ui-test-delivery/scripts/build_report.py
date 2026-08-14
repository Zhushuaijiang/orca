from __future__ import annotations

import argparse
import json
import os
import re
import xml.etree.ElementTree as ET
from pathlib import Path


def default_root() -> Path:
    configured = os.getenv("TEST_ARTIFACT_ROOT", "").strip()
    return Path(configured).expanduser() if configured else Path.cwd() / "test-output"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a Markdown report from DFHIS JUnit evidence")
    parser.add_argument("work_item_id")
    parser.add_argument("--root", type=Path)
    args = parser.parse_args()

    work_item = args.work_item_id.strip().upper()
    if not re.fullmatch(r"DFHIS-\d+", work_item):
        parser.error("work_item_id must look like DFHIS-31774")
    work_root = (args.root or default_root()).resolve() / work_item
    xml_path = work_root / "reports" / "results.xml"
    if not xml_path.is_file():
        parser.error(f"JUnit report not found: {xml_path}")

    tree = ET.parse(xml_path)
    suites = list(tree.getroot().findall("testsuite")) if tree.getroot().tag == "testsuites" else [tree.getroot()]
    total = sum(int(item.attrib.get("tests", 0)) for item in suites)
    failures = sum(int(item.attrib.get("failures", 0)) + int(item.attrib.get("errors", 0)) for item in suites)
    skipped = sum(int(item.attrib.get("skipped", 0)) for item in suites)
    failed_rows = []
    for testcase in tree.iter("testcase"):
        failure = testcase.find("failure")
        if failure is None:
            failure = testcase.find("error")
        if failure is not None:
            message = (failure.attrib.get("message") or failure.text or "").strip().replace("\n", " ")[:500]
            failed_rows.append((testcase.attrib.get("name", "unknown"), message))

    sandbox_path = work_root / "reports" / "sandbox-run.json"
    sandbox = json.loads(sandbox_path.read_text(encoding="utf-8")) if sandbox_path.is_file() else {}
    evidence = sorted(path for path in (work_root / "evidence").rglob("*") if path.is_file())
    lines = [
        f"# {work_item} 自动化执行报告", "", "## 执行结论", "",
        f"- 总计：{total}", f"- 通过：{total - failures - skipped}", f"- 失败：{failures}",
        f"- 跳过：{skipped}", f"- 沙箱：{sandbox.get('backend', 'unknown')}",
        f"- 镜像：{sandbox.get('image', 'unknown')}",
        f"- 镜像 ID：{sandbox.get('imageId', 'unknown')}", "",
    ]
    if failed_rows:
        lines.extend(["## 失败明细", ""])
        lines.extend(f"- `{name}`：{message}" for name, message in failed_rows)
        lines.append("")
    lines.extend(["## 证据文件", ""])
    lines.extend(f"- `{path.relative_to(work_root)}`" for path in evidence)
    if not evidence:
        lines.append("- 未生成浏览器证据。")
    lines.extend(["", "## 人工补充", "", "- 预期与实际：", "- 未执行场景及原因：", "- 是否发生业务写入：否（默认安全模式）", ""])

    report = work_root / "reports" / "automation-report.md"
    report.write_text("\n".join(lines), encoding="utf-8")
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
