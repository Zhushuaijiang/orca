---
name: ygt-workflow-harness
description: Use when handling YGT platform requirements, bugs, repository sync, layout issues, visual/E2E verification, deployment requests, Jenkins rollout checks, or multi-project agent work in df-ygt-main and related df-ygt business repos.
---

# YGT Workflow Harness

## Overview

Use the YGT workflow harness as the first coordination layer for this project. A user should be able to describe a requirement or problem in one sentence; the harness decides which Superpowers-style skill applies, which YGT project is affected, and which deterministic commands should run next.

Core principle: let scripts decide repeatable workflow steps, and reserve model judgment for design, root cause analysis, code changes, and final review.

## First Command

For any YGT task, run intake before exploring broadly. In Codex, the user can invoke the companion `$ygt` skill or start a message with `/ygt ...`; treat the rest of the message as the request and use the harness alias:

```bash
node scripts/harness/ygt-workflow.mjs /ygt "<user request>" --project auto --json
```

The explicit command is equivalent:

```bash
node scripts/harness/ygt-workflow.mjs intake --request "<user request>" --project auto --json
```

The harness auto-resolves YGT credentials from existing environment variables, ignored local env files, and the installed `dfhis-company-environment` reference when present. Do not ask the user to manually configure environment variables on a new machine unless all automatic sources are missing or an override is required.

Read the JSON and follow:

- `primarySkill`: the Superpowers skill mindset to apply first.
- `skills`: additional applicable Superpowers skills.
- `projects`: YGT projects likely affected.
- `standards`: required development guides and layout constraints to read before code edits.
- `commands`: deterministic harness commands to run next.
- `notes`: multi-agent or safety constraints.

## Standards Gate

Before code edits, read the standards returned by `intake.standards`.

- All tasks: `docs/03-AI协作指南.md` and `docs/04-YGT工作流Harness.md`.
- Frontend/UI tasks: `docs/前端开发指南/README.md`, `06-DevExtreme集成.md`, `07-编码规范与测试.md`, and `08-布局系统.md`.
- Backend/API/database/deployment tasks: `docs/后端开发指南/README.md` plus `01` through `04`.
- Layout/spacing/search/actions/popup/table tasks: `../../df-base/df-web-base/packages/ui/src/layouts/README.md` and `../../df-base/df-web-base/packages/ui/src/layouts/STYLE_CONSTRAINTS.md`.

Do not fix layout consistency with page-local style piles when shared layout primitives or constraints cover the case. If an implementation changes the standard, update the relevant standard file in the same task.

## Project Routing Gate

Treat `intake.projects` as a starting hypothesis. If a screenshot, URL, route, API prefix, or searched code points to a different subapp or service, verify with route/API searches and work in the actual owning repo. Record the mismatch in the final evidence.

For concrete business routes, search the business app before editing `df-ygt-main` shell code. Shell edits are for auth, permissions, menu registration, qiankun loading, shared context, and portal aggregation.

## Repository Sync Gate

For pull/sync requests, enumerate nested repos and inspect each repo for dirty files, unresolved conflicts, and ahead/behind divergence before pulling. Pull only clean repos with `git pull --ff-only`; skip conflicted or diverged repos and report their exact status.

## Visual E2E Gate

For DevExtreme popup, dropdown, datebox, tagbox, or HtmlEditor toolbar issues, inspect existing project patterns and DevExtreme types/source when option behavior is unclear. Inside dialogs, attach overlay dropdowns to the current popup container and close select-like toolbar controls after selection or focus loss when stale dropdowns reproduce. Avoid z-index-only fixes.

When the user asks for automatic page opening, screenshots, or visual interaction regression coverage, prefer deterministic Playwright E2E in the affected frontend. Mock backend APIs and login-dependent data, auto-start the local dev server, keep screenshots/reports in ignored artifact directories, expose a harness-discoverable script such as `e2e`, and verify with E2E plus lint/test/build and harness `verify`/`review`.

For YGT qiankun subapp changes, prefer the online/company shell from `YGT_MAIN_URL` plus the changed local subapp. Derive `subapp-name`, dev port, `activeRule`, target route, and expected text from the current subapp and shell `src/micro/apps.ts`; do not reuse values from another subapp. If no integrated screenshot E2E exists, scaffold one:

```bash
node scripts/harness/ygt-qiankun-e2e.mjs scaffold \
  --repo /path/to/<df-web-ygt-subapp> \
  --subapp-name <micro-app-name> \
  --subapp-entry http://localhost:<dev-port> \
  --active-rule /<active-rule> \
  --route /<active-rule>/<target-page-route> \
  --expect-text <target-page-visible-text> \
  --update-package-script
```

The generated spec seeds `sessionStorage.devDebug='test'` and `sessionStorage[<subapp-name>] = <local-entry>`, launches persistent Chrome with cross-origin flags on macOS/Windows, opens the target route or menu, screenshots the shell and mounted page, and fails unless `#micro-container` is visible, local subapp index/assets respond successfully, target route/text match, and qiankun/bootstrap/mount/CORS errors are absent. Use environment variables only as overrides for selectors or credentials; the harness should resolve company defaults from the installed environment reference.

