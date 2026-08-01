# 04 - YGT 工作流 Harness

这套 harness 用来把一次需求或 bug 修复固化成可复用流程：

1. 修改需求或 bug。
2. 自动判断影响面和验证范围。
3. 本地自测验证。
4. 代码审核快照。
5. 提交并推送。
6. 发布前环境预检。
7. 触发 Jenkins。
8. 等待编译完成。
9. 检查 K8s rollout。
10. 线上 smoke 验证。
11. 生成闭环报告。

脚本入口：

```powershell
node scripts/harness/ygt-workflow.mjs help
```

当前命令总览：

| 命令 | 作用 |
| --- | --- |
| `env` | 输出当前项目和环境变量解析结果 |
| `status` | 查看分支、未提交文件和最近提交 |
| `intake` / `/ygt` | 将一句话需求映射到项目、规范和 harness 命令 |
| `impact` | 根据变更文件判断影响面和验证范围 |
| `doctor` | 检查目录、脚本、凭据和默认 smoke URL |
| `selftest` | 校验 harness 脚本、插件 manifest、skill、安装脚本、文档链接和项目矩阵 |
| `verify` | 运行前端/后端本地验证，支持 `quick`、`standard`、`full` |
| `review` | 输出 status、diff stat 和 `git diff --check` |
| `claim` | 多 agent 场景校验当前改动是否属于指定分工 |
| `commit` / `push` | 按 pathspec 提交并推送 |
| `jenkins` | 触发 Jenkins 并等待构建结果 |
| `rollout` | 通过 SSH 或 Jenkins 检查 K8s rollout |
| `diagnose` | 收集 K8s 状态、Pod 状态和日志尾部 |
| `smoke` | 并行执行 HTTP smoke |
| `report` | 生成 `.ygt-runs/<task-id>/report.json` 和 `report.md` |
| `release` | `impact -> review -> commit/push -> doctor -> jenkins -> rollout -> smoke` |
| `full` | `status -> impact -> verify -> review -> commit/push -> doctor -> jenkins -> rollout -> smoke` |
| `resume` | 从 `.ygt-runs/<task-id>/release-state.json` 断点续跑，不重复已完成阶段 |

`full` 和 `release` 每个阶段都原子持久化状态。Jenkins 排队 URL 和构建 URL 会立即保存；进程重启后，`resume` 继续监听原构建，不重复触发。网络、Jenkins 和 SSH 瞬时错误使用有上限的指数退避，鉴权、配置、验证、提交和推送错误立即停止。

```powershell
node scripts/harness/ygt-workflow.mjs resume --project main --task-id ygt-20260801-topic
```

线上 smoke 重试耗尽后，仅在配置 `--rollback-command` 或 `YGT_ROLLBACK_COMMAND` 时执行回滚；未配置时在状态文件记录 `rollback-required`，不猜测回滚命令。

## 安全约定

仓库只保存服务地址、项目名、Jenkins job、K8s namespace 等共享配置，不保存密码。

Harness 默认提交 pathspec 会排除日志、压缩日志、`.DS_Store`、`.ygt-runs/**` 和本地/私有 env 文件，避免把本地凭据、报告或系统杂项带进提交。

`scripts/harness/ygt-env.company-dev.ps1` 是可提交的团队共享环境文件，只保存地址、用户名和变量名，不保存密码或 token。`ygt-workflow.mjs` 在启动时会自动加载该文件；该文件会优先加载同目录下的 `ygt-env.company-dev.local.ps1`，该文件被 `.gitignore` 忽略，可用于本机开发环境的私密覆盖。个人密码也可以放在系统环境变量、密码管理器 loader、`ygt-env.local.ps1`、`ygt-env.*.secret.ps1` 或 `ygt-env.*.private.ps1` 中。

公司开发环境常用加载方式。一般只运行 harness 时可以省略这一步；需要让同一个 PowerShell 会话里的手工命令也拿到这些变量时再显式加载：

```powershell
. .\scripts\harness\ygt-env.company-dev.ps1
```

本地使用前复制环境模板到非 git 路径并填写凭据：

