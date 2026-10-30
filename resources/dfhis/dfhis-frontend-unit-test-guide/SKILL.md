---
name: dfhis-frontend-unit-test-guide
description: DFHIS 前端项目（df-web-*、Vue 2 + Vue CLI 4 + Jest）单元测试编写与交付门禁。默认基线 Vue 2 + Vue CLI 4 + @vue/cli-plugin-unit-jest + jest；例外：df-web-main 无测试运行器，用 tests/*.test.mjs + node 直跑。触发词：前端单测、jest、spec.js、vue unit test、component test、覆盖率、test scaffolding、纯函数抽取、可编辑复制、新建 utils 写测试、feign 字段归一。当在 df-web-* 前端仓新增 utils 纯函数、为 DFHIS 需求写前端测试、CI 报"零测试交付"、Reopen 修复需补回归测试时使用。
---

# DFHIS 前端单元测试

## 嵌套病历回填：真实 SDK 与实时模板契约

来源：2026-10-16 门诊 AI 病历回填（无工单号），三份真实 RichEdit SDK 的特征验证和修复回归；生产实现锚点 `menZhenBl/services/dfaiStructuredWriteback.js`。

- `parent.setText` 和按编码批量写入可能删除子控件或同时命中重复编码。不要用拼接原文代替结构保护；测试必须执行真实 SDK，并比较回填前后的全部元素、层级、属性与值，不能只比较最终纯文本。
- 每次生成快照与回填都解析当前文书；重复编码/名称用精确路径身份区分，不能经过移除下划线的归一化后匹配。模板 ID、名称或虚拟路径没变，也不代表底层源编码、选项、只读属性没变。
- 父节点仅写子控件之间的正文区间，子节点独立写入；丢失/重复/换序占位、无效选项、未知控件须先拒绝。覆盖多层、相邻空节点、重复编码、父子同时修改、撤销重做、RTF 重载和部分写入失败恢复。
- 老 SDK 可能没有公开 `field.readOnly`、`selectOnly`、`selectType`；测试继承只读与旧 `multiSelect`，不可把缺失属性当作可编辑。现代 RTF 导出包含变化的 XML 时间戳，不可将连续两次 RTF 字符串相等作为草稿未变的判据；同时核验真实文档对象、完整结构/正文、全局编辑版本。
- 模板配置请求与备份导出这两处异步窗口，都要测患者/文书/结构/纯格式变化。写入资格过滤不得阻断已签署或全只读文书的独立质控读取。
- 新 SDK 的子控件 `isReadonly()` 缓存也可能在父控件刚改只读后滞后；返回 false 仍须核对实时祖先属性。实时契约测试要跨过“桥接快照→通用归一化→实际生成请求组装器”，不能只证明第一段保留元数据，后段却丢字段或重新使用注册缓存；嵌套模板的生成不允许在 live 快照失败时回退缓存。
- 截图必须实际检查：模型断言通过但编辑器画面空白，只能算 SDK 模型证据。另取真实渲染的截图，不能用空白编辑器宣布视觉验收通过。

## 智能体只读工具的接口参数契约回归

来源：2026-10-16 住院智能体总结病情时，用血查询报“SQL查询条件不可全空”。`getYongXueSqdByConditions` 的 `YongXueSqdReq` 与 Repository 接受单个 `bingRenZyId`；工具误用了护理查询的 `bingRenZyIdList`，未知字段被忽略后没有有效条件。修复见住院医生站提交 `4c90b28a4`，回归锚点 `tests/bingLiWenShu/dfaiInpatientTransfusionQuery.test.js`。

- 接入已有接口时逐个核对真实 DTO 和 Repository，不能按相邻接口猜测单值/列表参数。保留后端防止空条件查询的保护。
- 回归执行真实工具注册项，断言发出的完整请求体；只测独立参数函数不能证明注册项已接线。覆盖当前住院作用域、空 ID 不请求、患者切换及失败向上传递，不能将读取失败变成零条记录。
- 原子工具被患者全景/临床时间线复用时，核对聚合引用同一实现；页面侧用最终编译包的实际分发器与真实登录请求链路补充集成证据。

## 模板结构可能在构建成功时静默丢失

来源：DFHIS-32624，2026-09-27 护士站实机验证。先前性能注释被插在 `df-dx-table` 开始标签的属性之间，生产构建仍成功，但四处模板编译丢失表格组件；医嘱源数据已有 20 条，页面却显示属性文字且没有表格实例。

- HTML 注释放在完整标签外，禁止插入开始标签的属性列表。
- 涉及模板批量改写时，用仓库实际 `vue-template-compiler` 编译真实 SFC，断言关键组件、数据绑定及条件分支仍在 AST 中。此类集成回归不必挂载整页。
- 浏览器验证同时核对源数据、组件实例、已加载数据和可见行；不能只用接口成功、loading 消失或构建成功作为页面通过标准。固定列可能复制 DOM 行，应另核逻辑数据行数。
- 空白或缺失组件的旧页面不能作为提速对照；先恢复完整内容，再建立相同内容的性能基线。

## 隐藏内容优化：布局与键盘契约必须单独验证

来源：DFHIS-32624，2026-09-27 公共菜单优化及被否决的固定列实验。

- DevExtreme 22.1.8 的 `dx-hidden-cell` 固定列副本仍参与行高测量。护士站单页跳过副本虽减少组件，但真实 SDK 的变高行在虚拟滚动、以及“两表总高度相等但逐行高度不同”的普通滚动场景均错位。必须测交错不等高行、列切换和滚动，不能凭 CSS 不可见就裁掉模板子树。
- 延迟菜单内容时，保留菜单壳、既有事件及 ARIA；首次方向键要等内容 DOM 就绪再聚焦，快速重开要取消旧关闭定时器。动态内容只刷新菜单项引用，不重新绑定事件；`tabindex=0` 的普通输入框不得被加入菜单导航范围，已登记的焦点项则需保留。
- 微应用可能混用新旧组件。延迟挂载需父组件显式声明支持完整协议；缺少能力时保持原挂载行为，不能仅凭存在一个同名方法就推断键盘链路兼容。
- `textContent` 包含隐藏菜单文字，延迟挂载后原始文本摘要改变不一定是业务内容丢失。用可见文字、业务数据和几何对照；必要时仅补齐隐藏项，验证旧摘要可完整复现，再重新加载恢复正常状态。Watcher 数、组件实例数和含固定副本的 DOM 行数必须分别记录。

> 完整规范见 [前端单元测试规范](docs/前端单元测试规范.md)。本文件只列门禁清单与最快落地步骤，避免在聊天中复述全文。

## 组件预编译包切换共享源码的兼容验证

来源：DFHIS-32624，2026-09-27 住院独立 Vue 2.6 应用。

- 用已发布 npm 包的 `gitHead` 确认源码基线。旧消费端接入性能能力时，不要顺带引入新版患者、Tab 等业务改动；兼容发布保留原 lib/CSS 并比对包文件，使用独立标签。
- 原先封装在预编译 lib 内的依赖，改为源码后会受到消费端全局 webpack alias 影响。须核对如 `lodash/cloneDeep` 的业务自定义替换，必要时按源码所属目录保留组件原依赖语义，不能只看包体和编译通过。
- 数据行出现、loading=false 只证明数据就绪。技术错误弹窗检查不覆盖业务确认框；截图发现遮罩时要回源核对取消/确定分支，不得为验收点击可能执行临床命令的确定。报告必须区分数据就绪、提示关闭和完整可交互时间。
- 冷缓存/诊断开销对照要用 ResourceTiming 的 transferSize、CDP 缓存标记等确认后续 fetch 和子框架条件一致，不能只凭发送过 setCacheDisabled 或主脚本重新下载就认定全程冷缓存。主应用离线覆盖必须使用实际发布环境模式；152 主壳 test 模式含 VUE_APP_ISNEW=true，直接改用 production 模式会改变入口选择，不能当作候选业务回归。

## 测试入口选择

先读取实际仓库 scripts、运行器、已有用例；下列 Jest 步骤仅适用于已有 Jest 基线，不为写测试迁移运行器。纯函数测试不能证明页面已接入；事件、组件、SDK 或跨层请求变化需补实际调用入口/契约验证，参照 [质量契约](../requirement-delivery-flow/references/quality-contract.md)。

## 最快落地流程

1. 先按基线核对：`@vue/cli-plugin-unit-jest` 已加入 devDependencies；`package.json` 已有 `scripts: { "test:unit": "vue-cli-service test:unit" }`；`tests/unit/` 目录已存在。
2. 优先抽纯函数到 `src/<module>/utils/xxx.js`（或 `src/<module>/xxxUtil.js`），避免直接挂载页面写测试。
3. 新建 `tests/unit/<被测模块名>.spec.js`，文件首行 `/* eslint-env jest */`，路径用 `@/...` 别名（与生产代码保持一致）。
4. 写 `describe/test`：用 Arrange/Act/Assert 三段；覆盖正常、边界、不满足条件时的旧行为、临界/空/异常值、后端返回的数字与字符串兼容。
5. 跑 `yarn test:unit tests/unit/<spec>.spec.js` 单文件验证；提交前跑 `yarn test:unit --runInBand` 模块全量。
6. 提交前过下方"提交检查清单"全部打勾。

## 提交检查清单

- [ ] `tests/unit/<被测模块>.spec.js` 文件名规范，目录在 `tests/unit/`
- [ ] 复杂判断/计算已抽成 `src/.../utils/xxx.js` 纯函数
- [ ] 文件首行 `/* eslint-env jest */`
- [ ] `describe/test` 命名直接描述业务行为，避免 test1/normalTest
- [ ] 覆盖正常路径、边界、不满足条件时的旧行为、临界/空/异常值
- [ ] 纯逻辑测试隔离外部依赖；组件接线、Vuex、SDK 或上下文行为变更按需运行实际组件/集成测试，不能以纯函数通过替代
- [ ] 不为覆盖率堆砌断言；断言检验业务结果（`toEqual`/`toBe` 完整值）
- [ ] 不引入 `@vue/test-utils` mount 整个页面（除非确认是高价值集成测试）
- [ ] 跑过 `yarn test:unit --runInBand` 全部通过
- [ ] 若属 DFHIS Reopen 修复，引用 DFHIS 编号在 describe 标题

## 反模式（红牌）

- 引入 `@vue/test-utils` mount 整个页面 → 依赖 Vuex/DevExtreme/mixin，挂载即崩
- 抽出的纯函数与 Vuex store 放同一模块 → import 该函数即连带拉起 store/全局组件，单测崩（DFHIS-32574：查询体组装从 store 模块拆到独立 utils 模块才可测）
- `jest.mock('@/...', () => factory)` Mock 整个模块 → 测的是 Mock 不是生产代码
- 一份 spec 里塞 10 个 test 覆盖 5 个不相关函数 → 失败定位难
- 断言只 `expect(result).toBeDefined()` → 业务正确性零保证
- `test1/testDebug/normalTest` 命名 → 重构/搜索/复制全是灾难
- 用 `setTimeout`/`await new Promise(r => setTimeout(r, 100))` 等待异步 → 应 mock 异步函数而非等真实时间
- 为测试改生产代码（如把 `if (xxx) return` 改 `return xxx && func()`）→ 牺牲可读性换测试方便

## 防抖测试与 lint 证据边界（2026-10-21 实证）

来源：DFHIS-32406 门诊草药按贴退费前端回归（`df-web-menzhenysz`），两处均被评审打回后返工。

- **不要用真实时间 flush 防抖**：`flushDebounce = () => new Promise(r => setTimeout(r, 350))` 这类写法既慢又不稳，明确违反仓内测试约束。改用 `jest.useFakeTimers()` + `jest.advanceTimersByTime(350)`；若被测实现用 `Date.now()` 判断尾触发，必须同时 `jest.spyOn(Date, 'now')` 给定受控时间，否则计时器推进了、时间没动，尾调用仍不执行。Promise 链路用 `await Promise.resolve()` 或 flush-promises，不要 sleep。
- **lint 不能报"全量通过"**：`yarn lint` 在本仓会因巨型文件（`mengZhenCommonHelper.js`）触发 ESLint 内部错误（Node 22，`template-curly-spacing`），属基线问题。报告口径应拆两行：①对本次改动/新增文件定向 `npx eslint --no-fix <files>` 并附 JSON 日志；②单列全量崩溃的文件/行号与既有 error/warning 数及归属，明确"本次新增文件 0 error/0 warning，全量基线仍崩"。
- 模块全量测试失败同样要保留计数、失败套件名并逐条判定既有/本次引入，不能只丢一个失败数。

## 与其它规范联动

- 后端 Java 单测基线：`dfhis-java-unit-test-guide`（同级别技能包，分工互补）
- Reopen 教训 #8：HIS 改动必须同步单元测试，零测试交付一律不合格
- 项目级详细规范：每个 `df-web-*` 仓的 `tests/README.md` 与 `tests/unit/README.md`（项目特定内容：本仓路径别名、测试运行器版本、本仓案例）
- 收尾流程：测试通过 + 编译通过 + 截图（UI 需求）→ 云效评论 + 字段回写

## 默认基线（DFHIS 前端仓）

| 组件       | 版本/基线                                         |
| ---------- | ------------------------------------------------- |
| Vue        | 2.x（部分老仓）或 3.x（新仓）                     |
| 构建工具   | Vue CLI 4（老仓）或 Vite（新仓）                  |
| 测试运行器 | Jest（Vue CLI 4 默认）或 Vitest（Vite 默认）      |
| 路径别名   | `@/...`（Vue CLI/Vite 标准）                      |
| 命名       | `*.spec.js`（Jest） 或 `*.test.js`（Vitest 兼容） |

迁移或非基线项目（React、Next.js、Vue 3 + Vite 等）按本仓 `package.json` 中实际测试运行器与配置，套用同样的"优先测业务函数、不挂载组件"原则。

## 例外仓：df-web-main 无测试运行器，用 node 直跑

`web/base/df-web-main`（qiankun 主应用）没有 Jest/Vitest 基建，不要往该仓引 Jest。仓内既有约定是纯 node 断言脚本：

- 测试放 `tests/<feature>.test.mjs`（或 `.test.cjs`），首行 `import assert from 'node:assert/strict'`，`node tests/<feature>.test.mjs` 直跑（**必须 cd 到该仓目录**，在仓库根跑会 MODULE_NOT_FOUND）。
- `package.json` 注册 `test:<feature>` script（现有 `test:menu-capability`、`test:his-agent-download`、`test:dfai-electron-patient`），无统一 `test:unit`。
- 被测逻辑抽成不依赖 `@/` 别名、Vuex、组件的 `.mjs` 纯函数模块，生产代码与 node 测试共用同一份 import。
- 用例命名/覆盖要求（业务行为描述、正常+边界+旧行为）与本技能通用清单一致，只是运行器换成 node assert。

## 例外仓：df-web-yijigl 的 node assert 测试链

`web/lc/df-web-yijigl` 没有 Jest，测试是纯 node assert 脚本组成的 `test:unit` 链（2026-10-27 DFHIS-32865 实证）：

- `package.json` 的 `test:unit` 逐条 `node tests/unit/*.test.js`（`&&` 连接，当前 7 个用例，含 `.test.cjs`）。**新增用例必须手动追加到这条链**，否则不会被任何命令执行。
- 用例在无 `node_modules` 的需求隔离 worktree 中可直接跑；`appEventLifecycle.test.cjs` 依赖 `vue`，无依赖时会失败，脚本支持用环境变量 `DFHIS_TEST_VUE_MODULE` 指向可用的 Vue 2 模块。本机也拿不到 Vue 2 包时，把该条记为环境限制（基线 6/7 通过），不要算成本次改动引入的失败，也不要为它改测试代码。

## 主壳浏览器对象缺失与原生品牌兼容回归

来源：2026-10-17主壳Safari登录白屏，回归锚点`df-web-main/tests/browserShellCompat.test.cjs`。事故与原始浏览器/初始化对照的单一取证规范见`dfhis-ui-test-delivery/references/ui-flow-knowledge.md`的Browser-shell initialization。

- 普通Web环境不得要求存在`window.chrome`；专用壳标志为真时，品牌元数据也可能尚未注入。分别保护launcher对象与ClientDllVersionInfo，不通过全局制造chrome对象或关闭专用壳路径修复。测试普通缺失/null/空对象、Web模式忽略原生品牌、原生元数据缺失、完整品牌、关闭回调和退出清理。
- 小型SFC计算属性/方法可由真实脚本AST定位后在隔离VM中执行，保留原代码正文，不必挂载整页或引入新运行器。提取箭头回调时要在正确this的工厂中创建，直接对箭头`.call`不会改变其词法this，容易把测试执行器错误当产品故障。
- 目标分支默认值分别确认。本例16.1空背景返回{}，15.3/SP20返回undefined；不能为复用测试强制修改旧版本默认值。优先断言各分支的完整原行为。
- 未填工号前应用列表为空是正常前置；先走原账号change/blur取数再展开列表。跨版本验证的旧可选SSO404须保留并单列，不模拟成功，不据此声称SSO或整次登录已通过。正常关闭已确认只读技术提示与删除Vue弹窗DOM不是一回事，后者禁止。
- 不按`.test.js`后缀把所有文件直接交给Node。本仓`src/utils/cacheManager.test.js`是导出手工浏览器开发函数的模块，未配置ESM/浏览器上下文时直接node语法失败不等于新增产品失败；保留首轮失败，按真实测试入口分类，不为凑全绿修改无关代码。

## 隐藏 Dialog/Drawer 插槽编译的回归边界

DFHIS-32624 国产机验证：Vue 2 普通 default slot 在父 render 中求值，Dialog body 的 `rendered=false` 不等于父级没有创建 VNode。测试延迟插槽时必须同时覆盖 Vue 2.6/2.7 的关闭求值次数、首次打开、输入、命名 title/footer、关闭保留、销毁重开及最终清理。不能只断言模板含 `proxy:true`。

- 只转换 default body；命名插槽保持原位置。调用、过滤器、赋值、refs/children、转发插槽等保留原编译。属性过滤器 `:title="value | format"` 与文本过滤器都要测，不能只检查括号形式的函数调用。
- Drawer 的 destroy-on-close 在 `hide()/closeDrawer()` 路径置 `rendered=false`；测试只把 `visible=false` 会漏掉真实销毁分支。
- 历史 DOM 摘要变化时，用同一时段旧版/新版资源重放判断归因；同摘要与否不能用“应该是时间变化”来解释。可见文字摘要和原始 textContent 摘要分别记录，不互相替代。

## 微应用 MRU 恢复与性能取证

DFHIS-32624 验证：持久化 viewList 是历史页签记录，不等同本次运行已挂载实例。MRU 容量不足时用所有 viewIds 补位，会在刷新 active10 时额外启动隐藏12。挂载策略测试需区分“历史未访问”“本次已访问”“显式固定”，保留当前应用优先、访问实例保留、关闭记录过滤、去重、数量上限与关闭上限开关；不能为了冷启动速度丢失页签或卸载本次已访问草稿。

- 验收同时检查许可集合与实际容器内容：本次 active10、viewIds[12,10]、MRU空，修复后 allow空、隐藏12子节点0，页签列表仍保留。再验证12作为当前应用能够正常打开。
- 对长微任务归因时，联合时间线与 V8 CPU ProfileChunk 可以比单独 `(program)` 汇总获得更明确调用栈。本次 Chrome153 的 Profile 与 ProfileChunk 位于不同线程；按进程/采样 id 关联块，以 Profile 的采样线程匹配时间线，不能按块输出线程误配。保留 startTime、timeDeltas、samples、node/parent 及脚本位置元数据，避免记录页面业务内容。
- 采样、资源覆盖试验用于定位与兼容性；收益需在真实发布资产上按同一场景原生重测。局部脚本或 CPU 开销改善不等于全站倍率。

## 派生 getter 与持久化过滤的联合验证

DFHIS-32624 取证复现：主壳 menu/bingRenMenu getter 在读取时写 anNiuList 并删除 zuJianList，真实 Vue/Vuex 合成用例首次禁止标记为0，切换应用后再读却变成空按钮数组；appMenuList 的树筛选还覆盖源 sonMenus。修复必须验证重复读取、切换回读、历史持久化数据与冻结输入，不能只测首次结果。

不要仅凭某 mutation 更新的字段不在持久化 reducer 中，就认定过滤它安全。此次 SET_XIAO_XI_FL_LIST 的字段确实被投影排除，但该次序列化同时带上了此前 getter 改写的菜单字段。持久化契约需包含“读取派生 getter→提交后续 mutation”的顺序，记录快照差异路径（不记录业务值），先消除越过写入边界的修改，再考虑跳过序列化。核对实际 namespace：appInfo 未 namespaced，SET_CAN_SHU_LIST 为根类型；锁屏设置在 menu 下，不能按名字误归类。

该问题的已验证修复边界：只在患者菜单写入时归一化有地址记录，非地址分组的组件元数据原样保留；旧格式以纯投影兼容，已有 anNiuList 标记不被二次清空。丢失的缓存字段不能推测恢复，应由正常接口刷新补齐。菜单树过滤使用结构共享，冻结输入可读且未改变分支保留原引用。除了比较返回值，还用真实 Vuex 深度 watcher 断言 getter 读取及失效后重算不额外发出状态通知；允许真实 mutation 发出通知。

## Vue 2.7 销毁清理：保留实例排除观察标记

来源：DFHIS-32624，2026-09-28 弱机 qiankun 卸载重挂取证。共享 clean.mixin 按白名单删除实例自有属性，只保留旧版 `_isVue`，误删 Vue 2.7 可枚举的 `__v_skip`。已停止 computed watcher 的 deps 仍可能指向与活跃宿主共享的 Dep；迟到回调将已销毁实例放入响应式状态后，会递归观察这些 Watcher，使 `newDepIds` 变成响应式属性并触发 `addDep → depend` 栈溢出。

- 清理、序列化或复用 Vue 实例时，保留框架原有非响应式标记；Vue 2.7 依赖 `__v_skip`，不能把保留 `_isVue` 当成等价保护。不要用全局 markRaw 或冻结业务 DTO 代替实例边界修复。
- 销毁测试必须补真实运行时：宿主和子组件共享响应式对象，并各有已求值 computed；销毁子组件、执行延迟清理，再把迟到实例放入宿主数据、更新共享值。应保持宿主计算结果正确、旧实例无 `__ob__`、活跃 Watcher 的内部字段未被转成 getter。仅用伪造 `_watchers` 数组会漏掉这个问题。
- 同时验证 Vue 2.6/2.7。2.6 原本没有 `__v_skip` 时，不要求凭空添加；保留既有 `_isVue` 及原清理行为。检查所有当前分支的清理副本；不要拿原目录旧代码推断当前发布分支仍存在重复注册。
- 对重复清理钩子做实际消费端验证：多个钩子先后执行后，标记仍须保留。修复主壳一份不能证明其他未受注册保护的副本安全。
- 实例排除观察修复与事件订阅释放是两个问题。仍残留的全局监听必须单独计数、按拥有者清理，不能因为栈溢出消失就宣称监听或内存泄漏已解决。

## 懒布局插槽中的显式 this 回调导致表格单元格消失

来源：2026-09-30 门诊“医保信息”必现错位排查（无工单号）。真实组件在 `df-web-bui/src/packages/components/yi-bao-xx-ba/src/index.vue`，不是门诊仓本地组件。医疗类别、病种、关联诊断列使用 `:formatter="val => this.getXxx(val)"`；`df-utils-performance/compiler/layout-slots.cjs` 将 df-row/df-col 普通插槽变成 scoped slot 后，Vue 2 模板编译器把箭头中的 this 捕获为插槽函数的 this，非组件实例。非编辑态调用 formatter 抛 `this$1.getYiLiaoLbResult is not a function`，td 渲染失败只剩序号和操作按钮（按钮左移）；编辑态不走 formatter，故输入框反而正常。

- 单纯组件方法转发优先直接 `:formatter="getXxx"`，不要在模板回调中显式引用 this；不要用调列宽或强制 doLayout 掩盖渲染异常。
- 回归需经真实 `vue-template-compiler` + 生产 `layoutSlots` 模块 + `vue-template-es2015-compiler` 编译，然后实际消费 scoped slot、调用列 formatter；只编译成功不够，因为编译后的错误代码语法合法。
- 同测优化开/关、空行、已有值、字典未命中。此次旧代码仅优化开启时失败，改为方法绑定后 5 项通过；测试锚点 `df-web-bui/tests/unit/yi-bao-xx-ba-table-formatters.spec.js`。
