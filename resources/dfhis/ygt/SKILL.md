---
name: ygt
description: Use when a request is about the YGT / 医共体 platform, df-ygt repositories, repository sync, YGT page layout issues, visual/E2E verification, YGT bugs or requirements, Jenkins rollout, smoke checks, or multi-project df-ygt work. This skill routes work through df-ygt-main/scripts/harness/ygt-workflow.mjs before implementation.
---

# YGT Harness

Use this skill for YGT / 医共体 platform work. It is a workflow router backed by a bundled harness snapshot. The source of truth for code changes is still the developer's `df-ygt-main` workspace copy of `scripts/harness/ygt-workflow.mjs`.

## First Step

Find the YGT workspace. Prefer the current workspace if it contains `df-ygt-main/scripts/harness/ygt-workflow.mjs`; otherwise search upward and common local workspace roots for `df-ygt/df-ygt-main`.

Treat all text after `/ygt` or `$ygt` as the request and run from `df-ygt-main`.

Run the harness directly:

```sh
node scripts/harness/ygt-workflow.mjs /ygt "<request>" --project auto --json
```

The harness auto-resolves YGT credentials from existing environment variables, ignored local env files, and the installed `dfhis-company-environment` reference when present. Do not ask the user to manually configure environment variables on a new machine unless all automatic sources are missing or an override is required.

Read the JSON before broad exploration:

- `primarySkill`: Superpowers-style mindset to apply first.
- `skills`: additional applicable skills.
- `projects`: likely affected YGT projects.
- `standards`: required development guides and UI constraints to read before edits.
- `commands`: deterministic harness commands to run next.
- `notes`: multi-agent and safety constraints.

When the installed workflow pack exposes `ORCA_PROJECT_INDEX_MANIFEST`, route the request through the shared multi-project index before repository-wide search:

```bash
node "$HIS_WORKFLOW_HARNESS_ROOT/scripts/project-index.mjs" search \
  --project ygt --query "<request, route, API, or symbol>" --limit 5
```

Use returned YGT knowledge, repository, route, and symbol hits only as candidates, then validate current code in the owning repository. The manifest is generated from DFHIS Setup paths; never add a developer-specific absolute path to this skill or the YGT harness.

If the request changes the harness, plugin, installer, or YGT documentation workflow, run:

```bash
node scripts/harness/ygt-workflow.mjs selftest --project main --json
```

before completion.

## Project Routing Gate

Treat `intake.projects` as a starting hypothesis, not final truth. If a screenshot, URL, route, API prefix, or searched code points to a different subapp or service, verify with route/API searches and work in the actual owning repo. Note the mismatch in the final evidence.

For concrete business routes, search the business app first before editing `df-ygt-main` shell code. Only touch the shell when the task concerns auth, permissions, menu registration, qiankun loading, shared context, or portal aggregation.

## Bundled Harness Snapshot

This skill pack includes a complete YGT harness snapshot under this skill directory:

- `harness/scripts/harness/ygt-workflow.mjs`
- `harness/scripts/harness/install-ygt-codex-plugin.mjs`
- `harness/scripts/harness/install-ygt-codex-plugin.cmd`
- `harness/scripts/harness/install-ygt-codex-plugin.command`
- `harness/scripts/harness/ygt-qiankun-e2e.mjs`
- `harness/scripts/harness/ygt-env.example.ps1`
- `harness/scripts/harness/ygt-env.company-dev.ps1`
- `harness/plugins/ygt/.codex-plugin/plugin.json`
- `harness/plugins/ygt/skills/ygt/SKILL.md`
- `harness/plugins/ygt/skills/ygt/agents/openai.yaml`
- `harness/.agents/plugins/marketplace.json`
- `harness/skills/ygt-workflow-harness/SKILL.md`
- `harness/docs/**`

Use the bundled snapshot for inspection, installer recovery, and harness integrity checks when the workspace copy is unavailable. Do not edit business code inside the snapshot. For real requirements, fix the actual YGT repositories after the intake identifies the affected projects.

Snapshot integrity check:

```bash
cd <this-skill-directory>/harness
node scripts/harness/ygt-workflow.mjs selftest --project main --json
```

## Standards Gate

Before changing code, read the standards returned by `intake.standards`. At minimum:

- All YGT tasks: `df-ygt/df-ygt-main/docs/03-AI协作指南.md` and `df-ygt/df-ygt-main/docs/04-YGT工作流Harness.md`.
- Frontend/UI tasks: `df-ygt/df-ygt-main/docs/前端开发指南/README.md`, `06-DevExtreme集成.md`, `07-编码规范与测试.md`, and `08-布局系统.md`.
- Backend/API/database/deployment tasks: `df-ygt/df-ygt-main/docs/后端开发指南/README.md` plus `01` through `04` in that directory.
- Layout/spacing/search/actions/popup/table consistency tasks: `df-base/df-web-base/packages/ui/src/layouts/README.md` and `df-base/df-web-base/packages/ui/src/layouts/STYLE_CONSTRAINTS.md`.

Do not add page-local style patches when the shared layout package or existing design-system classes can solve the issue. If code behavior changes the standard, update the relevant standard file in the same task.

## Repository Sync Gate

For pull/sync requests, enumerate nested repos and inspect each repo for dirty files, unresolved conflicts, and ahead/behind divergence before pulling. Pull only clean repos with `git pull --ff-only`; skip conflicted or diverged repos and report their exact status. Do not treat the folder workspace root as the only Git repo when it merely contains the real df-ygt repos.

