---
name: his-release-merge
description: HIS 发版分支间按需求 cherry-pick 合并。用于根据钉钉/Excel 合并清单，把多个 HIS 服务或前端包的指定需求分支合并到 release/RC 分支；必须先按服务分类、复制或克隆到隔离工作区，禁止直接修改原始仓库目录。当不能整体 merge 长生命周期分支、需要跨分支合并提交、发版合并、需求合并到 release 时使用。
---

# HIS 发版分支隔离 Cherry-Pick 合并流程

## 适用场景
HIS 项目中，RC/集成分支是长生命周期分支（含上千条提交、几十个单号），**不能整体 merge**。需要按 Excel/钉钉清单中的服务、需求分支或单号，逐个 cherry-pick 实际特性提交到目标 release/RC 分支。

## 核心原则
1. **禁止污染原始仓库**：源代码目录只允许读；不要在源目录执行 `checkout`、`pull`、`cherry-pick`、`merge`、`reset`、`commit`、`push`。所有可变操作必须在本次会话的隔离副本中执行。
2. **先分服务再合并**：HIS 代码目录通常是多仓库聚合目录，必须按清单服务名映射到具体 `.git` 仓库后逐仓处理。
3. **只合需求的实际 diff，不合分支世系**：长分支里的底层提交大多已通过别的路径进过目标分支。只能 cherry-pick 与当前需求/特性有证据关联的提交；不得把 `target..source`、`merge-base..source` 或来源分支历史中的无关提交整体纳入待 pick 列表。
4. **冲突时还原原始 diff**：用 `git show <原提交>` 看真实改动，只套用该 diff，不把世系里别的提交改动拖进来。
5. **先建特性提交集合，再执行**：每个待 pick SHA 都必须写明入选依据（单号、分支名、文件 diff、提交主题/body、父子依赖）。依据不足的提交只列为“排除/待确认”，不要执行。
6. **逐条 cherry-pick**：一次一条，遇冲突立即停下解决，不批量。
7. **不能承诺一次性完美合并**：清单字段、服务映射、分支存在性、提交依赖或冲突任一项不确定，都必须停在预合并计划阶段请用户确认。
8. **推送前必须校验 + 用户确认**；默认不推送。
9. **服务归属不猜测**：服务别名、页面归属或仓库映射无法从清单、本地代码和 Git 证据确认时，先调用 HIS MCP `dfhis_agent_chat` 询问候选归属；其结论只能作为线索，仍须用本地仓库和提交 diff 验证。工具不可用时记录限制并请用户确认。
10. **合并后走可执行验证**：通用 HIS 仓库使用 `his-workflow-harness`，医共体仓库使用 YGT harness；按仓库声明切换 Node/JDK/包管理器，并保留 build/Jenkins/deployment/smoke 证据。

---

## Step 0: 读取并规范化合并清单

### 0.1 解析 Excel/钉钉清单
对 `.xlsx` 清单先做只读解析，至少识别这些列：

| 列 | 用途 |
|----|------|
| `类型` | 服务端/客户端，用于分组 |
| `服务及分支` | 同时包含服务别名和一个或多个候选分支，必须拆分 |
| `需合并分支` | 版本线备忘，已知映射见下；不能把 `15.3`、`16.1` 字面量直接当 Git 分支名 |
| `是否完成合并` | 默认跳过 `已合并`、`无需合并`，除非用户明确要求复核 |
| `备注` | 可能含需求链接、异常说明、重发/重启等非代码项 |

拆分规则：

```text
服务及分支 = <服务别名><空白><候选分支文本>
候选分支文本按 |、逗号、空白 分段后，保留像 feat/feature/hotfix/bugfix/RC/release/DFHIS 的分支或单号 token。
纯版本 token 按版本线映射处理，不当作来源分支。
```

已知版本线映射：

| 清单版本 | Git 分支 |
|----------|----------|
| `16.1` | `RC_2.16.1_250514` |
| `15.3` | `release_2.15.3_250515` |

若一行写 `15.3|16.1`，通常表示需要把来源需求分别落到两个目标分支，或检查两个版本线的合并状态；执行前必须让用户确认是“从 16.1 合到 15.3”、还是“同一需求分别合入 15.3 与 16.1”。没有确认时不要自动选择方向。

遇到 `需要重新编译`、`无变更但需要重发`、`重启`、空分支、只有版本号、服务名无法识别时，标记为 `人工确认`，不要自动合并。

### 0.2 生成待处理计划
按 `类型 -> 服务别名 -> 候选分支/单号` 分组输出：

