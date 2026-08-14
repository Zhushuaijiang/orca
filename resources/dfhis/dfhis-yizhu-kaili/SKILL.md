---
name: dfhis-yizhu-kaili
description: DFHIS 住院医生站医嘱开立（yiZhuKaiLi，df-web-zhuyuanysz / df-mic-lc-zhuyuan）核心链路口径与改动铁律。用于开立/编辑/保存/删除医嘱、医嘱费用（bingRenYzFyList）、药品/辅药/给药方式、诊疗医嘱、成组医嘱（zuHao/主辅药）、皮试、医嘱提交等任何医嘱开立相关改动；含"改动必须编写测试用例"硬性规则、医嘱费用 dtoState 状态机与重复计费防护（洛宁 8.11 事故根因）、交付前强制校验场景矩阵。
---

# 医嘱开立（yiZhuKaiLi）核心链路口径与改动铁律

医嘱开立是 HIS 最容易出错、出错代价最高（直接涉及计费与用药安全）的核心链路。本技能是该模块的单一事实来源：改动铁律 + 各业务子模块口径 + 事故复盘。新的医嘱开立教训追加到对应小节，不要在其他技能重复维护。

## 硬性规则（用户明确要求，不可豁免）

**修改医嘱开立（yiZhuKaiLi）这块核心代码——不限于费用逻辑——必须同步编写测试用例，且数量不能少。**零测试交付一律不允许。执行口径：

- 测试放入仓库 `tests/<功能目录>/xxx.test.js`，遵循现有约定（纯 node + assert + fs 读源码，可 `node` 直接运行，参考 `tests/bingAnShouYeNew/` 与 `tests/yiZhuKaiLi/yiZhuFyDtoStateGuard.test.js`）。
- 覆盖必须包含：本次改动的主场景、每个被触碰分支的原有行为保留（防回归）、已知的边界形态（字符串/数字混用、空列表、成组医嘱、给药方式特例等）；能动态执行真实源码的优先动态执行，其次才用结构断言。
- 交付评论/汇报中写明测试文件路径、场景数和运行结果；"build 通过""eslint 通过"不能替代测试用例。

注：该硬性规则已推广为全 HIS 通用门禁（任何 HIS 模块改动缺单元测试都判不合格，会被后续 AI 扫描标记），权威条款见 `his-workflow-harness` 的 Unit Test Gate；本节是医嘱开立模块的更严口径，叠加适用。

## 模块地图（df-web-zhuyuanysz src/pages/bingRenTabs/yiZhuKaiLi/）

- `index.vue`：医嘱开立主页面，`validateErrorData` 保存前收口（dtoState 矫正、去重、校验）。
- `components/kaiZhu-F1/mixins/yaoPin.js`：药品医嘱（主辅药、给药方式费用、自费标志）。
- `components/kaiZhu-F1/mixins/zhenLiao.js`：诊疗医嘱（费用重算、执行科室、编辑回塞）。
- `components/kaiZhu-list/mixins/yiZhuMultipleHelper.js`、`yiZhuDataManipulationHelper.js`：列表侧成组医嘱（zuHao）、批量处理。
- 通用约定：`xiangMuLy='3'` 是给药方式费用，各流程全程特例处理；dtoState 数字/字符串混用，判断必须双形态覆盖。

## 业务小节：医嘱费用 dtoState 状态机与重复计费防护

来源事故：洛宁 2026-8-11 上线 `release_2.15.3_SP16_tag_260528`（HEAD `297bed05`，帅江"诊疗医嘱编辑旧费用未删除"修复）后频繁一条医嘱两条费用。

### dtoState 口径（单一事实）

- `dtoStateEnum`: New=0, Update=1, Delete=2, UnChange=3, Cancel=4；代码中字符串/数字混用，判断必须同时覆盖两种形态（`[dtoStateEnum.Delete, 'Delete'].includes(x.dtoState)`）。
- 后端按 dtoState 分流：New→插入新费用行；Delete→按 yiZhuFyId 作废旧行（对未入库 ID 是 0 行 no-op，无害）；Update→更新。

### 三层交互机制（df-web-zhuyuanysz 保存链）

