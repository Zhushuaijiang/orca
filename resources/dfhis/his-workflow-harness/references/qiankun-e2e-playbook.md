# DFHIS qiankun 前端 E2E 实测加速手册（DFHIS-32044 沉淀）

> 来源：DFHIS-32044（住院草药煎药费 91 医嘱）全流程灰度 E2E，2026-08-15/16。本会话先用"本地三 dev server + 同源代理"弯路约 2 小时未通，切到在线壳子灰度后约 40 分钟完成两场景验证。下次直接按本手册走。

## 拓扑选择：永远先在线壳子灰度，不要搭本地全栈

- 病区医生站等 iframe 型病人详情页（portal `view-item-iframe.vue`，postMessage `mounted/route/changePatient` 驱动）对跨域极度敏感：`window.top.DFhelper`、bui 的 `buiEntry` 都要求同源或关闭 web 安全。**本地门户 + 本地子应用的组合会连环踩雷**（bui 不启动则门户 bootstrap 白屏、iframe 跨域 DFhelper 缺失导致开嘱组件渲染崩溃、弹窗 display:none）。
- 正确默认：152 在线壳子 `http://192.168.1.151:8015` + 只起被改子应用 dev server（标准 `vue-cli-service serve`，不要 `-new`）+ 持久 Chrome `--disable-web-security --disable-site-isolation-trials` + 壳子源 sessionStorage 注入 `devDebug=test` 与 `<子应用 name>=//localhost:<port>`。
- 灰度命中证据：监听 `request` 过滤 `localhost:<port>`，必须看到静态资产与 `/api/` 都过本地子应用（子应用 iframe 源就是 localhost，其 `/api` 经子应用 dev proxy 落到同一环境网关）。
- 本地门户同源代理方案（portal worktree 改 apps.dev.js entry + devServer 代理 `/apps/10`，子应用 `serve -new` 换 publicPath）仅当在线壳子不可用时再用；`localhost` 代理目标要写 `127.0.0.1`（Node http-proxy 走 IPv6 会 ECONNREFUSED）。
- **浏览器跑在 UI 测试容器里时上述 localhost 口径不成立**：`//localhost:<port>` 指向容器自身；远程沙箱 `192.168.1.10` 也到不了 Mac 的 `192.168.200.x` LAN（2026-10-21 实测）。改为把最终构建 dist 放进 artifact、在容器内 `127.0.0.1:8100` 起静态服务（CORS `*`）再灰度，见 `dfhis-ui-test-delivery/references/ui-execution.md`。

## Playwright 自动化铁律（逐条都是本次踩坑）

1. console 监听用 `page.on('console')`，`frame.on('console')` 在 playwright-core 下不可靠（漏报导致误判 hook 未执行，浪费一轮排查）。
2. df 组件库交互：填值用原生 value setter + `input`/`change` 事件派发；`df-input` 的搜索类回调挂在 `@change`（失焦才触发，Enter 不算）；`df-select` 点开 input 后选 `.df-select-dropdown__item`。
3. 点击优先 `page.evaluate` 里 `el.click()` 绕过 Playwright actionability——`df-utils-message-wrapper` 消息层随机遮挡拦截点击；但登录页系统抽屉条目（`li.app-item`）的 Vue @click 和账号 blur 加载列表要真实事件：`page.click` 账号框 + `fill` + `Tab` 触发 blur（`getYongHuYuanQuYyList` 由工号 blur 加载，不填工号抽屉列表永远空）。
4. devextreme `dx-table` 行 click/dblclick 自动化基本不可靠（固定列双 tbody、事件绑定层级）——**直接组件实例直驱**，不要反复试坐标。
5. storageState 不保留登录态（token 在内存/sessionStorage 组合），全流程写一个脚本单会话跑完；boot（登录→科室→病人→医嘱开立）抽成共享模块复用。
6. dev server 编译就绪判定用 `curl` 轮询 HTTP 200，不要按固定 sleep 猜。
7. 截图每步都拍但只留关键帧归档；sips 压缩上传云效（>100KB 会 413）。

## 病区医生站病人详情页（iframe 型）进入路径

