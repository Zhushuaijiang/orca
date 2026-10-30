---
name: his-workflow-harness
description: Run deterministic, evidence-driven HIS and DFHIS verification and release workflows. Use for HIS repository intake, Node/JDK/package-manager selection, local builds, read-only database checks, Jenkins compilation, deployment commands, online smoke checks, release verification, qiankun/iframe E2E 排障（子应用挂载探测、弹窗 DOM 脱钩、导航重试、route 拦截差分验收）, or any request to carry a HIS change from code through environment validation.
---

# HIS Workflow Harness

Use `scripts/his-workflow.mjs` as the executable backbone for general HIS work. Use the YGT skill and its own harness for `df-ygt-*` repositories.

## Multi-project knowledge and code-graph routing

Before searching a repository tree, use the project manifest generated from DFHIS Setup. It supports multiple project roots without embedding machine paths in the skill:

```bash
node scripts/project-index.mjs build
node scripts/project-index.mjs search --project <his|ygt|other-id> --query "<requirement title, route, repository, or symbol>" --limit 5
```

DFHIS Setup exposes `ORCA_PROJECT_INDEX_MANIFEST`, `ORCA_PROJECT_CODE_GRAPH_PATH`, and `ORCA_PROJECT_KNOWLEDGE_INDEX_PATH`; explicit flags override them. The manifest is generated from configured HIS/YGT roots and can declare more projects later. The index stores compact documentation/history metadata plus tracked paths, symbols, routes, imports, and bounded reference edges without persisting source text. Unified search then runs bounded full-text `git grep` only inside routed candidate repositories and returns capped snippets. Repository fingerprints make unchanged builds incremental. Treat hits as candidates, never proof. Read only the top files and validate current code before editing. Legacy `his-fact-index.mjs` and `his-code-index.mjs` remain compatibility fallbacks.

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

macOS stub trap (2026-10-28, DFHIS-32930 session): `/usr/bin/javac` is a macOS system stub — it exists on PATH but fails on execution (`java -version` reports "Unable to locate a Java Runtime"). Layer 3 (PATH lookup) resolves it and misreports `jdkHome=/usr, jdkSource="PATH (javac resolved)"`. Treat any `/usr` result as invalid, do not "fix" it by installing Java, and fall back to the real toolchain entry `~/.local/bin/gradle` (its wrapper script sets JAVA_HOME to `~/.local/share/his-build-tools/zulu8*`); full details in `dfhis-java-unit-test-guide` 「本机 JDK/Gradle 定位」.

## Commands

15.3 本地预发布的 5188 HIS 发布助手不是 152 Jenkins。环境及专用执行入口的唯一正本见 `dfhis-company-environment/references/company-environment/本地15.3预发布环境.md`。先对照仓库/服务/Job 与实际分支/上传目录；共享任务配置不匹配时停在构建前，单独取得修改授权，不将“查对照”当改配置授权。

2026-10-23 三线质控合并/15.3 发版实证：用户指定的发布线必须与实际构建线一致，特性分支已推送不能代替向发布线合入。前端 2sftp Job 由脚本自行 clone 时可能没有 Jenkins SCM BuildData，成功后还会删除 source 目录；`SUCCESS`、分支检查通过和运维版本 Ready 均不能证明包含指定补丁。先在隔离 clone 刷新远端并用 patch 等价性核验目标提交，再核对该次构建制品的摘要、时间窗口和两个以上独立功能标记；不要用稍后移动的分支 HEAD 倒推历史构建 SHA。恢复并回读本任务留下的共享 Job 临时配置；存在其他 activeRun 时等待其终态，不抢锁或重复发布。证据等级：2026-10-23 门诊 #908 的 04.zip 实测缺少显式 QC 初始化门控及两个请求的 showError:false，尽管任务与运维版本均成功。

2026-10-23 运维更新恢复实证（199环境，前端共享web-main）：