For interaction bugs, encode the exact user path, including initial state and negative expectations. Cover "nothing should open", "opening should remain stable", and "click outside should close" separately when they are distinct behaviors. Inspect saved screenshots after automation.

For DevExtreme HtmlEditor toolbar controls under qiankun, do not rely on global `DevExpress`, forced DOM removal, or position-only workarounds. Prefer recording the actual component instance during initialization or using stable component options/events. Validate both standalone local mode and the integrated main-app route when focus, overlays, or shared runtime behavior are involved.

Do not accept a workaround that changes the user's interaction shape unless the user explicitly wants that behavior. If the user says the behavior is still wrong, reproduce their exact click coordinates/sequence before changing code again.

## Superpowers Mapping

The harness maps one-sentence requests to these skill names:

- `systematic-debugging`: bugs, failures, wrong behavior, missing data, failed builds, failed rollout.
- `brainstorming`: new or ambiguous features, behavior design, product or workflow changes.
- `dispatching-parallel-agents`: all pages, all projects, multiple independent domains.
- `subagent-driven-development`: approved implementation plans with independent tasks.
- `using-git-worktrees`: parallel branches or isolated workspaces.
- `test-driven-development`: behavior changes needing regression coverage.
- `requesting-code-review`: review or audit requests.
- `verification-before-completion`: before completion claims, commit, push, deploy, or release.
- `finishing-a-development-branch`: commit, push, release, merge, or branch finish.
- `writing-skills`: creating or updating project skills.

## Standard Flow

After intake, use the returned commands as the starting point. The normal delivery loop is:

```bash
node scripts/harness/ygt-workflow.mjs impact --project <project> --json
node scripts/harness/ygt-workflow.mjs doctor --project <project> --json
node scripts/harness/ygt-workflow.mjs verify --project <project> --profile standard --changed-only
node scripts/harness/ygt-workflow.mjs review --project <project> --json
node scripts/harness/ygt-workflow.mjs report --project <project> --task-id <task-id>
```

Use `release` or `full` only after code changes are verified:

```bash
node scripts/harness/ygt-workflow.mjs full --project <project> --message "fix: ..." --task-id <task-id> --report
```

`full` and `release` persist `.ygt-runs/<task-id>/release-state.json` after every stage. After a process, host, network, Jenkins, or SSH interruption, continue the same run without replaying completed stages:

```bash
node scripts/harness/ygt-workflow.mjs resume --project <project> --task-id <task-id>
```

Jenkins queue and build URLs are persisted immediately, so resume monitors the existing build instead of triggering a duplicate. Transient doctor/Jenkins/rollout/smoke failures use bounded exponential backoff; authorization, configuration, verification, commit, and push failures stop immediately. If smoke retries are exhausted, the harness runs `--rollback-command` or `YGT_ROLLBACK_COMMAND` when configured, otherwise records `rollback-required` in release state.

For harness, plugin, installer, skill, or workflow documentation changes, run the dedicated selftest:

```bash
node scripts/harness/ygt-workflow.mjs selftest --project main --json
```

Reports can include that evidence:

```bash
node scripts/harness/ygt-workflow.mjs report --project main --task-id <task-id> --with-doctor --with-selftest
```

## Multi-Agent Work

When `intake` returns `dispatching-parallel-agents`, create a task manifest and validate ownership before edits or commits:

```yaml
taskId: ygt-YYYYMMDD-topic
project: main
agents:
  base:
    include:
      - ../df-ygt-biz-base/**
  shujumx:
    include:
      - ../df-ygt-biz-shujumx/**
  integrator:
    include:
      - scripts/harness/**
      - docs/**
exclusivePaths:
  - frontend/**/package.json
  - frontend/**/pnpm-lock.yaml
  - scripts/harness/**
```

Then run:

```bash
node scripts/harness/ygt-workflow.mjs claim --project <project> --task .ygt-task.yml --agent <agent> --json
```

Commit with explicit pathspecs:

```bash
node scripts/harness/ygt-workflow.mjs commit --project <project> \
  --message "fix: ..." \
  --include <owned-path>
```

## Completion Gate

Before saying work is complete, run fresh verification and read the output:

```bash
node scripts/harness/ygt-workflow.mjs verify --project <project> --profile standard --changed-only
node scripts/harness/ygt-workflow.mjs review --project <project>
node scripts/harness/ygt-workflow.mjs smoke --project <project>
```

For harness/plugin changes, `selftest` plus syntax checks are the minimum completion gate in addition to `review`. For code changes, a successful compile/build must be followed by the applicable automated tests before claiming completion.

For frontend subapp release, backend/service Jenkins success is not enough. Trigger the frontend static-resource job for the owning subapp when one exists, then roll out or refresh the main frontend host serving `/subapps/<app>/`. Verify the online `index.html` asset hash/marker and run a real browser login-route-screenshot flow; HTTP smoke only proves reachability.

If `verify --changed-only` runs after commit/push and skips because the tree is clean, report the pre-commit local evidence plus online evidence instead of treating the skip as validation.

For rollout or runtime failures:

```bash
node scripts/harness/ygt-workflow.mjs diagnose --project <project> --via jenkins --tail 300 --json
```

Do not claim success from expectation, prior runs, or agent reports. Completion requires current command evidence.
