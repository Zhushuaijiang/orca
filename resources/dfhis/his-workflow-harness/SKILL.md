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

JDK and Gradle are auto-discovered per machine — no manual configuration required. The harness tries these layers in order and reports which one matched via `jdkSource`/`gradleSource` in the runtime:

1. **`dfhis-environment.json`** fields `jdkHome` / `gradleHome` (explicit override for non-standard paths).
2. **Environment variables** `JAVA_HOME` / `GRADLE_HOME`.
3. **PATH lookup** — resolves `javac` / `gradle` on PATH and goes up two directories.
4. **Standard location scan** — `~/.jdks`, `C:\Program Files\Java`, JetBrains bundled JBRs, Eclipse Adoptium, BellSoft, SDKMAN, Homebrew, Scoop, common non-system-drive tool dirs (`D/E/F:\WorkingApplication\IDEA`, `\DevTools`, `\Java`, `\Gradle`), Gradle wrapper dists cache.

When discovered, the harness injects `JAVA_HOME`, `GRADLE_HOME`, and their `bin` directories into `PATH` via `selectedEnv`. On Windows, `spawn` automatically enables `shell: true` for `.bat`/`.cmd` executables. When a repository lacks `gradlew`, `detectVerifyCommands` falls back to the discovered external Gradle.

## Commands

```bash
node scripts/his-workflow.mjs doctor --repo <repo> --catalog <catalog> --service <id> --json
node scripts/his-workflow.mjs verify --repo <repo> --catalog <catalog> --service <id> --json
node scripts/his-workflow.mjs ui-e2e-sandbox --repo <repo> --work-item <DFHIS-ID> --ui-test-script <script> --artifact-root <root> --ui-base-url <url> --json
node scripts/his-workflow.mjs build --repo <repo> --catalog <catalog> --service <id> --environment <id> --allow-mutations --report-dir <dir> --json
node scripts/his-workflow.mjs database --repo <repo> --catalog <catalog> --service <id> --json
node scripts/his-workflow.mjs jenkins --repo <repo> --catalog <catalog> --service <id> --allow-mutations --json
node scripts/his-workflow.mjs deploy --repo <repo> --catalog <catalog> --service <id> --allow-mutations --json
node scripts/his-workflow.mjs smoke --repo <repo> --catalog <catalog> --service <id> --json
node scripts/his-workflow.mjs full --repo <repo> --catalog <catalog> --service <id> --allow-mutations --report-dir <dir> --json
node scripts/his-workflow.mjs resume --state-file <dir>/run-state.json --catalog <catalog> --allow-mutations --json
node scripts/his-qiankun-e2e.mjs scaffold --repo <subapp-repo> --main-url <shell-url> --subapp-name <name> --subapp-entry //<host>:<port> --xi-tong-id <id> --route <target-route> --expect-text <target-page-text> --update-package-script
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

1. If the repository already exposes `e2e`, `test:e2e`, `playwright`, `test:playwright`, `cypress:run`, or `cy:run`, inspect it and adapt the requirement flow into the `dfhis-ui-test-delivery` artifact directory. Execute browser interaction through `ui-e2e-sandbox`; do not launch the macOS desktop browser.
2. If the requirement has a concrete browser path but no E2E script exists, copy the focused container template from `dfhis-ui-test-delivery` into the requirement artifact directory, implement the real flow, and run it after build and automated tests. Do not commit generated evidence or credentials to the product repository.
3. If E2E cannot run because environment data, browser dependencies, or test accounts are missing, record that exact blocker and compensate with the strongest available evidence: unit/integration tests, build, read-only database checks, Jenkins, deployment, and online smoke.

Do not treat Jenkins compilation, package build, `git diff --check`, or HTTP smoke as E2E evidence. Smoke only proves a mapped endpoint is reachable. A successful build must be followed immediately by the applicable automated tests before claiming a HIS requirement is complete. For frontend work, do not repeat implementation loops after a successful build without first running the available unit, integration, screenshot, or E2E test surface and using the failure evidence to guide the next edit.

Pass `--work-item`, `--ui-test-script`, `--artifact-root`, and `--ui-base-url` to `build` or `full` to insert the remote Docker browser gate immediately after local verification. The default backend is `remote` at `root@192.168.1.10`; override it only with `--ui-sandbox-backend` or `--ui-sandbox-remote`. The test process, browser, and evidence capture run inside the ephemeral container. `--allow-mutations` authorizes release operations only; UI business writes require the separate `--allow-ui-mutations` flag plus a named safe test subject and cleanup.

For E2E artifacts, write screenshots, traces, videos, and reports under the requirement evidence directory or another ignored artifact directory. Never commit generated artifacts or secrets. Prefer deterministic selectors and seeded/mocked data; use real company environments only when the requirement explicitly needs deployed integration evidence.

## HIS Qiankun Integrated E2E

Most DFHIS Vue frontends are qiankun main-app/sub-app systems. For these repositories, do not treat standalone sub-app startup as sufficient E2E for a HIS requirement. Use the integrated workflow unless the changed page is proven to be standalone-only:

1. Identify the shell repository, target sub-app repository, `xiTongId`, sub-app `name`, dev port, route/menu path, expected page text, and environment proxy target from code for the current sub-app. Do not reuse values from a previous sub-app. In typical Vue 2 HIS apps, `package.json#name`, `package.json#appId`, `vue.config.js#devServer.port`, `public/config.json#xiTongId`, shell `src/config/apps/*`, and menu/backend responses together determine the correct values.
2. Prefer the online/company shell when the change is isolated to a sub-app and the shell itself is not being modified. Start only the changed sub-app locally on its declared dev port with qiankun UMD output and CORS headers, then gray-route the online shell to that local entry. Use a local shell only when the requirement changes shell code, online shell access is unavailable, or the target environment cannot be safely used.
3. If the repository has no screenshot E2E yet, scaffold a Playwright spec and package script, then customize the generated login/system/menu selectors for the concrete requirement:

