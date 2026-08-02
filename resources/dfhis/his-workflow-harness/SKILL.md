---
name: his-workflow-harness
description: Run deterministic, evidence-driven HIS and DFHIS verification and release workflows. Use for HIS repository intake, Node/JDK/package-manager selection, local builds, read-only database checks, Jenkins compilation, deployment commands, online smoke checks, release verification, or any request to carry a HIS change from code through environment validation.
---

# HIS Workflow Harness

Use `scripts/his-workflow.mjs` as the executable backbone for general HIS work. Use the YGT skill and its own harness for `df-ygt-*` repositories.

## Intake

Run from this skill directory and point `--repo` at the isolated requirement worktree, never the original HIS aggregate source directory.

```bash
node scripts/his-workflow.mjs intake --repo /path/to/requirement/code/repo --json
```

Read the returned project family, runtime, package manager, detected build commands, and missing catalog fields before implementation or release work.

Resolution order:

1. Repository `.nvmrc`, `.node-version`, `.tool-versions`, `package.json#engines.node`, package manager declaration, lockfiles, wrappers, and Jenkinsfile.
2. Service entry from `--catalog` or `HIS_WORKFLOW_CATALOG`.
3. Project-family fallback: general HIS frontend uses Node 18; YGT uses its dedicated harness with Node 22 or repository-selected Node 24.

## Commands

```bash
node scripts/his-workflow.mjs doctor --repo <repo> --catalog <catalog> --service <id> --json
node scripts/his-workflow.mjs verify --repo <repo> --catalog <catalog> --service <id> --json
node scripts/his-workflow.mjs build --repo <repo> --catalog <catalog> --service <id> --environment <id> --allow-mutations --report-dir <dir> --json
node scripts/his-workflow.mjs database --repo <repo> --catalog <catalog> --service <id> --json
node scripts/his-workflow.mjs jenkins --repo <repo> --catalog <catalog> --service <id> --allow-mutations --json
node scripts/his-workflow.mjs deploy --repo <repo> --catalog <catalog> --service <id> --allow-mutations --json
node scripts/his-workflow.mjs smoke --repo <repo> --catalog <catalog> --service <id> --json
node scripts/his-workflow.mjs full --repo <repo> --catalog <catalog> --service <id> --allow-mutations --report-dir <dir> --json
node scripts/his-workflow.mjs resume --state-file <dir>/run-state.json --catalog <catalog> --allow-mutations --json
node scripts/his-qiankun-e2e.mjs scaffold --repo <subapp-repo> --main-url http://localhost:9000 --subapp-name <name> --subapp-entry //<host>:<port> --xi-tong-id <id> --update-package-script
```

For a named company environment and an ad hoc Jenkins job, resolve the Chinese alias directly:

```bash
node scripts/his-workflow.mjs jenkins --repo <repo> --catalog <catalog> --environment "本地152开发环境" --job <job> --allow-mutations --json
```

- `doctor` records Git state and actual runtime versions.
- `verify` runs repository or catalog build/test/E2E commands with the selected Node directory first on `PATH`. For package repositories, automatic detection prefers `build`, then `test`, then the first available E2E or screenshot script from `e2e`, `test:e2e`, `e2e:screenshot`, `test:e2e:screenshot`, `screenshot`, `test:screenshot`, `visual`, `test:visual`, `playwright`, `test:playwright`, `cypress:run`, or `cy:run`. This detection is only a convenience; qiankun HIS flows still require integrated main-app plus local sub-app E2E when the requirement changes a mounted sub-application path.
- `database` rejects non-read-only SQL and never prints connection secrets.
- `jenkins` triggers the mapped job and waits for a terminal result.
- `build` runs doctor, local verification, and Jenkins compilation/publish as one durable run.
- `--environment` accepts a catalog ID or alias such as `本地152开发环境`; explicit process environment variables override catalog variables.
- `--job` supports a Jenkins job that has not yet been attached to a service entry.
- `deploy` runs an explicit catalog command, or records a completed Jenkins build-and-publish job as deployment evidence.
- `smoke` checks every mapped URL.
- `full` persists every transition atomically, retries only transient infrastructure failures, stops on hard gates, and emits reusable evidence JSON/Markdown.
- `resume` verifies repository HEAD, service, and environment identity, skips passed stages, resumes a persisted Jenkins queue/build URL, and never blindly replays an interrupted deployment.
- `jenkins`, `deploy`, and `full` require `--allow-mutations`; this flag does not authorize unrelated Git or database writes.