- 发布助手下载成功后仍可能等不到构建成功。按精确appVersion读取`/api/ops/releaseApp/getByVersion`、按id读取`listServiceFileStatus`，并按appVersionId读取`listLog`；顶层uploadStatus=2/buildStatus=0/deployStatus=0仅代表上传。单个文件条目的deployStatus=2可能与顶层不一致，不能据此收口；列表首行及其他应用刚发布的共享镜像也不是目标发布证据。
- 已授权恢复发布时，先等原助手任务终态并检查无其他活动发布。运维前端实际契约为POST `startBuild`、构建顶层状态到2后POST `startDeploy`，两者body均为`{id:精确版本记录ID,increment:true}`，不传全局最新版本；调用前核对fileList只有目标包。受理成功不等于完成。请求落盘后如回执不明，先查该record，禁止盲目重放。
- 共享web-main应记录构建前的当前运行镜像，并在部署前检查未被并发发布改变。increment:true是增量操作选项，不能单凭它推断Dockerfile FROM来源。以目标record顶层状态、实际Pod镜像/Ready/端点及线上index和补丁chunk与制品SHA一致验收；其它子应用的保护核验需明确覆盖范围，单比index不得写成全业务回归通过。

152 专用编译/发布任务（DFHIS-32807 实证，df-web-zhuyuanysz）：

- 152 现有前端任务固定构建 RC 分支且构建后**自动发布**。为特定提交/分支编译时新建专用 Job（复用现有流水线、去掉自动发布、校验源码提交号），不改共享任务配置；用户要的是"编译这个分支"时不要顺手触发共享 RC 任务。
- Job 的提交号校验必须用完整 SHA：配成短 SHA 会在源码检出后校验失败，白跑一轮再返工。
- 用户说"到 152 测试"意味着需要**发布到 152**，仅编译不部署不算可测。发布前先回读 152 当前在线版本/提交（可能包含其他已上线修复，直接拿修复分支覆盖会回退它们）；覆盖式发布需用户明确同意（DFHIS-32807 用户拍板"直接覆盖就行了"后才覆盖）。
- 后端服务（df-mic-_/df-bff-_）的 152 专用发布 Job 只复用 `build_app_img.py`/`publish_app.py` 时不够：两脚本共用 `/root/his-prod/<app>/source`，共享 RC 任务会在其后用同目录重新 clone/构建并发布，把分支镜像覆盖成 RC 镜像（DFHIS-32776 实证：HEAD 校验通过、tag 已更新，线上 jar 却没有新增方法，字段一直为空）。Job 内必须三重断言——源码 HEAD、源码 grep 新增方法、`unzip -p <jar> <Impl>.class | strings | grep -c <方法名>` 大于 0；接口缺字段时先核对 Pod 镜像 tag/创建时间再怀疑业务代码。口径正本见 `dfhis-company-environment/references/runtime-toolchain.md` 的「152 后端发布」节。
- 新建 Job 属于共享 CI 变更，受限权限模式下会被拦下；此时准备只读探测/发布命令交用户放行，不要退回触发共享 RC 任务，也不要反复重试。

Jenkins「编译报错」实为启动 fail-fast（2026-10-29 df-mic-binglizk SP19 实证）：

