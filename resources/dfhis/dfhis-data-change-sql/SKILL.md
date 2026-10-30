---
name: dfhis-data-change-sql
description: 编写、评审或回写 DFHIS/HIS/医共体需求的「数据变更」SQL 时使用；覆盖云效数据变更字段内容规范、PostgreSQL 简洁 DDL/DML 写法、字典/参数/规则种子脚本、附件与字段一致性、交付前自检与门禁脚本（check_data_change.py，发云效/上传附件前必须退出码 0）。出现「脚本在附件」「见附件 xxx.sql」「do $$ 匿名块」「begin/commit 包裹」「存储过程/函数套 SQL」等写法时，用本技能纠正为可直接执行、可读的普通 SQL。
---

# DFHIS 数据变更 SQL 规范

来源：2026-10-22 用户明确要求——「SQL 变更不要写这么复杂，正常的 DDL/DML 语句就行了，不要一个 begin/commit 里套很多个 SQL、SQL 里套存储过程套函数，就是很普通的 update 的语句，包裹的看不懂」；「云效里的数据变更最好不要放附件，直接放数据变更字段里」。同一天连续三轮返工：先在 DFHIS-31833 上被指出，再被点名「这些类似需求都有这个问题」（32047 / 31946 / 32300 / 32270 / 32099），最后又要求「清理三份仓库 SQL 的 begin/commit」。**2026-10-27 再次复发**（DFHIS-32736/32724/32587/32171，用户原话「不要使用 begin ... 这种写法」「不能把脚本上传在附件里」），随后全量扫了近 2 个月 1357 条需求/缺陷、整改 68 条，配方见第五节。

## 一、硬性规则

1. **只写普通 DDL/DML**。允许：`alter table` / `create index` / `comment on` / `insert` / `update` / `delete` / 只读 `select`（校验）。禁止：`do $$ ... $$` 匿名块、`create function`、`create procedure`、触发器、`begin ... commit` 包裹、动态 `execute` 拼接 SQL。
2. **目标是 PostgreSQL**。用 PG 语法：`add column if not exists`、`comment on column ... is '...'`、`current_timestamp`、`insert ... select ... where not exists`。不要写 Oracle/MySQL 方言（`number`、`varchar2`、`sysdate`、`dual`）。注释统一用 `--`。
3. **云效「数据变更」字段直接写 SQL 正文**。禁止写「脚本在附件」「见附件 xxx.sql」「已上传云效附件」这类指针；字段必须让人一眼看出要执行什么。
4. **附件只是备份**。内容必须与字段完全一致；旧附件不能删时，在评论里写明「以本字段 + 新附件为准，旧附件作废」。
5. **三处一致**：`数据变更` 字段 = 附件 = 仓库内 `sql/` 或 `docs/sql/*.sql`。字段与附件不一致会被测试打回，见 `dfhis-reopen-lessons` 教训 1。
6. **可重复执行**。用 `add column if not exists`、`insert ... select ... where not exists` 实现幂等；种子数据「不存在才插入」+ 必要时一条 `update` 收敛。
7. **不越权写业务数据**。需求只要求加列/加参数/加字典项时，不要顺手 insert 业务行；业务数据维护写成注释里的示例 `update` 并注明「执行前替换为真实 ID」。
8. **租户与命名**。主数据（字典/参数）按 `tenantid = '0'` 交付；表名带 schema（`df_zhushuju.gy_canshu`）时保持与现场一致，不确定就沿用需求已有脚本写法，不要臆造 schema。

### 例外

确实无法用普通语句表达时（例如必须取会话级 advisory lock 的 CDSS 规则初始化），允许**单层、无自定义函数、无动态 SQL** 的最小 DO 块，并在交付评论里说明为什么普通语句做不到。不允许把大量判断、循环、函数嵌套进 DO 块。

## 二、写法对照

反例（`do $$` 匿名块判断列是否存在再 alter）：

```sql
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'df_shenqingdan' and table_name = 'yj_jianchasqd' and column_name = 'bingrencw'
    ) then
        alter table df_shenqingdan.yj_jianchasqd add column bingrencw varchar(10) null;
    end if;
end $$;
```

正例（PG 原生幂等语法，一行一条）：

