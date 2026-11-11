# nextcloud-kb

Orca 插件：把一台 Nextcloud 作为团队知识库，在 Orca 右侧边栏里浏览、搜索并在线打开文件。

- **浏览**：WebDAV `PROPFIND`（Depth 1）懒加载目录树；双击文件直接在线打开，选中后操作栏提供 打开 / 下载 / 重命名 / 删除，无预览页签、无编辑区
- **刷新**：切换右侧边栏标签页不会重新请求，目录树与展开状态直接从本地保存的数据显示（最近 ≤24 个文件夹、≤1200 个条目）；只有点顶部「刷新」图标（或出错时的「重试」）才会重新连接并读取目录
- **右键菜单**：目录树上右键任意条目：上传文件到此处… / 新建文件夹 / 重命名 / 删除
- **上传**：右键「上传文件到此处…」弹出系统文件选择框（可多选），选中即上传到该目录；也可把系统文件直接拖进目录树：落在目录上传到该目录，落在文件上传到它所在的目录，落在空白处传到根目录。没有手输本地路径的输入行。单文件 ≤512 MiB，一批 ≤64 个文件
- **搜索**：worker 边爬边用的本地文件名索引（PROPFIND 并发 12），输入 120 ms 即出结果；索引未覆盖时零命中回退服务器统一搜索。完成后的索引存入插件私有存储（`storage:own`），重开面板 / worker 重启后直接恢复、不再重建；点「刷新」在后台重新爬取，当前结果照常可用
- **打开**：任何类型一律「在线打开」交给浏览器（PDF、图片、Office、文本均由 Nextcloud 自带查看器渲染），面板内不做预览/编辑
- **在线打开**：复用或创建公开链接（OCS shareType 3），浏览器打开无需登录；重复打开不会重复建分享
- **下载**：选中或打开文件时后台分块 Range 预取并解码（每块 ≤512 KiB，避开 worker 1 MiB 响应上限）；点击「下载」立即 `files.saveAs`，不消耗一次性点击授权（≤45 MiB）
- **凭据**：仅存应用密码（`secrets:own` 加密文件），不发登录密码；HTTP 只在 worker 进程，面板帧网络全关

## 使用

1. 在 Nextcloud「设置 → 安全 → 设备与浏览器会话」创建**应用密码**（不要用登录密码）。
2. 打开 Orca 右侧边栏「知识库」面板，填服务器地址、用户名、应用密码，连接并保存。
3. 展开/搜索；双击文件在线打开，选中后用操作栏或右键菜单操作；上传用右键菜单或直接拖入文件。
4. 目录有变化时点顶部「刷新」：目录树重新读取、文件名索引在后台重建（当前搜索结果不中断）；切换标签页回来不会自动刷新。

## 结构

```
orca-plugin.json          manifest v2（trusted-worker + components 面板 + 声明式设置）
src/protocol.ts           面板↔worker 请求契约（PluginRequests 声明合并）
src/panel.tsx             面板：连接、目录树、搜索、操作栏、右键菜单、系统文件选择与拖拽上传（无构建 TSX）
src/panel.test.ts         面板测试：重开面板保留已存目录树、刷新按钮、首次打开
src/panel.check.ts        `orca plugin check` 场景
worker/main.ts            worker：连接管理 + panels.handle 各请求
worker/nextcloud.ts       纯 WebDAV/OCS 客户端（可注入 fetch，单测友好）
worker/nextcloud*.test.ts 单测（fixture 为真实 Nextcloud 35 响应）
worker/index-store.ts     文件名索引的插件私有存储持久化（分块 + 连接指纹 + 清理）
worker/index-store.test.ts 持久化单测：重启恢复、跨服务器隔离、清理、分块
```

> 索引按插件实例（qualified key）隔离：同一实例内重开 / 重启 / 更新都复用缓存；换一个 key 重装（如 dev 版换 git 版）不会带走私有存储，会重新建一次索引。

## 验证结论（2026-11-11）

