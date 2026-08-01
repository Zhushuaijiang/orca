---
name: ygt-workflow-harness
description: Use when handling YGT platform requirements, bugs, layout issues, deployment requests, Jenkins rollout checks, or multi-project agent work in df-ygt-main and related df-ygt business repos.
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
node scripts/harness/ygt-workflow.mjs review --project <project>
node scripts/harness/ygt-workflow.mjs smoke --project <project>
```

For harness/plugin changes, `selftest` is the minimum completion gate in addition to `review`.

For rollout or runtime failures:

```bash
node scripts/harness/ygt-workflow.mjs diagnose --project <project> --via jenkins --tail 300 --json
```

Do not claim success from expectation, prior runs, or agent reports. Completion requires current command evidence.