```sql
alter table df_shenqingdan.yj_jianchasqd
    add column if not exists bingrencw varchar(10) null;

comment on column df_shenqingdan.yj_jianchasqd.bingrencw is '病人床位（冗余，病人信息同步刷新）';
```

- 反例（`begin/commit` 里套一堆 SQL + 发布断言 DO 块）→ 正例：拆成若干条独立语句依次执行，断言改成脚本末尾的只读 `select` 校验查询。
- 反例（`insert ... where not exists` 之外再套 `if exists` 守卫 + `raise exception`）→ 正例：只保留 `where not exists` 幂等守卫；占用冲突在脚本注释里写「若目标 ID 已被占用需人工确认」。
- 反例（EasyRules/CDSS 规则种子：三层 `if exists ... raise exception` 防占用）→ 正例：普通 `insert ... where not exists`，把「不同租户 ID 冲突需人工处理」写进注释。源案 DFHIS-31833。

### 两个必须避开的坑

**1. 改老需求的脚本，权威版本在需求分支，不在 RC/release 副本。**
2026-10-22 DFHIS-32099 实证：把脚本简化后内联进「数据变更」字段时沿用了 `RC_2.16.1_250514` / `release_*` 上的旧副本，写的是 2026-08 误建列名 `tuiyaowyyy`；实体 `YZ_YiZhuZx.tuiYaoYy` 与 09-07 重打开修订版用的都是 `tuiyaoyy`，只有需求分支/hotfix 分支带修正。字段和附件已发更正评论返工一次。
正确做法：动老需求脚本前，先 `git show <各分支>:<path>` 逐分支 `grep -c` 关键列名/关键值，确认哪条分支是最新修订版，以需求分支或 hotfix 分支 tip 为底稿；RC/release 上的旧副本单独记为待 cherry-pick 项。

**2. 「老列存在才回填」不能写成普通 UPDATE。**
PostgreSQL 解析整条语句，`update t set new_col = old_col` 在 old_col 不存在的库上直接 42703 报错，不是运行期才跳过。不要为这一句恢复 `do $$` 块：把回填写成脚本末尾的**注释语句 + 执行条件说明**（「若现场执行过旧脚本，手动执行以下三句」），脚本主体保持到处可跑。

## 三、云效回写步骤

1. 生成简洁 SQL，落盘到需求目录 `sql/`（同时作为附件内容来源）。
2. 回写字段：`update_work_item` → `updateWorkItemFields.customFieldValues = {数据变更字段id: SQL正文}`。只改数据变更字段，不顺带动状态/负责人/参与人；增量交付用 `--append-data` 合并既有内容。
3. 上传附件作为备份（`create_workitem_attachment` 或 `upload_yunxiao_attachment.py`），内容与字段逐字一致。**2026-10-27 用户再明确：不要再给「数据变更」脚本传附件，脚本只写在字段里**；历史上已存在的附件删不掉，只能在评论里声明作废。
4. 读回校验：重新 `get_work_item`，确认「数据变更」字段文本与 SQL 正文一致。
5. 评论写明「字段已内联简洁 SQL + 旧附件作废 + 取值未变」，不要只发一句「已更新」。

### 三个自动拦截点（2026-10-27 接入交付流程）

门禁不靠自觉，已经挂在交付路径的三个必经动作上，不通过就走不下去：

| 动作                 | 拦截位置                                                                                                                                                     | 行为                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 上传 `.sql` 附件     | `yunxiao-requirement-archiver/scripts/upload_yunxiao_attachment.py`                                                                                          | 先跑门禁；不通过直接 `exit 3`，提示"禁止把该脚本当附件上传"；通过时额外提示"正文必须同时写进数据变更字段"                        |
| 回写「数据变更」字段 | `update_yunxiao_completion_fields.py`                                                                                                                        | 写字段前对正文跑门禁；不通过 `exit 1` 并列出问题；只有脚本超 16,000 字符、数据库函数体等明确例外才可加 `--skip-data-change-gate` |
| 交付/发布流程        | `yunxiao-requirement-archiver`（交付前）、`his-workflow-harness`（Jenkins/deploy 前）、`requirement-delivery-flow`（Delivery Closure）、PRD 模板 6.4/10 清单 | 流程文本强制"先写字段+过门禁，再评论/附件/回写/发布"                                                                             |

