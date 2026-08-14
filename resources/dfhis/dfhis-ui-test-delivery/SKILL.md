---
name: dfhis-ui-test-delivery
description: Execute safe, evidence-backed browser verification for one DFHIS/HIS work item in an isolated Docker sandbox. Use after requirement evidence and code impact are available to create concise UI cases, run a focused Playwright script, and produce screenshots, video, JUnit, logs, and a report. Do not use for requirement archiving, source delivery, builds, releases, API/mobile/load testing, or YGT work.
---

# DFHIS UI Test Delivery

Own only the browser-verification slice of a DFHIS requirement. Let `yunxiao-requirement-archiver` own requirement evidence and worktrees, `his-workflow-harness` own build/release gates, `ui-spec-review` own static UI rules, and `ygt` own YGT verification.

## Prepare

Store generated files outside the skill. Pass an explicit artifact root when a requirement directory exists; otherwise the scripts use `<current-directory>/test-output`.

```bash
python scripts/prepare_artifacts.py DFHIS-31774 --root <artifact-root>
```

Search [references/ui-flow-knowledge.md](references/ui-flow-knowledge.md) before rediscovering navigation. Revalidate the first critical transition against the selected environment.

## Create the verification contract

Use current requirement acceptance wording, developer comments, matching source, and read-only environment observations in that order. Record source strength as `source-confirmed`, `comment-derived`, `environment-observed`, or `inferred`; never present comments as source inspection.

Write 4–10 focused cases to `testcases/testcases.md`. Group by the actual business module, use exact status/parameter values, and give every case one final status: passed, failed, skipped, or blocked with its concrete prerequisite. For blocking rules, assert both the warning and absence of the forbidden downstream page/action.

Copy [assets/ui-test-template.cjs](assets/ui-test-template.cjs) into `automation/` and implement only safe navigation and assertions. Prefer roles, labels, placeholders, exact visible text, and stable application attributes. Do not click Save, Submit, Charge, Dispense, Refund, or another mutation action unless the user explicitly authorizes it and a named test subject plus cleanup are confirmed.

## Run in the sandbox

The Mac only starts the job and receives artifacts. The Node test script, Playwright, and headless Chromium run inside Docker.

```bash
# Default: isolated Docker on 192.168.1.10
ORCA_RELEASE_SSH_PASSWORD='...' \
python scripts/run_container_ui_test.py setup --backend remote --base-url http://192.168.1.151:8015/

ORCA_RELEASE_SSH_PASSWORD='...' \
python scripts/run_container_ui_test.py run DFHIS-31774 \
  <artifact-root>/DFHIS-31774/automation/test_dfhis_31774.cjs \
  --root <artifact-root> --backend remote --base-url http://192.168.1.151:8015/

# Fast fallback: Docker Desktop; never the macOS desktop browser
python scripts/run_container_ui_test.py run DFHIS-31774 \
  <artifact-root>/DFHIS-31774/automation/test_dfhis_31774.cjs \
  --root <artifact-root> --backend local --base-url http://192.168.1.151:8015/
```

Set credentials only in `DFHIS_USERNAME` and `DFHIS_PASSWORD`; the runner transfers them through a mode-0600 environment file, never command arguments or reports. Override the remote target with `DFHIS_UI_SANDBOX_REMOTE`, image with `DFHIS_UI_SANDBOX_IMAGE`, and backend with `DFHIS_UI_SANDBOX_BACKEND`.

The runner uses an ephemeral, resource-limited, capability-dropped, read-only-root container and always removes its remote workspace. Browser execution is bounded to 300 seconds by default; override it with `--timeout-seconds` or `DFHIS_UI_SANDBOX_TIMEOUT_SECONDS`. It writes `reports/results.xml`, `reports/sandbox-run.json`, `logs/browser-test.log`, screenshots, videos, and network evidence back under the work-item directory.

Generate the summary after execution:

```bash
python scripts/build_report.py DFHIS-31774 --root <artifact-root>
```

For qiankun flows, also prove the target micro-app container is visible and mounted, record successful entry/config/asset requests, and show the target business page in the final screenshot. Shell reachability alone is not E2E proof.

## Completion gate

- Every generated case has an explicit execution status.
- The final diff, selected environment, container backend, and limitations are named.
- Screenshot/video/JUnit/log/network paths exist and contain no credentials or tokens.
- No unauthorized business mutation occurred.
- Reusable navigation was added to or corrected in the UI-flow knowledge base.
- The HIS workflow report links this run as `e2e` evidence; build or HTTP smoke is not substituted for it.
