# nextcloud-kb

Orca 插件：把一台 Nextcloud 作为团队知识库，在 Orca 右侧边栏里浏览、搜索、预览与编辑文件。

- **浏览**：WebDAV `PROPFIND`（Depth 1）懒加载目录树；双击文件直接在线打开，选中后操作栏提供 打开 / 下载 / 预览 / 重命名 / 删除
- **右键菜单**：目录树上右键任意条目：上传文件到此处 / 新建文件夹 / 重命名 / 删除（需要 Orca `ui.catalog` ≥5，即 1.4.214-rc.23+；旧版自动隐藏）
- **搜索**：worker 边爬边用的本地文件名索引（PROPFIND 并发 12），输入 120 ms 即出结果；索引未覆盖时零命中回退服务器统一搜索
- **预览**：文本 Markdown / 代码高亮（≤64 KiB 截断）；PDF、图片、Office 等直接「在线打开」交给浏览器，不再显示"不支持预览"
- **编辑回传**：文本文件编辑后 `PUT` 保存，`If-Match` etag 乐观锁，冲突时提示重新加载或强制覆盖
- **上传 / 目录操作**：面板输入本地绝对路径上传到当前目录；选中条目可新建文件夹、重命名、删除（内联确认）
- **在线打开**：复用或创建公开链接（OCS shareType 3），浏览器打开无需登录；每次预览不会重复建分享
- **下载**：打开预览时后台分块 Range 预取并解码（每块 ≤512 KiB，避开 worker 1 MiB 响应上限）；点击「下载」立即 `files.saveAs`，不消耗一次性点击授权（≤45 MiB）
- **凭据**：仅存应用密码（`secrets:own` 加密文件），不发登录密码；HTTP 只在 worker 进程，面板帧网络全关

## 使用

1. 在 Nextcloud「设置 → 安全 → 设备与浏览器会话」创建**应用密码**（不要用登录密码）。
2. 打开 Orca 右侧边栏「知识库」面板，填服务器地址、用户名、应用密码，连接并保存。
3. 展开/搜索；双击文件在线打开，选中后用操作栏或右键菜单操作。文本文件可从操作栏进预览页签编辑，保存冲突时按提示重新加载或强制覆盖。

## 结构

```
orca-plugin.json        manifest v2（trusted-worker + components 面板 + 声明式设置）
src/protocol.ts         面板↔worker 请求契约（PluginRequests 声明合并）
src/panel.tsx           面板：连接、目录树、搜索、预览、编辑（无构建 TSX）
src/panel.check.ts      `orca plugin check` 场景
worker/main.ts          worker：连接管理 + panels.handle 各请求
worker/nextcloud.ts     纯 WebDAV/OCS 客户端（可注入 fetch，单测友好）
worker/nextcloud.test.ts  单测（fixture 为真实 Nextcloud 35 响应）
```

## 验证结论（2026-11-10）

- `pnpm`（本仓）：`validate` ok · 插件 `tsc` 0 错误 · `plugin test` 18/18 · `plugin check` 三场景渲染通过 · `check:code-quality:changed` 通过
- 真实内网 Nextcloud 35 端到端：`list` 中文目录 · 索引搜索首次 0.15 s（渐进结果）/ 就绪后 0.15 s，服务器搜索对照 0.84 s · `share` 首次创建、再次调用 `reused: true`，分享 URL 匿名访问返回 200 且直接渲染文件查看器（无登录表单） · `blobChunk` 两块（699 KB / 392 KB 响应）拼出 818,331 字节完整 PDF（`%PDF-` … `%%EOF`）
- 下载失败的两个根因：`String.fromCharCode` 一次展开 512 KiB 参数导致 V8 爆栈；旧实现在多次 Range 往返后才调用 `files.saveAs`，超过声明式面板 1 秒的一次性点击授权。现改为后台预取 + 解码，点击时零等待存盘
- 面板原生保存对话框与在线打开的浏览器跳转未做 GUI 点击验证（避免弹出/抢焦点），数据与交互链路由上述 bridge 调用验证

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

需要 Orca ≥1.4.246 且面板组件目录 ≥v2（Tree/Table/Textarea/Markdown/CodeView；当前 origin/main 构建已包含，历史正式版需 ≥1.4.247）。
