# nextcloud-kb

Orca 插件：把一台 Nextcloud 作为团队知识库，在 Orca 右侧边栏里浏览、搜索、预览与编辑文件。

- **浏览**：WebDAV `PROPFIND`（Depth 1）懒加载目录树
- **搜索**：Nextcloud 统一搜索 `files` provider，文件名级、分页
- **预览**：Markdown 渲染 / 代码高亮（≤64 KiB 截断）；其余类型给元数据与在线打开链接
- **编辑回传**：文本文件编辑后 `PUT` 保存，`If-Match` etag 乐观锁，冲突时提示重新加载或强制覆盖
- **上传**：面板输入本地绝对路径，worker 读文件流式 PUT（≤512 MiB）
- **分享**：预览页一键生成公开链接（OCS Share API shareType 3）
- **下载**：分块 Range 读取 + `files.saveAs` 存盘（≤64 MiB，桌面端）
- **目录操作**：新建目录 / 移动重命名 / 删除（MKCOL/MOVE/DELETE，API 就绪）
- **凭据**：仅存应用密码（`secrets:own` 加密文件），不发登录密码；HTTP 只在 worker 进程，面板帧网络全关

## 使用

1. 在 Nextcloud「设置 → 安全 → 设备与浏览器会话」创建**应用密码**（不要用登录密码）。
2. 打开 Orca 右侧边栏「知识库」面板，填服务器地址、用户名、应用密码，连接并保存。
3. 展开/搜索/预览/编辑。保存冲突时按提示重新加载或强制覆盖。

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

- `pnpm`（本仓）：`validate` ok · `tsc` 0 错误 · `plugin test` 11/11 · `plugin check` 三场景渲染通过
- 端到端：本地 Nextcloud 35.0.2 容器（`nextcloud:35-apache`）实测 connect / list（中文目录）/ search / read / write（If-Match 乐观锁，陈旧 etag 返回 conflict）/ share / mkdir / move / delete / range / uploadLocal 全部通过；dev Orca 面板（origin/main 工作树）真实加载并渲染目录树、Markdown 预览、上传行

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