```text
服务类型 | 服务别名 | 仓库候选 | 来源分支候选 | 目标版本线 | 状态 | 行号 | 备注
```

必须先给用户确认以下内容再执行合并：

- 服务别名到真实仓库路径的映射。
- 来源分支和目标分支的精确 Git ref。清单中的 `16.1` 必须展开为 `RC_2.16.1_250514`，`15.3` 必须展开为 `release_2.15.3_250515`。
- 跳过 `已合并/无需合并` 的行是否符合预期。
- 非代码项、重发项、重启项是否只记录不合并。

---

## Step 1: 服务仓库发现与隔离副本

### 1.1 发现多仓库目录
在 HIS 聚合代码目录只做读操作：

```bash
find <his-code-root> -mindepth 1 -maxdepth 5 -type d -name .git -prune -print
```

为每个仓库记录：

```text
分类路径（backend/base、backend/lc、web/lc 等） | 仓库名 | 绝对路径 | remote.origin.url | 当前分支
```

服务名匹配优先级：

1. 精确匹配仓库名。
2. 规范化前缀匹配：`df-`、`df-mic-`、`df-agg-`、`df-bff-`、`df-web-`。
3. 既有别名映射表。没有映射表时，不要猜业务缩写（如 `gy-jichufw`、`jj-guahao`、`ykf-jichuyw`），必须请用户确认。

若一个服务别名匹配 0 个或多个仓库，停止该服务的合并。

### 1.2 复制到隔离工作区
为每个确认过的真实仓库创建独立副本。推荐使用不会修改源仓库元数据的本地克隆：

```bash
mkdir -p <session-workspace>/his-release-merge/<batch-id>/<type>
git clone --no-local <source-repo-path> <session-workspace>/his-release-merge/<batch-id>/<type>/<repo-name>
```

不要用 `git worktree add`，除非用户允许修改源仓库的 `.git` 元数据。复制后所有命令都在副本执行：

```bash
cd <isolated-repo>
git remote -v
git status --short
```

如需更新远端引用，只在副本中执行：

```bash
git fetch --all --prune
```

---

## Step 2: 预合并分析

### 2.1 确认分支与 fork 关系
```bash
# 目标分支 target, 来源分支 source
git rev-parse --verify origin/<source>
git rev-parse --verify origin/<target>
mb=$(git merge-base origin/<source> origin/<target>)
git log -1 --format='%h %ci %s' "$mb"
git diff --stat origin/<target>...origin/<source>
```

- 若 merge-base 是近期：分支同源，cherry-pick 冲突少。
- 若 merge-base 很老：不同版本线（如 2.15.3 vs 2.16.1），冲突概率高，需更仔细。
- 若来源/目标 ref 不存在：停止该服务。

### 2.2 定位每个需求的实际特性提交
目标是建立“特性提交集合”，不是枚举来源分支相对目标分支的全部历史。优先按明确来源分支定位；没有明确分支时，再按需求单号搜索。

来源分支明确：

```bash
git log --reverse --no-merges --format='%h %P %ci %s' origin/<target>..origin/<source>
```

上面命令只用于生成候选池，不等于待 pick 列表。必须逐条判定候选提交是否属于当前需求/特性：

- 提交主题、body、分支名、需求单号或文件改动路径能明确关联当前需求。
- `git show --name-status <sha>` 的文件列表和清单服务/需求描述一致。
- 小型特性分支可把连续相关提交作为一个特性组，但仍需排除 merge、同步、格式化、回滚、其他单号、公共底座升级等无关提交。
- 若某提交只是来源分支世系里的历史、同步主干、合并其他需求、改动文件与需求无关，标记为“排除: 无关历史/非本特性”，不得 pick。

仅有单号 `NUM`：

```bash
git log --all --format='%h %D %ci %s' --grep="<NUM>"
```

如果单号只出现在部分提交里，需结合时间邻近、父子关系和 diff 判断是否属于同一特性组；不能因为在同一来源分支上就把附近所有提交都纳入。

对每条候选提交，排除已在目标里的提交：

```bash
git merge-base --is-ancestor <sha> origin/<target> && echo "已在目标" || echo "需pick"
git cherry origin/<target> <sha>   # 辅助判断 patch-id 等价提交，不能单独作为最终依据
```

对入选和排除都要留证据：

```bash
git show --stat <sha>
git show --name-status <sha>
git show --no-patch --format='%h %P %D%n%B' <sha>
```

> 小型特性分支：可以用 `git log --reverse <merge-base>..<branch>` 列全部独有提交作为候选池，但仍必须逐条筛选。只有提交内容都属于同一需求/特性时，才可作为同一组按时间顺序 pick。
> **注意**：tip 提交可能消息不带单号（单号在 body 或前面几条同特性），可按时间顺序把同一特性组一起 pick；但必须排除不相关历史记录。

