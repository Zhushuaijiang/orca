---
name: his-evidence-prompt-guide
description: 东昉 HIS/DFHIS 证据化质量层。任何提及 DFHIS-数字、ORIGIN-数字、云效工作项或 devops.aliyun.com/projex 链接，以及要求分析、修改、修复、实现、验证或交付 HIS/DFHIS 需求或缺陷的请求，都必须自动加载本技能；覆盖六维对照（角色、对象、流程、场景、规则、能力）、需求与缺陷同一骨架、一次完成少返工、证据分级、边界声明、失败处理与交付关门。与 yunxiao-requirement-archiver 及领域技能配合，不替代具体业务规则。
---

# HIS 证据化提示词指南

把本技能当作 HIS 工作的共享质量层。用户指令、`AGENTS.md`、仓库约定和更具体的领域技能优先；本技能统一证据与交付纪律，不擅自扩大权限。

## 强制路由

- 用户请求中只要出现符合 `DFHIS-数字` 的工作项编号，无论动词是查看、分析、评审、修改、修复、实现、验证、交付、回写还是发布，都必须加载并应用本技能；不要求用户显式点名。
- 处理 `ORIGIN-数字`、云效工作项或 `devops.aliyun.com/projex` 链接，并涉及 HIS/DFHIS 需求内容、代码或交付时，同样必须加载本技能。
- `yunxiao-requirement-archiver` 负责工作项归档和交付流程，本技能负责共享证据与质量合同；两者命中时必须同时应用，不能二选一。
- 强制加载只约束分析与交付质量，不扩大代码修改、外部回写、发布或生产操作权限。

## 核心约束

1. 先识别意图，再加载最小必要上下文。区分普通解释、Schema/SQL、业务流程、代码链路、云效需求、实施改造和运行排障；只加载真正匹配的领域技能与证据源。
2. 先取证，再下结论。表、字段、接口、类、路径、参数、状态值、业务入口和工作项内容必须来自实际读取的权威材料。
3. 对每个关键判断标记证据等级：
   - 已证实：直接来自当前读取的代码、Schema、SQL、配置、工作项或实测输出。
   - 推断：证据支持但未直接证明；写清推断链与验证办法。
   - 未验证：缺关键材料；不得写成事实。
   - 模拟接口、手工置状态的反例须声明前置条件。运行时根因还须证明正常入口、分支可达、症状和因果链；不能把未启用分支的反例归为现场缺陷。重打开审核与开发测试交接详见 [复盘与交接](../dfhis-reopen-lessons/docs/reopen-audit.md)。
4. 分析权限不等于修改权限。回答、诊断和范围评估默认只读；只有用户明确要求实施时才修改，并继续遵守仓库、分支、发布与外部系统权限规则。
5. 输出先给结果，再给最相关证据、边界和可执行下一步。服从用户对篇幅和格式的要求，不展示搜索过程、内部思考或"让我整理"等过渡话术。
6. **带 SQL/参数/字典/菜单脚本的需求，发布到云效之前先过数据变更门禁**：脚本正文写进「数据变更」字段（普通 PostgreSQL DDL/DML，无 `begin/commit`、无 `do $$`、无存储过程），并跑 `python3 ~/.agents/skills/dfhis-data-change-sql/scripts/check_data_change.py`（退出码 0 才能继续评论/附件/字段回写）。规则正本 `dfhis-data-change-sql`；materials 未通过门禁不得进入交付汇报。
7. 任何密钥、密码、令牌、连接串或患者敏感数据都不得写入提示词、长期记忆、技能、分析报告或普通回复。必须引用时只给脱敏标识和安全位置。
8. 工具失败、超时、限流、权限不足和返回格式异常都是失败或部分完成，不能标记为成功；保留已验证结果，说明缺口，并给最小恢复动作。
9. 路径、URL、表名和可复制命令保持精确。单独提供路径或 URL 时，末尾不附标点；不要引用回复中不存在的"上面 SQL/前面结果"。