```powershell
Copy-Item scripts/harness/ygt-env.example.ps1 D:\workspace\local-secrets\ygt-env.local.ps1
. D:\workspace\local-secrets\ygt-env.local.ps1
```

医疗系统排查时不要在汇报里输出患者姓名、身份证、手机号、就诊号等敏感数据。查看日志默认只摘关键错误和脱敏样例。

## 常用项目

| project | 仓库/服务 | Jenkins job | 线上验证入口 |
| --- | --- | --- | --- |
| `main` | `df-ygt-main` | `df-web-ygt-main-prod` | `http://192.168.199.41:8001/` |
| `base` | `df-ygt-biz-base` | `df-ygt-biz-base-prod` | `http://192.168.199.41:9001/swagger-ui/index.html` |
| `huanzhe360` | `df-ygt-biz-huanzhe360` | `df-ygt-biz-huanzhe360-prod` | `http://192.168.199.41:9004/swagger-ui/index.html` |
| `zhusuoyin` | `df-ygt-biz-zhusuoyin` | `df-ygt-biz-zhusuoyin-prod` | `http://192.168.199.41:9002/actuator/health` |
| `shujumx` | `df-ygt-biz-shujumx` | `df-ygt-biz-shujumx-prod` | `http://192.168.199.41:9003/swagger-ui/index.html` |

## 推荐流程

### 0. 一句话入口

新会话里优先使用 Codex plugin 入口：

```text
/ygt 所有子应用表格删除按钮颜色不对，需要修复并部署
/ygt 菜单接口返回不完整，排查原因
/ygt df-web-ygt-biz-shujumx 数据集页面删除操作颜色不明显
```

Codex 当前使用 plugin/skill 机制发现自定义入口，不读取 `.claude/commands`。项目内提供正式 Codex plugin：

```text
.agents/plugins/marketplace.json
plugins/ygt/.codex-plugin/plugin.json
plugins/ygt/skills/ygt/SKILL.md
plugins/ygt/skills/ygt/agents/openai.yaml
```

团队成员已经 clone 仓库时，可以直接双击安装：

```text
scripts/harness/install-ygt-codex-plugin.command   # macOS
scripts/harness/install-ygt-codex-plugin.cmd       # Windows
```

安装脚本会优先安装正式 Codex plugin；如果当前 Codex CLI 版本没有 `codex plugin add` 子命令，会自动退回到复制 `ygt` skill 到本机 `~/.codex/skills/ygt`，仍然可以在新会话里使用 `$ygt`。

也可以在 `df-ygt-main` 根目录用终端执行：

```bash
node scripts/harness/install-ygt-codex-plugin.mjs
```

也可以让脚本把 marketplace source 指向 GitLab：

```bash
node scripts/harness/install-ygt-codex-plugin.mjs --source git@gitlab.df-mic.com:df-ygt/df-ygt-main.git --ref master
```

如果本机还没有 clone 仓库，可以直接执行 Codex CLI 两条命令：

```bash
codex plugin marketplace add git@gitlab.df-mic.com:df-ygt/df-ygt-main.git --ref master --sparse .agents/plugins --sparse plugins/ygt
codex plugin add ygt@df-ygt
```

如果第二条提示 `unrecognized subcommand 'add'`，说明当前 Codex CLI 暂不支持 plugin add。请改为 clone 仓库后双击安装脚本，脚本会自动使用 fallback skill 安装。

安装后新会话会自动发现 `$ygt` skill；`/ygt ...` 也会被该 skill 识别为 YGT harness 入口。

命令执行的本质仍是 harness intake：

```powershell
node scripts/harness/ygt-workflow.mjs /ygt "所有子应用表格删除按钮颜色不对，需要修复并部署" --project auto --json
node scripts/harness/ygt-workflow.mjs /ygt "菜单接口返回不完整，排查原因" --project auto --json
node scripts/harness/ygt-workflow.mjs intake --request "所有子应用表格删除按钮颜色不对，需要修复并部署" --project auto
node scripts/harness/ygt-workflow.mjs intake --request "菜单接口返回不完整，排查原因" --project auto --json
```

`intake` 会把一句话需求或问题映射到 Superpowers 风格技能和 YGT harness 命令：