### 2.3 确定依赖顺序
检查每条 tip 的父提交是否是另一个需求：

```bash
git log --oneline --first-parent -3 <sha>
git show --no-patch --format='%P' <sha>
```

若 A 的父提交是 B 的 tip → **B 必须先于 A 合并**。
若候选提交中含 merge commit，必须人工确认 `-m <parent-number>`，默认不 pick merge commit。

### 2.4 输出待合并清单
列出：Excel 行号 → 服务 → 仓库副本路径 → source → target → 入选特性提交数 → 入选 SHA 列表和依据 → 排除 SHA 列表和原因 → 是否有依赖/merge commit/空提交风险。**先给用户确认顺序再动手**。

若无法说明某个 SHA 为什么属于当前需求/特性，默认排除并请用户确认。禁止输出“来源分支独有提交 N 个，所以全部 pick”这类计划。

---

## Step 3: 执行 Cherry-Pick

### 3.1 准备
```bash
git switch -c merge/<batch-id>/<repo-name> origin/<target>
git status --short             # 必须干净
base_before=$(git rev-parse HEAD)
printf '%s\n' "$base_before" > <session-workspace>/his-release-merge/<batch-id>/logs/<repo-name>.base-before
git config rerere.enabled true # 可选：只在副本记录重复冲突解决
```

### 3.2 逐条 cherry-pick（按 Step2 的依赖顺序）
只允许 pick Step2.4 中已确认的“入选特性提交”。不得临时追加未分析 SHA，也不得用范围表达式执行 cherry-pick。

```bash
git cherry-pick -x <sha>
```

- **EXIT 0**：自动合并成功，继续下一条。
- **EXIT 1（冲突）**：进入 Step 4。
- **空提交/重复提交**：用 `git show <sha>`、`git cherry origin/<target> <sha>` 和目标历史确认后，记录为已包含或人工确认，不要静默跳过。

---

## Step 4: 冲突解决（关键）

### 4.1 定位冲突
```bash
git status --short
git diff --name-only --diff-filter=U
grep -n "<<<<<<<\|=======\|>>>>>>>" <冲突文件>
```

### 4.2 【最重要】还原原始提交的真实 diff
冲突区可能混入来源分支世系里**别的提交**的改动（cherry-pick 基于三方合并）。**必须**看原始提交实际改了什么：

```bash
git show --stat <原提交sha>
git show --find-renames --find-copies <原提交sha>
git diff AUTO_MERGE -- <冲突文件>  # 若 Git 版本支持，用于审查工作区相对自动合并结果的手工改动
```

判断标准：原提交真实 diff 才是要套用的；冲突区里"原提交没动、但因世系不同出现的行"属于**别的提交**，不要带进来。

### 4.3 选择解决策略
| 情况 | 策略 |
|------|------|
| 双方都改同一行，语义一致仅写法不同 | 取来源方（incoming）版本，或合两者优点 |
| 来源方引入新符号（函数/变量/导入） | **先确认目标分支已 import/声明该符号**，否则补声明或放弃该部分 |
| 冲突区含世系别的提交改动 | 只保留原提交真实 diff 部分，丢弃世系改动 |
| 原提交 diff 很小（如 1→3 行） | 严格按 `git show` 结果套用，不扩大 |
| 文件重命名/删除冲突 | 先用 `git show --name-status <sha>` 确认原提交是否真的重命名/删除 |
| 配置、路由、菜单、SQL、接口契约冲突 | 必须做引用链检查，不能只消冲突标记 |

### 4.4 解决后自检
```bash
grep -n "<<<<<<<\|=======\|>>>>>>>" <文件>   # 必须 0 残留
# 确认用到的新符号都有 import/声明
```
```bash
git add <文件>
git cherry-pick --continue --no-edit
```

---

## Step 5: 合并后校验

### 5.1 无冲突标记
```bash
files=$(git diff --name-only <合并前base>..HEAD)
for f in $files; do grep -lE '<<<<<<<|>>>>>>>' "$f"; done   # 应无输出
```

### 5.2 按项目类型校验

优先从隔离仓库运行 `his-workflow-harness intake`，再按输出执行 `verify`。若本批次同时要求编译发布且服务目录映射完整，运行对应的 `jenkins`、`deploy`、`smoke` 阶段并保存报告。下面命令只作为 Harness 无法覆盖时的项目级后备。

前端项目：