Refresh Jenkins mappings read-only before a release batch, then commit the catalog only after reviewing the result:

```bash
node scripts/his-service-catalog.mjs discover --catalog references/company-environments.json --repo-root <his-code-root> --environment local-development --json
node scripts/his-service-catalog.mjs discover --catalog references/company-environments.json --repo-root <his-code-root> --environment local-152 --json
node scripts/his-service-catalog.mjs validate --catalog references/company-environments.json --json
```

Add `--allow-mutations` to `discover` only when the reviewed unique mappings should be written. Ambiguous jobs are never written. Use `references/service-catalog.example.json` as the catalog contract. The company-only skill pack may include local plaintext credentials when the environment owner explicitly permits it; never echo them into workflow reports, command evidence, logs, or Yunxiao comments.

## Requirement E2E Gate

HIS E2E testing is possible and required when a requirement changes a user-visible frontend flow, permissions/menu behavior, login-dependent interaction, cross-page workflow, or frontend-backend integration that cannot be proven by unit tests alone.

Use this decision order:

1. If the repository already exposes `e2e`, `test:e2e`, `playwright`, `test:playwright`, `cypress:run`, or `cy:run`, run it through `verify` and keep the artifact path or report summary.
2. If the requirement has a concrete browser path but no E2E script exists, add a focused Playwright/Cypress spec in the requirement worktree, wire a stable script such as `e2e`, and run it after build and automated tests.
3. If E2E cannot run because environment data, browser dependencies, or test accounts are missing, record that exact blocker and compensate with the strongest available evidence: unit/integration tests, build, read-only database checks, Jenkins, deployment, and online smoke.

Do not treat Jenkins compilation, package build, `git diff --check`, or HTTP smoke as E2E evidence. Smoke only proves a mapped endpoint is reachable. A successful build must be followed by the applicable automated tests before claiming a HIS requirement is complete.

For E2E artifacts, write screenshots, traces, videos, and reports under the requirement evidence directory or another ignored artifact directory. Never commit generated artifacts or secrets. Prefer deterministic selectors and seeded/mocked data; use real company environments only when the requirement explicitly needs deployed integration evidence.

## HIS Qiankun Integrated E2E

Most DFHIS Vue frontends are qiankun main-app/sub-app systems. For these repositories, do not treat standalone sub-app startup as sufficient E2E for a HIS requirement. Use the integrated workflow unless the changed page is proven to be standalone-only:

1. Identify the shell repository, target sub-app repository, `xiTongId`, sub-app `name`, dev port, route/menu path, and environment proxy target from code. In typical Vue 2 HIS apps, `df-web-main` runs the shell and registers sub-apps through qiankun, while `sessionStorage.devDebug === 'test'` allows local gray entry overrides by sub-app name.
2. Start the shell first against the selected company environment, then start the changed sub-app locally on its declared dev port with its qiankun UMD output and CORS headers. Example: main app on `9000`, outpatient doctor station `df-web-menzhenysz` on `8022`.
3. If the repository has no screenshot E2E yet, scaffold a Playwright spec and package script, then customize the generated login/menu selectors for the concrete requirement:

```bash
node scripts/his-qiankun-e2e.mjs scaffold \
  --repo /path/to/df-web-menzhenysz \
  --main-url http://localhost:9000 \
  --subapp-name df-web-menzhenysz \
  --subapp-entry //localhost:8022 \
  --xi-tong-id 04 \
  --route /apps/04/home \
  --update-package-script
```

The scaffolded spec launches persistent Chrome with cross-origin flags, injects `devDebug`, captures screenshots, asserts the qiankun container mounted, and fails if no network request hits the local gray sub-app entry. The generated `login(page)` and `openRequirementFlow(page)` hooks must be filled with real selectors or driven by environment variables before claiming automated E2E evidence.