任何一环失败都不得声称交付完成；把门禁输出原样贴进交付评论或 PRD 证据表。

### 字段长度上限 = 16,000 字符（2026-10-27 实测）

`update_work_item` 超限直接 400：`字段【数据变更】长度不能超过【16,000】个字符`。

- 写之前先算 `len(sql)`；>16,000 不要尝试截断（截断 SQL 比指针更危险）。
- 超长脚本处置：字段写「超过字段上限、无法内联」+ 脚本摘要（头几行注释）+ 附件名，正文保留在附件；这类是唯一允许提附件的场景，且必须在评论里说明原因。
- 实测规模参考：14KB 文本（≈11.3K 字符）可写入；21K 字符被拒。

## 四、验收与自检

验收（可复用配方）：本地起临时 PostgreSQL 16 容器，整文件执行**两遍**——首跑成功、二次执行报 `already exists` 但不算失败即为幂等通过；再 `information_schema.columns` / 行数核对落库结果，容器用完删除。落库数字写进交付评论。

**先把门禁跑通，再动云效**（本技能自带脚本，交付流程已强制引用）：

```bash
python3 ~/.agents/skills/dfhis-data-change-sql/scripts/check_data_change.py --file sql/DFHIS-12345.sql
python3 ~/.agents/skills/dfhis-data-change-sql/scripts/check_data_change.py --dir /path/to/DFHIS-12345   # 目录内 sql/*.sql
python3 ~/.agents/skills/dfhis-data-change-sql/scripts/check_data_change.py --work-item DFHIS-12345       # 查线上字段+附件（需本地归档 raw.json）
```

退出码 0 才能继续发布；脚本里不得出现数据库密码、令牌或患者敏感数据，门禁通过后的执行证据（本地跑两遍的结果、落库核对）写进 PRD 与交付评论。非 0 会把问题逐条列出（禁用写法行号、超长字符数、纯指针、非 PG 方言、无字段类型）。`--strict-pointer` 连"提到 .sql 但不带 SQL"也算失败。

交付前自检清单：

- [ ] `check_data_change.py` 退出码 0。
- [ ] 全文搜索 `do $$`、`create function`、`create procedure`、`begin;`、`commit;`——命中即改写。
- [ ] 没有 Oracle 方言关键字（`number`、`varchar2`、`sysdate`、`dual`）。
- [ ] 加列都用 `add column if not exists`；种子都用 `insert ... where not exists`。
- [ ] 字段里能直接看到全部要执行的语句，不需要点开附件。
- [ ] 字段、附件、仓库 SQL 内容一致。
- [ ] 租户、schema、表名与现场一致（对照需求已有脚本或实查结果）。
- [ ] 脚本末尾如有 Redis 缓存刷新要求，用注释写清精确键名，禁止模糊批量删键。

## 五、复发记录与全量整改配方（2026-10-27）

同一天用户再次点名：DFHIS-32736 的「数据变更」里是 `begin … do $$ … raise exception` 大包裹；DFHIS-32587 / DFHIS-32171 / DFHIS-32724 也存在同类问题（32587、32171 甚至只写了「脚本名 + 见附件」）。按要求把**近 2 个月**（2026-08-27 起）云效需求与缺陷全量扫了一遍，共命中 68 条并逐条整改。结论：这不是个别写法问题，是交付习惯问题，必须按下面的配方自查/整改。

### 扫描配方（可复用）

1. `search_workitems(category="Req,Bug", spaceId="ef1714938822a5e4090b6229c7", spaceType="Project", updatedAfter=<2个月前>, includeDetails=True, perPage=200)` 翻页取全量（近 2 月 Req 963 + Bug 394 条）。
2. 逐条 `list_workitem_attachments` 取 `*.sql` 附件（并发 8）；解析 `customFieldValues` 里的「数据变更」。
3. 打三类标记：
   - `EMPTY_FIELD_HAS_SQL_ATTACHMENT`：字段空、脚本只在附件 → 内联附件正文。
   - `FIELD_POINTS_TO_ATTACHMENT`：字段只有「xxx.sql（附件 ID …）/见附件/变更见附件」→ 内联正文。
   - `WRAPPER_SYNTAX`：字段含 `begin;`/`commit;`/`do $$`/`raise exception`/`create function` → 去包裹。