- Jenkins 任务整体红字被当成"编译报错"时，先读日志确认是编译失败还是服务**启动 fail-fast**——平台依赖守卫（DependencyProcessor）在启动期判定「A 服务禁止依赖 B 服务」时 Jenkins 同样红字。排查前先向用户要守卫截图/日志尾部，不要直接改代码修"编译"。
- 根因模式：df-his-api 公共包 `mic-<svc>-api` 里混放指向其他服务的 `@FeignClient` 契约，老分支用 `@EnableFeignClients("com.df.cbhis.**.api")` 包通配扫描把它们全部注册进容器触发守卫（如质控依赖病历库）。审计一条分支是否安全先看扫描写法：显式 `clients = {...}` 列表天然免疫，通配包扫描才有此风险。
- 修复口径：收窄扫描为精确包列表（SP19 提交 `7f883b0e`）；**改扫描范围必须同时核对框架 starter 依赖的客户端**——漏掉会导致启动时 bean 注入失败、环境重启失败（SP19 提交 `4bad1a17` 补回 `com.df.cbhis.dfmessage.api` + `com.df.cbhis.mic.api`）。收窄后还要反向核对列表外导入：仅引用 `PATH` 常量/静态方法不算 Feign 注入，仅被 0 引用死接口继承的客户端不会注册为 bean。
- 本机快速验证：`JAVA_HOME=$HOME/.jdks/<jdk11> ~/.local/bin/gradle :<module>:compileJava`（需要 JDK11 的服务显式覆盖 JAVA_HOME，`~/.local/bin/gradle` wrapper 默认给 zulu8）；打 bootJar 对齐 Jenkins 发布口径时加 `-x generateGitProperties`（jgit 不认 git worktree）。

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
- `verify` runs repository or catalog build/test/E2E commands with the selected Node directory first on `PATH`. For package repositories, automatic detection prefers `build`, then `test:unit` and `test` when they are distinct, then the first available E2E or screenshot script from `e2e`, `test:e2e`, `e2e:screenshot`, `test:e2e:screenshot`, `screenshot`, `test:screenshot`, `visual`, `test:visual`, `playwright`, `test:playwright`, `cypress:run`, or `cy:run`. This detection is only a convenience; qiankun HIS flows still require integrated main-app plus local sub-app E2E when the requirement changes a mounted sub-application path.
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

## Unit Test Gate (mandatory for HIS changes)

Behavioral HIS frontend/backend changes require meaningful automated coverage of the changed outcomes. Reuse or extend existing tests; do not count placeholder tests or require new tests for reversible, low-impact documentation/style-only changes. Follow the current task and repository requirements.

Rules:

- After implementation and before commit/push, add or extend unit tests covering the changed main scenario and risk-relevant regression branches, following the repository's existing test conventions (inspect the actual repository test runner and scripts; use its Node/Jest/JUnit conventions instead of imposing one framework).
- Run the unit tests through `verify` when a test script exists, otherwise run them directly, and record test file paths, scenario count, and run result as `passing_test` evidence.
- If the repository has no unit test surface yet, create one with the lightest existing HIS convention — missing infrastructure is not an exemption.
- `npm run build`, lint, `git diff --check`, Jenkins compilation, and smoke checks never substitute for unit tests.
- Module-specific stricter rules (e.g. `dfhis-yizhu-kaili` scenario matrix) apply on top of this gate, not instead of it.

## 数据变更门禁（上线/发云效之前）

需求带 SQL、参数、字典、菜单或数据修复脚本时，**先跑门禁，再发布或上传到云效**：

```bash
python3 ~/.agents/skills/dfhis-data-change-sql/scripts/check_data_change.py --file <requirement_dir>/sql/<id>.sql
python3 ~/.agents/skills/dfhis-data-change-sql/scripts/check_data_change.py --work-item <DFHIS-ID>
```

- 退出码 0 才算过；非 0 逐条修：去 `begin;/commit;`、删断言型 `do $$`、DML 型 DO 块改普通语句、把「见附件」指针替换成 SQL 正文。
- 脚本正文必须写进云效「数据变更」字段；字段上限 16,000 字符，超长才允许在字段写「超上限 + 摘要 + 附件名」并说明原因。
- 门禁通过后才允许 `jenkins`/`deploy`/`full` 里的发布动作，也才允许评论与字段回写；发布完仍要按 Evidence Gate 记录 deployment/smoke 证据。
- 脚本里不得出现数据库密码、令牌或患者敏感数据；门禁结果与「跑两遍」的执行证据一起记入 Evidence Gate 的 database 证据项。
- 规则正本见 `dfhis-data-change-sql`。

## Requirement E2E Gate

HIS E2E testing is possible and required when a requirement changes a user-visible frontend flow, permissions/menu behavior, login-dependent interaction, cross-page workflow, or frontend-backend integration that cannot be proven by unit tests alone.