1. 登录页：工号 DBA → blur → 系统抽屉选【100101】病区医生站 → 密码（万能密码只读查 `df_zhushuju.gy_canshu like '%万能密码%'`）→ 登录。
2. 选择科室弹窗：文本点击 + 确定。
3. 病人列表卡片：evaluate 里找叶子文本 `dispatchEvent(dblclick)` 进入。
4. **病人 iframe 就绪后 activePatient 可能为空**（门户 changePatient postMessage 早发丢失）：读子应用 vm `$store.state.config.activePatient.zyBingRenXx` 判空，空则回门户"病人列表"重进一次。
5. 病人详情 tab 栏在 iframe 内（`patient-menu-tab-label__text`），点"医嘱开立"等 `F4草药` 出现。

## 药品/字典选择与医嘱保存直驱配方

- 表格内 `ypSelect`（df-page-dynamic）远程搜索下拉自动化不可靠；走弹窗"药品选择"按钮 → yewugymk 字典选择在**顶层文档**渲染（灰度下它是部署版，正常可用）。
- 字典选择直驱：`document.getElementById('yewugymk-app').__vue__` → 找 mainPage vm（有 `getYaoPinData`+`rowClick`）→ 找 DxDataGrid vm（有 `getInstance`+`updateDimensions`）→ `getInstance().getDataSource().items()` 取行 → `mainVm.rowClick({data})` → dialog vm（有 `handlerConfirm`+`dialogVisible`）`handlerConfirm()`。
- 剂量行内编辑：药品名 input 所在 `tr` 内 `type=text && !readOnly && !value` 的第一个 input。
- 保存按钮是 df-permit-button 文本 `保存(Ctrl+S)`；落库接口 `winbff-linchuangzy/bingRenYz/saveBingRenYzXx`（152 网关）。
- 91 收费项目医嘱（shuJuLy=17）不进医嘱列表显示（index.vue `handleCaoYaoSubmit` 只 addYiZhu caoYaoBz=1/2 的行），但随 `setChangesItem('bingRenYzs')` 落库——**验证看 `__yzkl.changes.bingRenYzs` 或 DB，不要在列表全文检索**。
- 组件逻辑级证据最快：给目标方法包 hook（`vm.$options.methods` 存在判定 + 实例属性替换），直接拿到返回值/条数/费用行数，比 UI 观察快一个量级。
- 清理测试医嘱：YiZhuList vm 设 `tableCheckedRows = [目标主医嘱]` → `deleteYiZhuMultiple()` → 确认 → 保存。

## 152 环境可直接复用的实测配置（2026-08 验证）

- 参数已配好：【草药医嘱_煎法来源】=2、【医嘱开立_草药处方煎药费生成模式】=2；给药方式 代煎(202, caoyaofangdjbz=1) 与 先煎(6872, 煎法类 caoyaofanggyfsbz=2) 均挂收费项目 4760158"煎药"。
- 测试病人：`测试病人22`（bingrenzyid=153516，测试住院科室/测试病区）。
- 住院医嘱表在 `df_lc_zhuyuan` schema（不是 df_jj_zhuyuan），列名全小写（yizhumc/daijiants/dayinjl/chuangjiansj），无 zuofeibz 列。

## 普通列表页（非 iframe 病人页）本地门户直通（DFHIS-32272 实测，2026-09-02）

- 上面"永远先在线壳子"是针对 iframe 型病人详情页的；**普通 qiankun 容器列表页**（如传染病报卡病种维护）本地三 dev server（df-web-main:9000 + df-web-bui:8034 + 目标子应用 dev）一次通过，无需在线壳子。
- entry 覆盖不用改 apps.dev.js：门户 `src/config/apps/index.js` 原生支持 `sessionStorage.devDebug='test'` + `sessionStorage['<子应用name>']='//localhost:<port>'`（Playwright `page.evaluate` 在登录前设置即可）。注意 apps.dev.js 里其它子应用 entry 本就指向 localhost:80xx，会有成串 REQFAIL，属无关噪音。
- 传染病报卡（xiTongId=75，系统选项名【750101】传染病报卡）：DBA 登录选该系统后落 `/apps/75/home`，直达病种维护 `/apps/75/bingZhongGl/bingZhongWh`；表头容器选择器用 `#apps-75 th`。病种/对照数据在 `df_yiliaogl.gy_bingzhong` / `gy_bingzhongdz`（同 jiBingDm 可同名不同 icd10 的真实重复，按记录拼接不去重）。
- 152 已部署后端不含未发布字段时，可用 `page.route` 拦截 `**/df-yiliaogl/bingZhong/getPage*` 注入真实库聚合值验证前端渲染（响应结构键是 `returnCode/returnData`，df-utils request 非 `data`），后端逻辑以单测为准并在云效评论注明限制。