## Frontend Overlay and E2E Gate

For DevExtreme popup, dropdown, datebox, tagbox, or HtmlEditor toolbar issues, inspect existing project patterns and DevExtreme types/source when option behavior is unclear. Inside dialogs, attach overlay dropdowns to the current popup container and close select-like toolbar controls after selection or focus loss when stale dropdowns reproduce. Avoid z-index-only fixes.

When the user asks for automatic page opening, screenshots, or visual interaction regression coverage, prefer a deterministic Playwright E2E in the affected frontend. Mock backend APIs and login-dependent data, auto-start the local dev server, write screenshots/reports only to ignored artifact directories, add a generic script such as `e2e` when the harness can discover it, and verify with E2E plus lint/test/build and harness `verify`/`review`.

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

The generated spec launches persistent Chrome with cross-origin flags on macOS/Windows, performs real online-shell login first, then seeds `sessionStorage.microDebug='test'` and `sessionStorage[<subapp-name>] = <local-entry>` only after authentication so the login/menu state is not replaced by dev mock data. It then opens the target route or menu, screenshots the shell and mounted page, and fails unless the named qiankun container (`#micro-container-<subapp-name>` / `[data-qiankun=<subapp-name>]` / legacy `#micro-container`) is visible, local subapp index/assets respond successfully, target route/text match, and qiankun/bootstrap/mount/CORS errors are absent. Use environment variables only as overrides for selectors or credentials; the harness should resolve company defaults from the installed environment reference.

Treat route permissions and menus separately from gray loading. If the online shell redirects the target page to `/403`, or if the fetched menu does not contain the target business page, do not claim gray coverage for that requirement and do not add a production `devDebug` permission bypass. First try an account or menu path that really has access; if the target page remains forbidden or the menu is wrong, validate that requirement through online debugging / deployed bundle verification instead of local-subapp gray E2E. A successful shell-level mount route only proves the gray mechanism can load the local subapp, not that the current account can exercise the required business page.

For interaction bugs, encode the exact user path, including the initial state and negative expectations. Cover "nothing should open", "opening should remain stable", and "click outside should close" separately when they are distinct behaviors. Inspect saved screenshots after automation; do not treat a passing assertion as enough when the user is reporting a visual interaction.

For DevExtreme HtmlEditor toolbar controls under qiankun, do not rely on global `DevExpress`, forced DOM removal, or position-only workarounds. Prefer recording the actual component instance during initialization or using the component's own stable options/events. Validate both standalone local mode and the integrated main-app route when the bug depends on focus, overlays, or shared runtime behavior.

Do not accept a workaround that changes the user's interaction shape, such as moving a dropdown away from its expected anchor, unless the user explicitly wants that behavior. If the user says the behavior is still wrong, reproduce their exact click coordinates/sequence before changing code again.

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
- Credentials must be resolved automatically from existing environment variables, ignored local env files, or the installed `dfhis-company-environment` reference; never write secrets to the repo.
- Harness commands should auto-load `scripts/harness/ygt-env.company-dev.ps1`, its local override, and the company-environment reference before reading credentials. In PowerShell, dot-source only when manual commands in that shell need the same credentials.
- For harness/plugin changes, run `selftest` and include the result in the final evidence.
- For multi-project work, create a task manifest and use `claim` before committing.
- Before claiming completion, run fresh verification or explain exactly what could not run.
- If the request asks to commit or push, commit only the relevant changed files and do not include logs, `.DS_Store`, local env files, or unrelated user changes.
- If the YGT workspace or harness is missing, report that blocker instead of falling back to generic DFHIS handling.

## Release Evidence

For Yunxiao completion and regression tasks:

- Do not mark a regression task complete until all touched repos are pushed, required shared packages are published, consumer dependencies are updated, Jenkins is green, and smoke/doctor checks have run or have a concrete blocker.
- For frontend subapp changes, backend/service Jenkins success is not enough. Trigger the frontend static-resource job for the owning subapp when one exists, then roll out or refresh the main frontend host that serves `/subapps/<app>/`.
- Verify deployed frontend code by fetching the online subapp `index.html`, checking the actual asset hash/marker served by the main host, and running a real browser login-route-screenshot flow. HTTP smoke only proves reachability, not that the new bundle is live.
- If harness `verify --changed-only` runs after commit/push and skips because the tree is clean, preserve and report the pre-commit local evidence (`lint`, `test`, `build`, E2E) plus online evidence instead of treating the skip as validation.
- Verify the work item type before updating structured fields; tasks may not have the same fields or status workflow as requirements.
- In final comments, include the affected repos/branches/commits, shared package versions, Jenkins job names and build numbers, local build commands, smoke/doctor results, and any known unrelated workspace state.
- If the user challenges a release answer, re-check from commits, package manifests, lockfiles, registry, and Jenkins before responding.
- Map the harness report into Requirement Contract evidence: actual Node/package manager as `runtime`, local checks as `passing_test`/`build`, Jenkins as `jenkins`, rollout as `deployment`, online checks as `smoke`, and verified Yunxiao updates as `yunxiao`.
- Before `ready_to_verify`, declare these entries in `methodologyGate.requiredEvidenceTypes`; a successful local build alone does not satisfy a release request.