- `systematic-debugging`：错误、失败、异常、页面不对、数据没出来。
- `brainstorming`：新增功能、设计、改造、需求不明确。
- `dispatching-parallel-agents`：所有页面、所有子应用、多项目并行。
- `subagent-driven-development`：已批准计划后的多任务执行。
- `verification-before-completion`：提交、推送、部署、完成声明前验证。
- `finishing-a-development-branch`：分支收尾、提交、推送、发布。
- `writing-skills`：创建或更新项目技能。

同时 `intake` 会返回 `standards`，这是动手前必须读取的规范清单：

| 类型 | 必读规范 |
| --- | --- |
| 所有任务 | `docs/03-AI协作指南.md`、`docs/04-YGT工作流Harness.md` |
| 前端/UI | `docs/前端开发指南/README.md`、`06-DevExtreme集成.md`、`07-编码规范与测试.md`、`08-布局系统.md` |
| 后端/API/数据库/部署 | `docs/后端开发指南/README.md` 与 `01` 至 `04` 四篇主规范 |
| 布局/间距/查询栏/按钮/弹窗/表格一致性 | `../../df-base/df-web-base/packages/ui/src/layouts/README.md`、`../../df-base/df-web-base/packages/ui/src/layouts/STYLE_CONSTRAINTS.md` |

涉及页面布局一致性时，不允许靠每个页面继续堆局部样式；优先复用 `df-web-base` layout 组件、tokens 和约束。若实现改变了规范口径，必须同步更新对应规范文档。

这一步的目标是让 agent 一次性拿到“该用哪个技能、涉及哪些项目、下一步跑哪些命令”，减少循环追问。

### 1. 开工前状态

```powershell
node scripts/harness/ygt-workflow.mjs status --project main
```

用途：

- 确认当前分支和未提交文件。
- 看最近提交，避免接错上下文。

### 1a. 影响面分析

```powershell
node scripts/harness/ygt-workflow.mjs impact --project main
node scripts/harness/ygt-workflow.mjs impact --project main --json
```

用途：

- 自动识别前端、后端、测试、文档、harness、共享配置等影响面。
- 给出 `frontend-only`、`backend-only` 或 `full` 验证建议。
- JSON 输出可被 agent 或外部脚本直接解析，减少反复询问“该跑哪些验证”。

### 1b. 发布前预检

```powershell
node scripts/harness/ygt-workflow.mjs doctor --project main
node scripts/harness/ygt-workflow.mjs doctor --project main --json
```

用途：

- 检查项目目录、前端脚本、后端 `pom.xml`。
- 检查 harness 必需文件、Codex plugin manifest、marketplace、skill、公司环境脚本和 `.gitignore` 是否齐全。
- 检查 Jenkins 凭据是否在本地环境变量中。
- 有凭据时检查 Jenkins 可达性。
- 并行检查项目默认 smoke URL 是否可达。

### 1c. Harness 自检

```powershell
node scripts/harness/ygt-workflow.mjs selftest --project main
node scripts/harness/ygt-workflow.mjs selftest --project main --json
```

用途：

- 检查 `ygt-workflow.mjs` 和安装脚本语法。
- 校验 `plugins/ygt/.codex-plugin/plugin.json`、`.agents/plugins/marketplace.json`、`plugins/ygt/skills/ygt/SKILL.md`。
- 校验 docs Markdown 文件链接。
- 校验 intake 能输出项目、standards 和 commands。
- 校验项目矩阵都有 Jenkins job 和 smoke URL。

凡是修改 `scripts/harness/**`、`plugins/ygt/**`、`skills/ygt-workflow-harness/**`、`.agents/plugins/**` 或本文件，都必须跑 `selftest`。

### 2. 本地验证

主应用前后端都验证：

```powershell
node scripts/harness/ygt-workflow.mjs verify --project main
```

使用验证矩阵：

```powershell
node scripts/harness/ygt-workflow.mjs verify --project main --profile quick
node scripts/harness/ygt-workflow.mjs verify --project main --profile standard
node scripts/harness/ygt-workflow.mjs verify --project main --profile full
```

验证矩阵说明：