```bash
for f in <改动的.js>; do node --input-type=module --check < "$f" && echo "OK $f"; done
npm test -- --runInBand      # 若项目已有测试且依赖可用
npm run build                # 若时间和依赖允许
```

> eslint 在含模板字面量的 .vue 上可能崩 `template-curly-spacing` TypeError，是工具 bug。判断是否基线就有：`git show <base>:<file> | eslint`。基线就崩则非本次引入。

后端 Gradle/Maven 项目：

```bash
./gradlew test               # Gradle 项目优先
./gradlew build -x test      # 测试耗时过长时，至少编译
mvn test                     # Maven 项目
```

若依赖缺失或测试无法运行，必须在汇总中写明未验证原因。

### 5.3 括号配平（注意用字符计数，非行计数）
```bash
echo "{ = $(grep -o '{' $f | wc -l)  } = $(grep -o '}' $f | wc -l)"
```

### 5.4 新文件引用
新增的 .js/.vue 是否被 import、组件是否在 config 注册：

```bash
grep -rn "<新文件名>" <相关目录> --include=*.vue --include=*.js | grep -iE "import|register|components"
```

### 5.5 依赖符号定义
冲突解决中用到的新变量/函数，确认在作用域内有声明（`grep` 定位 `let/const/import`）。

### 5.6 生成交付包
默认只在隔离仓库留下合并分支和验证日志，不推送。每个仓库至少输出：

```bash
git log --oneline --decorate <合并前base>..HEAD
git diff --stat <合并前base>..HEAD
git status --short
```

---

## Step 6: 推送或回传

### 6.1 确认状态
```bash
git rev-list --count @{u}..HEAD   # 待push数
git rev-list --count HEAD..@{u}   # 落后数（必须0，否则先pull/rebase）
```

### 6.2 **经用户确认后**推送
```bash
git push origin <target>
```

若用户只要求生成可审查结果，不推送：提供每个隔离仓库路径、合并分支名、提交列表、冲突说明和验证结果。

---

## 常见陷阱（必读）

1. **rev-list ^target 给出上千提交**：长集成分支正常现象，因为 fork 点老 + 分支内反复 merge master。真实特性提交通常只占其中少量几条。**用 merge-base + grep 单号 + git show diff 证据定位，不用 rev-list 计数判断，更不能全部 pick**。
2. **冲突区出现"原提交没改的行"**：是世系里别的提交的改动被三方合并带出。用 `git show <原提交>` 核对，只保留真实 diff。
3. **incoming 用了未声明变量**：说明该变量声明在来源分支世系的另一个提交里，目标分支没有。要么补声明，要么放弃该部分（并告知用户业务影响）。
4. **tip 提交消息不带单号**：单号可能在 body，或前几条同特性提交里。只把同一特性组按时间顺序 pick；附近但无证据关联的历史提交必须排除。
5. **.md 文档文件**：cherry-pick 可能带入开发笔记 .md，确认是否需要保留（团队规范）。
6. **不要 git cherry-pick 一串多个 sha 或范围**：批量 pick 遇中间冲突处理混乱，也容易夹带无关历史。**一次一条，只 pick 已确认的特性提交**。
7. **不同版本线（2.15.3↔2.16.1）冲突会更多**：耐心按 Step3 逐个解决，每处都用 `git show` 还原。
8. **Excel 的服务名可能是业务别名**：例如服务清单名不一定等于仓库目录名，不能靠模糊匹配直接合并。
9. **`需合并分支` 可能不是 Git 分支**：常见值 `15.3|16.1` 是版本线备忘，必须映射到真实 release/RC 分支。
10. **本地源仓库不能动时不要用 worktree**：`git worktree add` 会在源仓库 `.git` 记录 linked worktree 元数据。使用 `git clone --no-local` 或完整目录复制。
11. **重复需求跨服务出现**：同一单号可能同时涉及 BFF、MIC、WEB；每个仓库独立确认、独立合并、独立验证。
12. **自动合并成功不等于业务正确**：路由、菜单、接口 DTO、SQL、配置项、枚举常量需要引用链检查。

## 输出规范
预合并计划：

```text
行号 | 类型 | 服务别名 | 仓库副本 | source | target | 候选提交 | 风险 | 操作
```

每完成一个需求：

```text
✅ <服务>/<DFHIS-XXXX或分支名> (<new sha>) [自动合并 | 冲突N处:文件 | 跳过:原因]
```

全部完成后给汇总表 + 冲突处理说明 + 验证命令结果 + 待人工复核项 + 隔离仓库路径。不要声称“完美合并”，只说明已完成的验证范围和剩余风险。
