---
name: ygt
description: Use when the user starts a request with /ygt, says to use the YGT harness, or asks to handle YGT platform bugs, requirements, layout issues, Jenkins rollout, smoke checks, or multi-project df-ygt work. This skill routes natural-language requests through df-ygt-main/scripts/harness/ygt-workflow.mjs before implementation.
---

# YGT Harness

Use this skill when a user starts a message with `/ygt ...` or explicitly mentions `$ygt`.

## First Step

Find the YGT workspace. Prefer the current workspace if it contains `df-ygt-main/scripts/harness/ygt-workflow.mjs`; otherwise search upward for `df-ygt/df-ygt-main`.

Treat all text after `/ygt` or `$ygt` as the request and run from `df-ygt-main`.

On Windows/PowerShell, the harness auto-bootstraps `scripts/harness/ygt-env.company-dev.ps1`, which in turn loads the ignored local override `scripts/harness/ygt-env.company-dev.local.ps1` when present. You can still dot-source it explicitly when running several commands in one shell:

```powershell
. .\scripts\harness\ygt-env.company-dev.ps1; node scripts/harness/ygt-workflow.mjs /ygt "<request>" --project auto --json
```

For non-PowerShell shells or environments that already have YGT variables:

```bash
node scripts/harness/ygt-workflow.mjs /ygt "<request>" --project auto --json
```

Read the JSON before broad exploration:

- `primarySkill`: Superpowers-style mindset to apply first.
- `skills`: additional applicable skills.
- `projects`: likely affected YGT projects.
- `standards`: required development guides and UI constraints to read before edits.
- `commands`: deterministic harness commands to run next.
- `notes`: multi-agent and safety constraints.

If the request changes the harness, plugin, installer, or YGT documentation workflow, run:

```bash
node scripts/harness/ygt-workflow.mjs selftest --project main --json
```

before completion.

## Standards Gate

Before changing code, read the standards returned by `intake.standards`. At minimum:

- All YGT tasks: `df-ygt/df-ygt-main/docs/03-AI协作指南.md` and `df-ygt/df-ygt-main/docs/04-YGT工作流Harness.md`.
- Frontend/UI tasks: `df-ygt/df-ygt-main/docs/前端开发指南/README.md`, `06-DevExtreme集成.md`, `07-编码规范与测试.md`, and `08-布局系统.md`.
- Backend/API/database/deployment tasks: `df-ygt/df-ygt-main/docs/后端开发指南/README.md` plus `01` through `04` in that directory.
- Layout/spacing/search/actions/popup/table consistency tasks: `df-base/df-web-base/packages/ui/src/layouts/README.md` and `df-base/df-web-base/packages/ui/src/layouts/STYLE_CONSTRAINTS.md`.

Do not add page-local style patches when the shared layout package or existing design-system classes can solve the issue. If code behavior changes the standard, update the relevant standard file in the same task.

## Batch Intake Gate

When splitting a large issue list into batches or Yunxiao work items:

- Parse the original list into stable item IDs before grouping.
- Verify every original issue and every "pending confirmation" item is represented exactly once or explicitly marked out of scope.
- Add a short coverage note to the split document before creating Yunxiao items.
- Keep a local delivery ledger for multi-ticket work and update it after pushes, package publishes, Jenkins runs, and Yunxiao comments.

## Shared Package Release Gate

For any frontend, layout, or shared-component work, do not infer package impact from memory. Before saying a shared package was not changed, inspect the actual merged commit range with `git diff --name-status` and check these roots:

- `df-base/df-web-base/packages/ui/**` -> `@df/ui`
- `df-base/df-web-base/packages/utils/**` -> `@df/utils`
- Other `df-web-base/packages/<name>/**` roots -> the matching workspace package

If a package root changed in source, exports, tokens, styles, docs that drive generated output, or package metadata:

- Treat the package as requiring a version decision; default to a patch bump unless the repository standard says otherwise.
- Build from the package workspace root and publish from the repository root when repo scripts expect root context.
- Use temporary npm auth config only; never write tokens to the repo, logs, Yunxiao comments, or the skill.
- Update every consuming YGT app and subapp dependency and lockfile that needs the new package version.
- Rebuild each consumer, push only relevant dependency/package changes, then trigger the mapped Jenkins jobs.
- Verify published versions with `npm view` and record package version, consumer commit, Jenkins build number, and result.

If the primary app workspace has unrelated local commits or is behind/ahead, use a temporary worktree from the remote branch for dependency bumps so unrelated local work is not mixed into the release.

## Execution Rules

- Use the harness commands as the workflow backbone.
- Credentials must come from local environment variables; never write secrets to the repo.
- Harness commands auto-load `scripts/harness/ygt-env.company-dev.ps1` and its local override before reading credentials. In PowerShell, you may still dot-source it from `df-ygt-main` when you want the same credentials available to manual commands in that shell.
- For harness/plugin changes, run `selftest` and include the result in the final evidence.
- For multi-project work, create a task manifest and use `claim` before committing.
- Before claiming completion, run fresh verification or explain exactly what could not run.
- If the request asks to commit or push, commit only the relevant changed files and do not include logs, `.DS_Store`, local env files, or unrelated user changes.

## Release Evidence

For Yunxiao completion and regression tasks:

- Do not mark a regression task complete until all touched repos are pushed, required shared packages are published, consumer dependencies are updated, Jenkins is green, and smoke/doctor checks have run or have a concrete blocker.
- Verify the work item type before updating structured fields; tasks may not have the same fields or status workflow as requirements.
- In final comments, include the affected repos/branches/commits, shared package versions, Jenkins job names and build numbers, local build commands, smoke/doctor results, and any known unrelated workspace state.
- If the user challenges a release answer, re-check from commits, package manifests, lockfiles, registry, and Jenkins before responding.