Use this decision order:

1. Before writing login, system selection, or clicks, reuse `dfhis-e2e-reuse` (remote pack; if the pack lacks it, fall back to the `dfhis-ui-test-delivery` template) and update its keeper row when this run leaves a stable script. The `dfhis-ui-test-delivery` template's `loginAndOpenTarget` is empty.
2. If the repository already exposes `e2e`, `test:e2e`, `playwright`, `test:playwright`, `cypress:run`, or `cy:run`, inspect it and adapt the requirement flow into the `dfhis-ui-test-delivery` artifact directory. Execute browser interaction through `ui-e2e-sandbox`; do not launch the macOS desktop browser.
3. If the requirement has a concrete browser path but no E2E script exists, copy the focused container template from `dfhis-ui-test-delivery` into the requirement artifact directory, implement the real flow, and run it after build and automated tests. Do not commit generated evidence or credentials to the product repository.
4. If E2E cannot run because environment data, browser dependencies, or test accounts are missing, record that exact blocker and compensate with the strongest available evidence: unit/integration tests, build, read-only database checks, Jenkins, deployment, and online smoke.

Do not treat Jenkins compilation, package build, `git diff --check`, or HTTP smoke as E2E evidence. Smoke only proves a mapped endpoint is reachable. A successful build must be followed immediately by the applicable automated tests before claiming a HIS requirement is complete. For frontend work, do not repeat implementation loops after a successful build without first running the available unit, integration, screenshot, or E2E test surface and using the failure evidence to guide the next edit.

Pass `--work-item`, `--ui-test-script`, `--artifact-root`, and `--ui-base-url` to `build` or `full` to insert the remote Docker browser gate immediately after local verification. The default backend is `remote` at `root@192.168.1.10`; override it only with `--ui-sandbox-backend` or `--ui-sandbox-remote`. The test process, browser, and evidence capture run inside the ephemeral container. `--allow-mutations` authorizes release operations only; UI business writes require the separate `--allow-ui-mutations` flag plus a named safe test subject and cleanup.

Known format gap (DFHIS-32808): the gate layer additionally expects a JUnit `reports/results.xml`, while the current sandbox runner in qiankun gray E2E runs only writes `reports/sandbox-run.json` — a run can end with manifest passed/exit 0 yet harness `ok:false` purely for the missing file. Accept the run on the manifest + `logs/browser-test.log` + final screenshots, record the discrepancy honestly in evidence, and do not re-run the E2E just to satisfy the missing XML.

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

6. Login through the shell with a real test account for the selected company environment. If the login password is unknown, read `~/.dfhis-e2e-env` (`DFHIS_USERNAME`/`DFHIS_PASSWORD`, mode 0600) or ask the user for it. Do not look up `公用_万能密码` in `df_zhushuju.gy_canshu`: the universal password is dual-generation — the old plaintext parameter is retired and the current value lives encrypted in `gy_peizhixx` (`万能密码配置`, AES-GCM), not readable from the database. Trying the old value, code-comment example passwords, or guesses against a real login burns the account's attempt quota (DFHIS-32808: E2E only passed on run 20 after the user supplied the real password). Use a real password only as local E2E input and do not echo it in reports. Do not fake only `token` for integrated E2E; the shell also builds menus, tabs, active app state, user context, department/campus data, and qiankun mount props from backend responses. After selecting a system, assert the system input or active application state is actually set before clicking the real submit button; broad text clicks such as `getByText(/登录/)` can hit the login tab instead of the button.
7. Open the flow through the shell UI, menu, tab, or patient workflow that creates the expected `viewList` entry. Directly visiting `/apps/<xiTongId>/...` may not mount the sub-app if the shell has not prepared the matching tab/menu state. A shell home page, application dashboard, or menu overview is not enough; open a concrete target menu/page and assert the URL, tab title, or page text matches that page. If the shell uses a menu panel, first click the menu opener, then click a leaf menu item and wait for the routed page.
8. Prove the local gray sub-app was really used: record network evidence for the local sub-app entry, `config.json`, JS/CSS assets, and at least one route/page chunk when a concrete page is tested. Assert the qiankun container such as `#apps-<xiTongId>` exists, is visible (`display` is not `none`), has mounted content, and contains the expected micro-app root such as `#micro-app`. A hidden container or an empty mounted shell is a failed E2E even if `#apps-<xiTongId>` exists.
9. Inspect screenshots before reporting success. The final screenshot must show the target business page or required workflow state, not only the login page, shell home page, or menu list. Record residual console errors separately: fail on qiankun/bootstrap/mount/CORS/asset errors for the changed sub-app; document unrelated pre-existing shell errors without treating them as sub-app proof.
10. After Jenkins/package/deployment, repeat online verification through the deployed shell and verify the served sub-app entry/version/hash. Deployment smoke is not a substitute for the integrated local E2E above.