### 改写配方

- `begin/commit` 整行删掉即可（脚本本身是一串独立语句）。
- **纯断言型 DO 块**（只 `select count` + `raise exception`）→ 删掉，改脚本末尾的只读 `select` 核对语句。
- **DML 型 DO 块**按固定映射改写：
  - `if not exists(...) then alter table … add column …` → `alter table … add column if not exists …`。
  - `if exists(...) then update … else insert …` → `insert … select … where not exists(...)` + 一条 `update`（不覆盖医院已维护的 `canshuzhi`）。
  - `raise exception '未找到菜单/模型'` 守卫 → 普通 `update … where <条件>`，更新 0 行不报错，末尾用 `select` 核对。
  - 依赖 `declare` 变量取 max+1 生成主键 → 用 `(select coalesce(max(...),0)+1 from …)::varchar` 标量子查询 + `not exists` 守卫。
- 多版本附件（同名不同大小/时间）：以 `gmtCreate` 最新者为准；字段里已点名「附件 ID」的，以字段点名的版本为准（那是被验证过的版本），不要擅自换成更新的未验证版本。
- 只从「统一交付包.zip」里拿到的脚本：下载 zip、`unzip -j '*/sql/*.sql'`，内联后再按同样规则去包裹。

### 结构与执行验证

本地临时 PostgreSQL 16 容器整文件跑两遍（幂等）；没有真实 DDL 时用「报错驱动补结构」：按 `relation/schema does not exist`、`column … does not exist` 自动补 schema/表/列后重跑，直到通过——首跑成功、二跑只剩 `already exists` NOTICE 即通过。空库首跑只需确认报错是 42P01/3F000（对象不存在）而不是 42601（语法错误）。

### 三类例外（只能报告，不能硬改）

1. **工作项类型没有「数据变更」字段**（如 DFHIS-32847 / DFHIS-31902 / DFHIS-32881）：`get_work_item` 的 `customFieldValues` 里根本没有该字段，写不进去，只能报告。
2. **数据库函数体交付**（DFHIS-31900 的 `fun_getkeyongkucunsl`、DFHIS-32394 的取号函数）：本质是 `create or replace function`，无法普通化为 DDL/DML，保持原样并在评论说明。
3. **超过 16,000 字符**（DFHIS-31922 84K、DFHIS-31650 105K、DFHIS-31945 26K、DFHIS-32841 58K）：字段写原因+摘要+附件名。

### 回写注意

- 只改「数据变更」字段：payload 里同时带上原样的「服务端变更/客户端变更」值，否则会被写成空；**不要**顺带传状态，`update_yunxiao_completion_fields.py` 的 `--status-name` 默认是「开发测试」，会把已经走到「待测试」的单子回退（2026-10-27 在 DFHIS-32736 上踩过，需用 `activities` 查回原状态并改回）。
- 批量写用独立脚本直接 `update_work_item`（只传三个 customField），比复用完成字段脚本更安全。
- 每条发一条规范化评论，说明「脚本已内联、无 begin/commit/do $$、附件作废、以字段为准」。

## 六、关联

- 云效字段/附件/评论/流转：`yunxiao-requirement-archiver`（`references/delivery-workflow.md`、`references/field-writeback-rules.md`）。
- 通用交付方法论：`requirement-delivery-flow`。
- SQL 附件不一致的历史教训：`dfhis-reopen-lessons`（`docs/process-lessons.md` 教训 1、11）。
- **门禁脚本**：`scripts/check_data_change.py`——`yunxiao-requirement-archiver`（交付前）、`his-workflow-harness`（发布门禁）、`requirement-delivery-flow`（Delivery Closure）都强制先跑它。
- CDSS 规则库初始化脚本（自取会话 advisory lock 的特例）：`dfhis-rule-cache-consistency`。
- **取消默认值/清空参数**（`gy_canshu` 的 `canshuzhi` + `queshengzhi` 两列、代码兜底与其他消费方）：`dfhis-default-value-parameter`。
- 模板：`templates/data-change-template.sql`。