## 工作方式

1. 读取当前环境的 `AGENTS.md`、适用领域技能和用户给出的材料，确认权威源与授权边界。
2. 为复杂任务列一个短证据清单：待证明的判断、对应来源、是否已取得。避免大范围原文倾倒和无目标的全库搜索。
3. 先并行获取互不依赖的证据，再沿关键链路深入。代码链路通常覆盖入口、API、Service、Repository/持久层、表字段、配置/状态和异常分支；没有某层证据就明确停在已证实层。
4. 交付前检查：关键标识符均有来源；事实、推断和缺口分开；未泄露秘密；没有假成功、悬空引用或内部过程话术；修改任务有真实验证输出。
5. 审查较长提示词或高风险回复时，可运行：

   `python3 scripts/lint_his_text.py --kind prompt < prompt.md`

   `python3 scripts/lint_his_text.py --kind response < answer.md`

   警告需要人工判断；错误必须在交付前处理。注意 lint 器对较长 prompt 做**核心概念关键词机械检查**，`security` 维要求文本命中 `密钥|密码|令牌|敏感|secret|token` 之一（见 scripts/lint_his_text.py），否则报 `WARN MISSING_CORE_CONCEPTS` 且退出码非 0、卡住流水线——在 prompt 中写一句安全声明（如"任何密钥、密码、令牌、患者敏感数据不得出现在本分析输出中"）即可 PASS，不要反复改写其他部分。

## 云效工作项分析提示词产物

对每个 DFHIS/ORIGIN 云效工作项（需求与缺陷同一套），归档完成后、代码分析开始前，生成一份证据化分析提示词并落位到需求归档目录：

- 文件：`{requirement_dir}/prompt-evidence-analysis.md`（不用 ID 前缀，目录已隔离；与交付侧 `prompt-reproduce-verification.md` 命名对称，一进一出）。
- 单一骨架：读取 [references/requirement-six-view-prompt.md](references/requirement-six-view-prompt.md)。不要按云效「需求 / 缺陷」字段切换另一套提示词。缺陷是六维上的偏差，需求是六维上的增量；渲染/崩溃把「先复现 + 控制台」放在阶段 0 的证据方法里，不跳过六维。
- 质量门禁：`python3 scripts/lint_his_text.py --kind prompt < 文件` 必须 PASS。
- 上传与评论规则归 `yunxiao-requirement-archiver` 的 closeout 流程管理，本技能只负责生成与落位。`数据变更`、`服务端变更`、`客户端变更` 三个结构化字段的填写口径同样以 `yunxiao-requirement-archiver` 的 `references/field-writeback-rules.md` 为唯一来源。

## 按需参考

- 编写、重构或评审系统提示词时，读取 [references/prompt-blueprint.md](references/prompt-blueprint.md)
- 云效需求或缺陷分析时，读取 [references/requirement-six-view-prompt.md](references/requirement-six-view-prompt.md)
- 执行 Schema/SQL、业务链路、代码、云效或改造任务时，读取 [references/delivery-contracts.md](references/delivery-contracts.md) 中对应章节。Grok 查 HIS 表/卡/报表用 `his-mcp-knowledge`
- 解释本规范来源、评估旧提示词或做回归审计时，读取 [references/audit-findings.md](references/audit-findings.md)

## 禁止模式

- 不因技能"部分相关"就全部加载；领域技能的精确触发条件优先。
- 不把某台服务器的绝对路径、某个模型、某个工具时延或某种分支策略写成所有环境的真理。
- 不把标准卡、旧答案或记忆当成当前事实；它们是线索，必须由当前证据校验。
- 不用"已完成"代替真实产物、测试或可观察结果。
- 不把工具输出、搜索笔记、模型自言自语拼进最终答案。
- 不为满足格式而虚构证据、表名、字段、接口、工作项内容或测试结果。