4. Run the browser in cross-origin debug mode for integrated local E2E. The scaffolded Playwright spec works on macOS and Windows: it uses `HIS_CHROME_PATH` when set, otherwise auto-detects Google Chrome on macOS and the normal Windows install locations under `Program Files`, `Program Files (x86)`, or `LocalAppData`, then falls back to Playwright's `chrome` channel.

On macOS, launch an isolated Chrome profile like:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --disable-web-security \
  --disable-site-isolation-trials \
  --user-data-dir="/tmp/chrome-cors"
```

On Windows, the equivalent manual command is:

```cmd
"%ProgramFiles%\Google\Chrome\Application\chrome.exe" ^
  --disable-web-security ^
  --disable-site-isolation-trials ^
  --user-data-dir="%TEMP%\chrome-cors"
```

Playwright specs for this mode must launch persistent Chrome with equivalent arguments, or connect to a Chrome instance launched with these flags. A normal browser context is not valid evidence for local qiankun gray E2E when the shell loads `localhost` sub-app assets from another origin.

5. Before login or before the shell builds its app list, seed the shell origin storage for the local gray sub-app entry. Use the actual app `name` key from the shell app config, for example:

```js
sessionStorage.setItem('devDebug', 'test')
sessionStorage.setItem('df-web-menzhenysz', '//localhost:8022')
```

6. Login through the shell with a real test account for the selected company environment. Do not fake only `token` for integrated E2E; the shell also builds menus, tabs, active app state, user context, department/campus data, and qiankun mount props from backend responses.
7. Open the flow through the shell UI, menu, tab, or patient workflow that creates the expected `viewList` entry. Directly visiting `/apps/<xiTongId>/...` may not mount the sub-app if the shell has not prepared the matching tab/menu state.
8. Prove the local gray sub-app was really used: record network evidence for the local sub-app entry/config/assets, assert the qiankun container such as `#apps-<xiTongId>` mounted content, and fail on qiankun global errors, blank containers, loading loops, or console errors related to sub-app bootstrap/mount.
9. After Jenkins/package/deployment, repeat online verification through the deployed shell and verify the served sub-app entry/version/hash. Deployment smoke is not a substitute for the integrated local E2E above.

If the account, menu permission, patient/order data, cross-origin browser, or environment proxy is missing, stop and report that blocker precisely. Do not replace this gate with build success, HTTP smoke, or standalone sub-app screenshots.

## Evidence Gate

Put the report under the requirement directory, for example:

```bash
--report-dir "$YUNXIAO_REQUIREMENT_DIR/evidence/his-workflow"
```

Convert report evidence into `requirementContract.methodologyGate.verificationEvidence`:

- `runtime`: selected Node/JDK/package manager.
- `passing_test` and `build`: local verification.
- `e2e`: browser-level requirement flow, when applicable.
- `database`: read-only business-data verification.
- `jenkins`: remote compile/package result and build URL.
- `deployment`: deployment or rollout result.
- `smoke`: online endpoint result.

Do not replace a required stage with `git diff --check`. If a catalog mapping is absent, record the exact missing service/environment field and stop that stage.

## Safety

- Run code changes in the Yunxiao requirement worktree created by `yunxiao-requirement-archiver`.
- Use `dfhis-company-environment` to choose the matching environment and catalog inputs.
- Keep database checks read-only. The harness accepts only SQL beginning with `SELECT`, `WITH`, `SHOW`, `DESCRIBE`, or `EXPLAIN`.
- Never include passwords or tokens in command arguments stored in reports. Pass them through environment variables.
- A Jenkins job with `branchMode: fixed` must match the current branch. A job with `branchMode: unknown` is blocked unless a supervised run explicitly passes `--allow-unverified-jenkins-branch`.
- Interrupted Jenkins monitoring resumes from its persisted queue/build URL. Interrupted deployment requires `deployCheckCommand`; post-deployment smoke exhaustion invokes `rollbackCommand` when configured and otherwise leaves an explicit rollback-required gate.
- Use `his-release-merge` before this harness when the task is a release-branch cherry-pick batch.
- Run `selftest` after changing this skill:

```bash
node scripts/his-workflow.mjs selftest --json
```