1. **编辑回塞**：诊疗医嘱编辑完成时（`zhenLiao.js` 医嘱完成时），旧费用（`bingRenYzFyList_old`）标记 Delete 塞回 `bingRenYzFyList`，让后端作废旧行。
2. **保存前矫正**：`index.vue` `validateErrorData`（"矫正医嘱费用dtoState状态"段）中，**医嘱 dtoState=New 时**，循环把所有非给药方式费用（`xiangMuLy !== '3'` / `!isGeiYaoFsYiZhuFyForSave`）强制赋 New。此循环若不动 Delete 费用就会**把 Delete 复活成 New**——修复后必须带 Delete 跳过守卫（`66fc74c92`/`90ad56e7d`/`b77111774`/`517d76893`/`e442b86a7`）。
3. **去重**：`uniqByXiangMuId` 只对 `xiangMuLx < 10 且 ≠ 4` 的项目按 xiangMuId 去重；**护理(24)、常规针法(26)、治疗类等 xiangMuLx>=10 全部绕过去重**。另有保存收口兜底去重 `uniqYiZhuFyForSave`（同 xiangMuId 有效费用只留一条，优先留库中行）。

### 事故根因链（复盘基准）

- 好版本 `4233f382`（2026-7-13）：回塞只覆盖 dtoState 为 UnChange/Delete 的旧费用；未保存医嘱重编辑时上轮费用（New）直接丢弃，已保存医嘱 dtoState=Update 不触发 New 矫正 → 无重复。
- `297bed05`（2026-8-7）：改为**无条件**把全部旧费用标 Delete 回塞（本身是为修"旧费用未删除"），与既有的 New 分支强制矫正叠加 → Delete 被复活为 New；xiangMuLx>=10 绕过去重 → 一次保存新旧两条费用同时插入。截图两种形态：换项目残留（同医嘱不同 xiangMuId 各一条，任何去重都挡不住）与同项目多次累积（yizhufyid 不相邻，每次保存插一条）。
- 教训：两层各自"正确"的逻辑（回塞为了删旧费、矫正为了保证新医嘱费用是 New）叠加出回归；改动其中一层时必须把另一层的交互列为回归点。

### 费用改动强制校验（交付前必做，缺一不放行）

改动触及费用生成/回塞/矫正/去重/删除任一层时：

1. **先锁定回归源再动手**：拿到"好版本"与"坏版本"号，`git log --oneline 好..坏 -- <医嘱费用目录>` + 逐文件 diff，确认改动文件清单与唯一费用生命周期改动；禁止只按"有重复行"的表象直接去重兜底（第一刀 `uniqYiZhuFyForSave` 只挡住同项目复活，没挡住换项目残留，就是反例）。
2. **场景矩阵逐个断言"保存后该医嘱有效费用行数 == 预期，Delete 行真实作废"**：仓库已入库回归测试 `df-web-zhuyuanysz/tests/yiZhuKaiLi/yiZhuFyDtoStateGuard.test.js`（SP16 `71c0ad867` / SP17 `a69eb5b68` / SP18 `569f28f52` / 15.3 `40ce641f9` / RC `bf425b324`，运行 `node tests/yiZhuKaiLi/yiZhuFyDtoStateGuard.test.js`）。它从 index.vue 真实源码抽取矫正代码块执行，覆盖换项目残留、重复编辑、给药方式特例、原有矫正保留、字符串 Delete、非 New 医嘱 6 场景；删除/绕过 Delete 守卫会立即失败（已对无守卫旧代码验证会报错）。改动费用代码后必须跑通该测试，并补充其未覆盖的场景：①新医嘱直接保存 ②未保存编辑后再保存 ③已保存编辑（换项目/改数量/改执行科室）再保存 ④同一医嘱连续保存两次 ⑤成组医嘱（主辅药/zuHao）编辑。
3. **改 dtoState 赋值的每一行，反问三个问题**：这行会不会把 Delete 复活？会不会把 UnChange 的库中行变成 New 再插一条？该费用类型的 xiangMuLx 是否 >=10（去重保护失效）？
4. **后端配套**：确认 `df-mic-lc-zhuyuan` 幂等去重（`deduplicateNewYiZhuFy`，0c6f9b75/DFHIS-31770）在目标分支存在；前端修复不替代后端幂等。
5. **存量与终极防线**：重复费用已产生的，清理 SQL 按 `(yizhuid, xiangmuid)` 分组作废，且必须同步处理 `zy_feiyong1` 多收费用；读-判-插并发窗口只能靠数据库唯一索引兜底，推动 DBA 落地。

## 关联技能

- 交付前自查与重打开复盘：`dfhis-reopen-lessons`
- 后端幂等与缓存一致性：`dfhis-rule-cache-consistency`
- 构建/发布验证：`his-workflow-harness`