If the account, menu permission, patient/order data, cross-origin browser, or environment proxy is missing, stop and report that blocker precisely. Do not replace this gate with build success, HTTP smoke, or standalone sub-app screenshots.

## Qiankun E2E 排障与加速（DFHIS-32040 实测沉淀）

以真实事故为准的硬规则，执行上面的集成 E2E 前先过一遍：

1. **先确认子应用挂载形态再写探测**。devDebug 灰度下子应用可能跑在 **iframe**（如 df-web-main 病区医生站）而非 qiankun div；`document.body.innerText`/`textContent` 探不到 iframe 内容，会出现"截图已渲染、就绪探测永远 false"。第一步先 dump `page.frames()`：子应用在 iframe 里就全程用 `frame.getByText/…` 操作（截图仍用 `page.screenshot`），在 div 里才用 page 级选择器。
2. **不删除弹窗或遮罩 DOM 来取得通过截图**。这会使组件状态与 DOM 脱钩，也可能隐藏真实业务阻断（DFHIS-32040）。通过正常关闭/取消处理允许关闭的提示并验证状态；诊断性 DOM 改动后必须重载并从正常入口重验，诊断截图不作最终验收。
3. **门户内导航必须 URL 断言 + 有界重试**。双击病人卡/菜单项可能因残留 tab、未保存确认框而不跳转；每步导航后断言 `page.url()` 或目标 frame 文本，失败则处理确认弹窗后重试（≤4 次），不要裸等。
4. **竞态/时序类缺陷用 route 拦截做确定性差分验收，优先于搭本地全栈**。缺陷若依赖"字典未加载完/字典缺失"这类竞态（DFHIS-32040 根因），用 Playwright `route` 拦截对应接口响应并置空/篡改，100% 复现；旧包（部署环境）与修复包各跑一遍截图对比即证据。比搭"本地门户+bui+子应用 dist 垫片"全栈省 40-70 分钟，且无环境排障。
5. **区分非致命环境噪音**。本地 bui 与 RC 分支子应用存在 DFhelper 方法错配（`getZiDianAllFenLeiList is not a function` 等 pageerror），页面仍可完整渲染；记录即可，不要据此返工。152 在线门户的部署包本身可能损坏（引用旧 static 路径 404），用前先用一次截图确认可用，坏了立即换本地壳子，别在它的报错上空耗。

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

Stage success is not requirement acceptance. Use the [shared quality contract](../requirement-delivery-flow/references/quality-contract.md) for acceptance mapping and developer-test handoff. Unknown verification commands are `command` evidence; compile-only is `build`, and screenshot-only is `screenshot`. Inspect actual test counts/skips and business assertions before treating a successful test command as coverage. Missing main-flow evidence still blocks a ready-for-test claim even if other available checks pass.

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
- Gradle `generateGitProperties` on a Windows requirement worktree can throw `RepositoryNotFoundException` for `.git/worktrees/<name>` even when `git status` works (DFHIS-32683). Rerun the focused test with `-x generateGitProperties`. Do not edit the main clone `.git`.
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