```bash
node scripts/his-qiankun-e2e.mjs scaffold \
  --repo /path/to/<df-web-subapp> \
  --main-url <online-or-local-shell-url> \
  --subapp-name <package-json-name> \
  --subapp-entry //localhost:<dev-port> \
  --xi-tong-id <xiTongId> \
  --route /apps/<xiTongId>/<target-page-route> \
  --expect-text <target-page-visible-text> \
  --update-package-script
```

The scaffolded spec launches persistent Chrome with cross-origin flags, injects `devDebug`, captures screenshots, asserts the qiankun container is visible and mounted, checks target route/text when configured, and fails if no successful network request hits the local gray sub-app entry/config/assets. The generated `login(page)` and `openRequirementFlow(page)` hooks must be filled with real selectors or driven by environment variables before claiming automated E2E evidence.

4. Run cross-origin integrated E2E through `ui-e2e-sandbox`. Its template launches an isolated Chromium context inside the container with `--disable-web-security` and `--disable-site-isolation-trials`. A desktop Chrome session is not valid evidence for qiankun gray E2E.

5. Before login or before the shell builds its app list, seed the shell origin storage for the local gray sub-app entry. Use the actual app `name` key from the shell app config, for example:

```js
sessionStorage.setItem('devDebug', 'test')
sessionStorage.setItem('<package-json-name>', '//localhost:<dev-port>')
```

6. Login through the shell with a real test account for the selected company environment. If the login password is unknown, use `dfhis-company-environment` to read the matching environment file and query `df_zhushuju.gy_canshu` for the internal public password parameter such as `公用_万能密码`; use the value only as local E2E input and do not echo it in reports. Do not fake only `token` for integrated E2E; the shell also builds menus, tabs, active app state, user context, department/campus data, and qiankun mount props from backend responses. After selecting a system, assert the system input or active application state is actually set before clicking the real submit button; broad text clicks such as `getByText(/登录/)` can hit the login tab instead of the button.
7. Open the flow through the shell UI, menu, tab, or patient workflow that creates the expected `viewList` entry. Directly visiting `/apps/<xiTongId>/...` may not mount the sub-app if the shell has not prepared the matching tab/menu state. A shell home page, application dashboard, or menu overview is not enough; open a concrete target menu/page and assert the URL, tab title, or page text matches that page. If the shell uses a menu panel, first click the menu opener, then click a leaf menu item and wait for the routed page.
8. Prove the local gray sub-app was really used: record network evidence for the local sub-app entry, `config.json`, JS/CSS assets, and at least one route/page chunk when a concrete page is tested. Assert the qiankun container such as `#apps-<xiTongId>` exists, is visible (`display` is not `none`), has mounted content, and contains the expected micro-app root such as `#micro-app`. A hidden container or an empty mounted shell is a failed E2E even if `#apps-<xiTongId>` exists.
9. Inspect screenshots before reporting success. The final screenshot must show the target business page or required workflow state, not only the login page, shell home page, or menu list. Record residual console errors separately: fail on qiankun/bootstrap/mount/CORS/asset errors for the changed sub-app; document unrelated pre-existing shell errors without treating them as sub-app proof.
10. After Jenkins/package/deployment, repeat online verification through the deployed shell and verify the served sub-app entry/version/hash. Deployment smoke is not a substitute for the integrated local E2E above.