- 插件：`validate` ok · `tsc` 0 错误 · `plugin test` 28/28（worker 25 + 面板 3）· `plugin check` 两场景渲染通过 · `oxlint` / `oxfmt --check` 通过
- 「刷新不丢索引」：完成的索引持久化到 `storage:own`，`kb.status {refreshIndex}` 与 `kb.search {refresh}` 改为后台重建、保留当前索引（不再 `invalidateIndex()` 清空），worker 重启经 `ensureRestored()` 立即恢复。索引只存 `[name, path, dir]`，按 **UTF-8 字节数**（`TextEncoder`）分块写入，留足单值 256 KiB / 总量 5 MiB 上限的余量——中文文件名按 JS `.length` 算会低估约 2–3 倍，曾导致 `storage.set` 被拒、`storage.json` 写不进去；换连接指纹 / 目录变更（`mkdir`/`delete`/`move`/`upload`）会清空旧缓存
- 0.6.5 端到端（2026-11-11，内网 13,653 项）：首轮建索引约 2.5 min 后写出 `storage.json`（15 块、每块 ~184 KB、共 ~2.9 MB、`complete:true`）；点「刷新」后 `kb.search` 仍 `indexed:true` / 13,653 项；`plugin restart` 后首次检索 0 s 即从缓存恢复 `indexed:true` / 13,653 项，不再重建
- 「不自动刷新」：面板测试用已保存的目录树重新挂载，且让服务器返回连接失败，目录树仍原样显示、没有错误提示；把 `setup()` 改回每次都 `refreshStatus()` 时该用例失败。另有「点刷新才重新列目录」「没有已存数据时首次列根目录」两个用例
- 真实内网 Nextcloud 35 端到端（2026-11-10，这些链路之后未改动）：`list` 中文目录 · 索引搜索首次 0.15 s（渐进结果）/ 就绪后 0.15 s，服务器搜索对照 0.84 s · `share` 首次创建、再次调用 `reused: true`，分享 URL 匿名访问返回 200 且直接渲染文件查看器（无登录表单） · `blobChunk` 两块（699 KB / 392 KB 响应）拼出 818,331 字节完整 PDF（`%PDF-` … `%%EOF`）
- 下载失败的两个根因：`String.fromCharCode` 一次展开 512 KiB 参数导致 V8 爆栈；旧实现在多次 Range 往返后才调用 `files.saveAs`，超过声明式面板 1 秒的一次性点击授权。现改为后台预取 + 解码，点击时零等待存盘
- 未做 GUI 验证：系统文件选择对话框（会弹出系统窗口）、真实的系统文件拖入、浏览器跳转与原生保存对话框（避免弹出/抢焦点）；这几条依赖含新宿主接口的 Orca 构建

## 一键启动（推荐）

```sh
./scripts/start-dev-orca.sh          # 拉起 dev Orca（复用已运行实例）并自动加载插件
./scripts/start-dev-orca.sh --stop   # 停止本实例
```

脚本自动定位 origin/main 工作树（默认 `../orca-main-kb`，`ORCA_DEV_WORKTREE` 可覆盖）、
dev 实例的隔离 profile、加载并显示连接状态。日常只需这一条命令，Orca 右栏「知识库」即真实库。

## 开发

```sh
orca plugin dev load .          # 开发加载（热重载）
orca plugin types .             # 生成 .orca/types 类型
npx tsc -p .                    # 类型检查
orca plugin test .              # 单测
orca plugin check .             # 面板渲染检查（含场景）
```

## 对 Orca 版本的要求

`engines.orca` 为 `>=1.4.246`，这是 **manifest v2 的 schema 下限**，不是 DFHIS 桌面端的发版号：manifest 省略 `publisher`（由仓库属主推导）且面板/worker 用无构建的 `.ts/.tsx` 源码，两项都要求 `>=1.4.246`，`orca plugin release-entry` 算出的 `minimumOrca` 也是 `1.4.246`。把它改低会让 `orca plugin validate` 直接失败。

DFHIS 桌面端发版号是 `1.4.214-rc.N`，两套编号不冲突：Orca 用 `pluginHostVersion()` 把预发布/开发构建的版本夹到当前 schema 的最新版再比对，所以能读这份 manifest 的 rc.N 构建都满足该下限（实测从 rc.25 起 git 安装、加载均正常）。

完整交互还依赖宿主 `src/` 的能力，不在插件包内，须由服务端发布流程产出：

- 目录树右键菜单（Tree `contextMenu`）、系统文件选择（`files.pick`）、拖拽上传（`onFilesDrop`）：需 rc.23 及以上
- 5 秒手势授权窗口（慢分享「在线打开」不退回 Link 兜底）：需 rc.26 及以上

MCP 端点、worker 激活即自动启用、以及写入各编码 agent 用户级配置都在插件侧，与 Orca 版本无关，装上插件即可用。

面板固定传入 `contextMenu` / `onContextAction` / `onFilesDrop`，不查 `ui.catalog`，旧版宿主会丢弃不认识的属性（只记警告），目录树照常显示；上传前用 `host.has('files.pick')` 检测，旧版宿主点「上传文件到此处…」只提示升级，拖入的文件被忽略，其余功能不受影响。