- `quick`：前端优先跑 `typecheck`、`test`；后端跑 `mvn -q test`。
- `standard`：前端优先跑 `typecheck`、`test`、`build`；后端跑 `mvn -q test`。
- `full`：在 `standard` 基础上尝试前端 e2e 脚本和后端 `mvn -q package`。
- 前端脚本会自动探测，项目缺少某个脚本时跳过并提示。

只验证前端：

```powershell
node scripts/harness/ygt-workflow.mjs verify --project main --frontend-only
```

只验证后端：

```powershell
node scripts/harness/ygt-workflow.mjs verify --project main --backend-only
```

纯前端或纯后端改动可以只验证发生变化的一侧：

```powershell
node scripts/harness/ygt-workflow.mjs verify --project main --changed-only
```

默认情况下，前端构建和后端测试会并行执行，以缩短等待时间。如果需要排查日志或避免本机资源争抢，可以改为串行：

```powershell
node scripts/harness/ygt-workflow.mjs verify --project main --serial-verify
```

主应用后端本地启动仍使用项目约定：

```powershell
$env:JAVA_HOME = "D:\Program Files\Java\jdk-25.0.2.10-hotspot"
$env:Path = "$env:JAVA_HOME\bin;" + $env:Path
mvn spring-boot:run "-Dspring-boot.run.arguments=--server.port=8085"
```

### 3. 审核快照

```powershell
node scripts/harness/ygt-workflow.mjs review --project main
node scripts/harness/ygt-workflow.mjs review --project main --json
```

脚本会输出：

- `git status --short`
- `git diff --stat`
- `git diff --check`

这一步用于提交前快速发现空白错误、冲突痕迹和非预期文件。

### 4. 提交并推送

```powershell
node scripts/harness/ygt-workflow.mjs commit --project main --message "fix: keep branding config alive"
node scripts/harness/ygt-workflow.mjs push --project main
```

多 agent 并行集成时，提交必须限制 pathspec，避免误提交其他 agent 或用户的改动：

```powershell
node scripts/harness/ygt-workflow.mjs commit --project main `
  --message "fix: update harness workflow" `
  --include scripts/harness/ygt-workflow.mjs `
  --include docs/04-YGT工作流Harness.md