If the account, menu permission, patient/order data, cross-origin browser, or environment proxy is missing, stop and report that blocker precisely. Do not replace this gate with build success, HTTP smoke, or standalone sub-app screenshots.

## UI 规范门禁（HIS 前端）

HIS 前端代码（非医共体/YGT）改动在宣布完成前，必须先过 UI 规范门禁。规范共 28 条，详见 `ui-spec-review` 技能的 `references/ui-specs.md`。

```bash
node scripts/his-workflow.mjs ui-review --repo <repo> --json
```

等价于直接调用 `ui-spec-review` 技能扫描：

```bash
node /path/to/ui-spec-review/scripts/ui-spec-review.mjs --repo <repo> --changed-only --json
```

- 门禁判定：扫描出的 `violations` 非空即门禁不通过。每条违规必须逐一处理——修复，或给出可复核的理由（如功能色、贴边容器、弹窗小尺寸等规范允许的例外），理由记录到 evidence。
- 推荐对改动文件运行：`ui-review` 支持 `--changed-only`，只扫描相对 HEAD 的改动文件，适合每次提交前快检；全量扫描用于整页/整模块交付复核。
- 违规证据写入 `requirementContract.methodologyGate.verificationEvidence`（evidence type: `ui`），与 `runtime`/`build`/`e2e` 等并列，不能以 `git diff --check` 代替。
- 门禁只在 HIS 前端仓库启用；后端仓库跳过，医共体/YGT 走 ygt 自身规范。

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

For UI and micro-frontend work, attach provenance to each evidence item: evidence type, pass/superseded status, capture time, environment, execution surface, source, target commit/package, observation, and limitations. A shell reachability check does not prove that the child app mounted or that the final asset contains the change.

After every material UI edit, run the bounded loop `implement -> focused self-test -> ui-review (UI 规范门禁) -> build/runtime refresh -> screenshot + DOM measurement -> visual inspection -> compare with the contract`. If the screenshot, measurement, or UI spec review disagrees, record the defect, edit, and repeat; only evidence captured from the final diff can pass the gate.

When a command is blocked, classify the exact failure and consult the environment/access references for a safe fallback. Keep an attempt ledger: do not repeat the same deterministic command unchanged; change the hypothesis, tool, route, or evidence target. Stop after three materially different safe approaches and report the exact remaining owner/action.

## Safety

- Run code changes in the Yunxiao requirement worktree created by `yunxiao-requirement-archiver`.
- Use `dfhis-company-environment` to choose the matching environment and catalog inputs.
- Keep database checks read-only. The harness accepts only SQL beginning with `SELECT`, `WITH`, `SHOW`, `DESCRIBE`, or `EXPLAIN`.
- Never include passwords or tokens in command arguments stored in reports. Pass them through environment variables.
- A Jenkins job with `branchMode: fixed` must match the current branch. A job with `branchMode: unknown` is blocked unless a supervised run explicitly passes `--allow-unverified-jenkins-branch`.
- Interrupted Jenkins monitoring resumes from its persisted queue/build URL. Interrupted deployment requires `deployCheckCommand`; post-deployment smoke exhaustion invokes `rollbackCommand` when configured and otherwise leaves an explicit rollback-required gate.
- Use `his-release-merge` before this harness when the task is a release-branch cherry-pick batch.
- For login gates, prove system/tenant/site selection, required fields, account response, and active application before retrying. Do not guess passwords or manufacture only a token; use the approved environment lookup or an existing authorized session.
- Clean up temporary browsers, test shims, servers, and occupied ports after verification. Do not leave a passing screenshot backed by a stale process or package.
- Run `selftest` after changing this skill:

```bash
node scripts/his-workflow.mjs selftest --json
```