```

需要排除某些路径：

```powershell
node scripts/harness/ygt-workflow.mjs commit --project main `
  --message "fix: ..." `
  --include frontend/df-web-ygt-main/src/views/** `
  --exclude frontend/df-web-ygt-main/package.json
```

### 4a. 多 Agent 分工校验

为任务创建一个 manifest，例如 `.ygt-task.yml`：

```yaml
taskId: ygt-20260602-menu-fix
project: main
agents:
  fe:
    include:
      - frontend/df-web-ygt-main/src/views/**
      - frontend/df-web-ygt-main/src/router/**
    exclude:
      - frontend/df-web-ygt-main/package.json
  harness:
    include:
      - scripts/harness/**
      - docs/04-YGT工作流Harness.md
exclusivePaths:
  - frontend/df-web-ygt-main/package.json
  - frontend/df-web-ygt-main/pnpm-lock.yaml
  - scripts/harness/**
```

检查当前改动是否属于某个 agent：

```powershell
node scripts/harness/ygt-workflow.mjs claim --project main --task .ygt-task.yml --agent fe
node scripts/harness/ygt-workflow.mjs claim --project main --task .ygt-task.yml --agent fe --json
```

规则：

- 当前改动必须落在该 agent 的 `include` 范围内。
- 当前改动不能命中该 agent 的 `exclude`。
- 命中 `exclusivePaths` 默认失败，应交给集成 agent 处理。

### 5. 触发 Jenkins 并等待结果

```powershell
node scripts/harness/ygt-workflow.mjs jenkins --project main
```

脚本会：

- 请求 Jenkins crumb。
- 触发项目默认 job。
- 等待 queue 进入 build。
- 轮询 build 到 `SUCCESS` 或失败。

需要覆盖 job 时：

```powershell
node scripts/harness/ygt-workflow.mjs jenkins --project main --job df-web-ygt-main-prod
```

需要传 Jenkins 参数时：

```powershell
node scripts/harness/ygt-workflow.mjs jenkins --project main --param BRANCH=master
```

Jenkins 默认 2 秒轮询一次，减少排队和构建完成后的尾部等待；如需降低请求频率可以覆盖：

```powershell
node scripts/harness/ygt-workflow.mjs jenkins --project main --poll-ms 5000
```

### 6. 发布后 K8s 检查

```powershell
node scripts/harness/ygt-workflow.mjs rollout --project main
```

脚本通过部署服务器执行：

```powershell
kubectl -n prod rollout status deployment/<deployment> --timeout=240s
kubectl -n prod get deploy,pod,svc -l app=<app> -o wide
```

这两条命令会合并到同一次 SSH 或 Jenkins script 调用里执行，避免重复建连和重复申请 Jenkins crumb。

如果 SSH 需要密码，建议先配置 SSH key 或在当前终端完成交互登录确认。

如果当前环境没有非交互式 SSH，可以通过 Jenkins 主机执行 K8s 检查：

```powershell
node scripts/harness/ygt-workflow.mjs rollout --project main --via jenkins
```

### 6a. 联机诊断

服务启动失败、CrashLoopBackOff、rollout 超时时，直接收集 K8s 状态和日志：

```powershell
node scripts/harness/ygt-workflow.mjs diagnose --project main --via jenkins --tail 300
node scripts/harness/ygt-workflow.mjs diagnose --project main --via jenkins --tail 300 --json
```

脚本会收集：

- rollout status
- deploy / rs / pod / svc / endpoints
- pod phase、ready、restart、waiting reason
- previous/current logs tail

输出会做基础脱敏，避免把 token、password、authorization 等内容直接带入汇报。

### 7. 线上 smoke 验证

```powershell
node scripts/harness/ygt-workflow.mjs smoke --project main
```

自定义验证地址：

```powershell
node scripts/harness/ygt-workflow.mjs smoke --project main --url http://192.168.199.41:8001/login
```

HTTP 状态码 `200-499` 视为服务可达；业务页面仍需要按需求做浏览器交互验证。

多个 smoke URL 会并行请求，然后按 URL 顺序输出结果。

### 8. 闭环报告

```powershell
node scripts/harness/ygt-workflow.mjs report --project main --task-id ygt-20260602-menu-fix
node scripts/harness/ygt-workflow.mjs report --project main --task-id ygt-20260602-menu-fix --with-doctor
node scripts/harness/ygt-workflow.mjs report --project main --task-id ygt-20260602-menu-fix --with-doctor --with-selftest
```

报告输出到：

```text
.ygt-runs/<task-id>/report.json
.ygt-runs/<task-id>/report.md
```

报告包含当前分支、最近提交、影响面、审核快照、可选 doctor 结果和可选 harness selftest 结果。`.ygt-runs/**` 默认不会被 harness 提交。

## 加速策略

脚本保留完整闭环，但对可并行和可合并的部分做了默认优化：

- 本地 `verify` 中前端构建和后端测试默认并行，`--serial-verify` 可回退。
- `smoke` 多 URL 并行请求，避免多个入口串行等待。
- `rollout --via jenkins` 和 SSH rollout 都只建连一次，同时输出 rollout 和资源状态。
- Jenkins 轮询默认从 5 秒降到 2 秒，`--poll-ms` 可按环境调整。
- `--changed-only` 可在纯前端/纯后端改动时跳过无关侧验证；如果改到仓库根目录或脚本无法判断归属，会自动保持完整验证。
- `impact --json`、`doctor --json`、`review --json`、`claim --json` 让 agent 一次读取结构化结果，减少循环追问。
- `selftest --json` 让 harness/plugin 变更也有机器可读的健康证据。
- `commit --include/--exclude` 和 `claim` 让多 agent 并行时能明确改动所有权。

## 多 Agent 使用建议

推荐模式是“多 worktree + manifest 分工 + 单一集成者”：

1. 按项目拆：`main`、`base`、`shujumx`、`zhusuoyin` 分别给不同 agent。
2. 同一项目内按边界拆：前端页面、后端接口、测试/自测、harness/配置分别给不同 agent。
3. 共享文件必须独占：`package.json`、lockfile、全局样式、路由总入口、harness、数据库结构等只给集成 agent。
4. 每个 agent 工作前跑 `claim`，提交时使用 `--include/--exclude` 限制 pathspec。
5. 集成 agent 负责最终 `verify --profile standard/full`、`release`、`diagnose` 和 `report`。

## 项目技能

本项目内置技能：

```text
skills/ygt-workflow-harness/SKILL.md
plugins/ygt/skills/ygt/SKILL.md
```

支持 Codex/agent 在看到 YGT 需求时先调用 harness intake，再按返回的技能和命令执行。正式入口是 `plugins/ygt/skills/ygt/SKILL.md`；`skills/ygt-workflow-harness/SKILL.md` 保留给本仓库内其他 agent 兼容使用。技能和 harness 代码一起维护，避免流程只存在于单次会话记忆里。

## 一键闭环命令

需求或 bug 已修好后，完整跑完本地验证、审核、提交、发布、线上 smoke：

```powershell
node scripts/harness/ygt-workflow.mjs full --project main --message "fix: remove branding shortcut from header menu"
```

`full` 实际流程：

```text
status -> impact -> verify -> review -> commit/push -> doctor -> jenkins -> rollout -> smoke
```

需要同时生成报告：

```powershell
node scripts/harness/ygt-workflow.mjs full --project main `
  --message "fix: remove branding shortcut from header menu" `
  --task-id ygt-20260602-branding `
  --report
```

如果本地验证已经手动完成，只想提交、发布、线上检查：

```powershell
node scripts/harness/ygt-workflow.mjs release --project main --message "fix: remove branding shortcut from header menu"
```

`release` 实际流程：

```text
impact -> review -> commit/push -> doctor -> jenkins -> rollout -> smoke
```

如果只想触发 Jenkins 和线上检查，不提交：

```powershell
node scripts/harness/ygt-workflow.mjs release --project main --no-commit
```

如果当前任务只需 Jenkins，不需要 K8s rollout 检查：

```powershell
node scripts/harness/ygt-workflow.mjs release --project main --message "fix: ..." --skip-rollout
```

如果已经做过预检，或当前只想跑最短发布链路：

```powershell
node scripts/harness/ygt-workflow.mjs release --project main --message "fix: ..." --skip-doctor
```

需要通过 Jenkins 执行 rollout 时：

```powershell
node scripts/harness/ygt-workflow.mjs release --project main --message "fix: ..." --via jenkins
```

## 联机排查补充

服务启动失败、网关异常、K8s Pod 异常时，按以下顺序排查：

1. 确认服务名、namespace、发布版本和故障范围。
2. 查 K8s 状态：

```powershell
ssh root@192.168.199.42 'kubectl -n prod get deploy,rs,pod,svc -l app=<service> -o wide'
```

优先使用 harness：

```powershell
node scripts/harness/ygt-workflow.mjs diagnose --project main --via jenkins --tail 300
```

3. 查日志，崩溃场景先看 `--previous`：

```powershell
ssh root@192.168.199.42 'kubectl -n prod logs <pod> --previous --tail=300'
```

4. Spring Boot 启动失败优先看 Nacos 加载、数据源、Hibernate schema validation、端口监听、Nacos 注册。
5. 数据库结构问题用 Doris `information_schema.columns` 对比实体映射，避免改错表名或列类型。
6. 发布后必须验证 rollout、Pod readiness、Service endpoints、NodePort `/actuator/health`，并确认新 Pod 日志无旧错误。

## 交给新会话的提示词

下次换会话时可以直接贴：

```text
请使用 df-ygt-main/scripts/harness/ygt-workflow.mjs 执行本次需求闭环。
流程：status -> impact -> 修改代码 -> impact/doctor -> verify --profile standard --changed-only -> review -> commit/push -> jenkins -> rollout -> smoke -> report -> 浏览器自测。
项目按实际传 --project main|base|huanzhe360|zhusuoyin|shujumx，凭据从本地环境变量读取，不要写入仓库。
多 agent 并行时先用 .ygt-task.yml 分配 include/exclude/exclusivePaths，再用 claim 校验改动范围，提交必须带 --include/--exclude 限制 pathspec。
```
