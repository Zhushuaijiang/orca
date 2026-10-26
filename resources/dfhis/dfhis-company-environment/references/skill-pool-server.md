# 团队技能池 / 技能包服务端运维（192.168.1.10:18800）

2026-08-16 实证。服务端 = hermes-bot-manager（systemd 服务 `hermes-bot-manager.service`），
代码 `/opt/workspace/github/hermes-agent-260623/bot_manager/`，SSH `root@192.168.1.10`（~/.ssh/id_rsa 免密）。

## Shadowrocket TUN 路由排障（2026-09-20）

- 现象：`nc` 显示 22/18800 端口可连接，但 SSH 在服务端 banner 前报 `kex_exchange_identification: Connection closed`，HTTP 报 `ERR_EMPTY_RESPONSE`；`route -n get 192.168.1.10` 显示流量走 Shadowrocket 的 `utun`（常见地址 `198.18.0.1`）。
- 根因：TUN 接管了公司内网 `192.168.1.10`，TCP 握手成功不代表请求到达真实服务器。
- 正确做法：先用 `ifconfig` 找到公司 Wi-Fi 的真实接口/IP，再绑定该接口访问，例如 `ssh -b <公司Wi-Fi-IP> root@192.168.1.10`、`curl --interface <Wi-Fi接口> --noproxy '*' http://192.168.1.10:18800/...`。接口名和 IP 不得写死；2026-09-20 现场为 `en1 / 192.168.200.178`。
- 验收：18800 应返回 Waitress/Flask 的正常 HTTP 响应（未认证页面通常 302 到 `/login`），SSH 应能完成握手并执行只读命令。

## 定时专家运行器门禁（2026-09-20）

- **管理端与运行器可能不是同一代码树**：现场 `hermes-bot-manager.service` 运行 `hermes-agent-260623/bot_manager`，`hermes-expert-runner.service` 仍运行 `hermes-agent-main/bot_manager/app.py --expert-runner`。修改调度、完成通知或队列执行逻辑时必须核对两个 systemd `ExecStart`，必要时两处同步修复并分别 `py_compile`，否则页面配置已更新但定时任务仍跑旧逻辑。
- **运行器必须显式设置 `HOME=/root`**：systemd 进程未带 HOME 时，Git 不读取 `/root/.gitconfig` 的逐仓 `safe.directory`，116 个仓库会全部报 `detected dubious ownership`。正确做法是在运行器 drop-in 设置 HOME，并逐个登记明确仓库；禁止用 `safe.directory=*`。验收要在 `env -i HOME=/root PATH=/usr/bin:/bin` 下执行目标仓库 `git status` 和 `git fetch`。
- **外部工具注册检查不能枚举整个 API 工具集**：调用 `get_tool_definitions(enabled_toolsets=["hermes-api-server"])` 只为确认 Jenkins/云效工具时，会触发可选 browser 探针和 Chromium 下载，导致 Git/Jenkins 专家阻塞。注册状态应只检查 `external_yunxiao_get_work_item`、`external_db_readonly_query`、`external_jenkins_list_jobs`、`external_jenkins_trigger_build`，完整工具集另由 `scripts/verify_external_tools.py` 验证。
- 真实巡检报告必须区分“任务执行成功”和“业务验证通过”：模型正常生成 `INFRA_FAILURE` / `INSUFFICIENT_EVIDENCE` 报告时，`expert_runs.status` 仍是 `success`，通知层必须解析报告结论，不能只看运行状态。

## 架构与数据流

- 上传：客户端 POST `/api/skill-contributions`（X-API-Key = `skillContributionUploadToken`，见本地 dfhis-environment.json）→ 记录进 `data/skill-contributions/index.json` + 版本文件。
- 整理：`skill_pool.py` 每日 03:03（服务器本地时间）自动跑 LLM 整理：贡献 → 单元（同贡献者同名只留最新版，再按内容哈希合并）→ 簇（剥 `-codex`/`-claude` 等 agent 后缀归簇）→ 每簇一次 LLM 分类/评分/取舍 → `data/skill-pool/pool.json`；整理前自动快照到 `data/skill-pool/snapshots/`。
- 发布：池条目 → promote 收录进技能包清单 `static/downloads/dfhis/dfhis-skill-pack.json`；ZIP 不自动重建，需单独触发。
- `data/skill-pool/deleted-names.json` 是黑名单：池内删除条目会记入，后续整理不再收编（但包内副本不受影响）。

## 上传契约与服务端去重（2026-09-14 实证，源码 skill_contributions.py）

- 请求体：`{"schemaVersion":1, "contributor":{"yunxiaoUserId","name"}, "clientHost", "collectedAt", "skills":[{"name","sourceHomes":["agents"], "files":[{"path","sha256","contentBase64"}]}]}`；files 为技能目录全量文件（跳过 `.` 开头文件/目录、`__pycache__`、`*.pyc`），path 为相对路径。
- 服务端去重（幂等）：对每个技能计算 `aggregateSha256 = sha256("\n".join(f"{path}:{sha256}" for 按 path 排序的 files))`；若该贡献者同名最新记录的 aggregateSha256 一致 → 返回 `{"status":"unchanged"}`，不建版本。所以**重复上传未变更技能无害**，客户端预扫描只是省流量的优化，不是必需。
- 本地预扫描"哪些技能需上传"时，必须用与上传完全相同的文件集合和同一算法复算 aggregate，再与 GET `/api/skill-contributions` 里自己 userId 的最新记录比对；文件集合不一致（如漏跳 `.pyc`）会全部误判为 CHANGED。
- 上传来源以 `~/.agents/skills` 为规范副本，但**两个家目录可双向分叉**（2026-09-14 实证：另一会话把 3 个新文件写进了 `~/.claude/skills`，反向也有 agents 更新的情况）。上传/同步前对同名技能逐文件 diff+mtime 比对，**双向合并取各自最新**，先在两边家目录收敛出同一份权威内容再上传；不能只认一边。

## 周更技能包完整链路（2026-09-14 实证）

「更新/上传经验包到服务端」的默认口径是**收录进 HIS 技能包**，不是只传贡献（用户纠正确认）。只调 `/api/skill-contributions` 上传完不等于进包。完整链路：

1. 盘点：`find ~/.agents/skills -newermt <7天前>` 列出变动技能（可并查 `~/.claude/skills`、`~/.codex/skills` 防分叉漏收）。
2. 比对：按上传契约的同一文件集合复算 aggregateSha256，与 GET `/api/skill-contributions` 中自己 userId 的各技能最新记录比对，只取 CHANGED/NEW（Orca 定时同步已覆盖的大部会显示哈希一致，跳过）。
3. 上传 CHANGED 技能 → 对每个上传记录调 `POST /admin/skill-contributions/<record_id>/to-pool` 刷池 → `POST /admin/skill-pool/promote`（form `name`/`pack=dfhis`）收录进包清单。
4. 全部 promote 完成后调一次 `POST /admin/skill-packs/dfhis/rebuild-zip` 重建 ZIP（promote 不会自动重建）。
5. 验证：重新下载 `static/downloads/dfhis/dfhis-skill-pack.zip`，`unzip -p` 抽查新文件正文确实在包内，再汇报。

中途若本地技能又有新沉淀（其他会话刚改了技能），按第 2 节先收敛家目录，再对增量技能重跑 3~5 步即可，链路幂等。

## HIS 智能体数据库

| 配置项          | 值                                                     |
| --------------- | ------------------------------------------------------ |
| PostgreSQL JDBC | `jdbc:postgresql://192.168.1.10:5432/dfhis_bot_direct` |
| 数据库          | `dfhis_bot_direct`                                     |
| 用户名          | `dfhis_bot_direct`                                     |
| 密码            | 从正在运行的服务进程环境读取；文档不留明文             |
| 业务时区        | `Asia/Shanghai`                                        |

查询时优先 SSH 到 `root@192.168.1.10`，从正在运行的
`hermes-bot-manager.service` 进程环境中读取 `BOT_MANAGER_DATABASE_URL` 并仅在
当前命令进程内使用，避免把密码复制进 shell 历史、工具输出或报告。只有不能复用
服务连接时才使用上表的直连配置。所有诊断和报表查询默认只读；不得在聊天、报告、
云效评论或日志中回显密码或完整连接串。

服务当前使用 PostgreSQL；`hermes_conversation_events.event_ts` 与
`hermes_mcp_events.event_ts` 均为 `timestamp with time zone`。月报、日报等自然日
统计前先执行 `SET TIME ZONE 'Asia/Shanghai'`，并在结果中记录数据库时间作为统计
截止时间。

### Bot 对话量统计口径

管理页 `/admin/conversations` 的实际分流规则在
`conversation_reports.bot_event_stats`：

- 名称以 `mcp-` 开头的 Bot 只统计 `hermes_mcp_events`；
- 其他 Bot 只统计 `hermes_conversation_events`；
- 禁止直接把两张表全部相加。部分 MCP 调用会同时留下普通对话行和 MCP 事件行，
  且 `hermes_mcp_events` 也可能存在非 `mcp-` 名称；直接相加会重复或偏离页面口径；
- 完整报表要把已配置但周期内为 0 的 Bot 也列出。Bot 全集取
  `bot_service.list_bots(force=True)` 与两张事件表的历史 `DISTINCT bot_name` 并集，
  周期统计未命中的名称补 0。

本月至今、按 Bot 汇总且与管理页一致的核心 SQL：

```sql
SET TIME ZONE 'Asia/Shanghai';

WITH canonical AS (
    SELECT bot_name, COUNT(*)::bigint AS total, 'conversation'::text AS source
    FROM hermes_conversation_events
    WHERE event_ts >= date_trunc('month', now())
      AND event_ts <= now()
      AND left(bot_name, 4) <> 'mcp-'
    GROUP BY bot_name

    UNION ALL

    SELECT bot_name, COUNT(*)::bigint AS total, 'mcp'::text AS source
    FROM hermes_mcp_events
    WHERE event_ts >= date_trunc('month', now())
      AND event_ts <= now()
      AND left(bot_name, 4) = 'mcp-'
    GROUP BY bot_name
)
SELECT bot_name, source, total
FROM canonical
ORDER BY total DESC, bot_name;
```

报表至少记录：统计区间、数据库时区、统计截止时间、普通 Bot 合计、MCP Bot 合计、
总计、每个 Bot 的数量以及 0 量 Bot。实时系统在查询期间仍会产生新事件；不同查询
截止时间的总数可能小幅变化，不要把这种变化误判为统计错误。

## 管理 API（X-API-Key = BOT_MANAGER_API_KEY，从服务进程环境读取，不记录明文）

- GET `/api/skill-contributions`（贡献上传 token）：列出全部贡献记录。
- POST `/admin/skill-contributions/delete-batch`（form `recordIds` 逗号分隔）：批量删贡献（连版本文件一起删）。
- POST `/admin/skill-contributions/<record_id>/to-pool`：指定贡献版本直接入池（未评分，会清该名的删除黑名单）。
- POST `/admin/skill-pool/run`：手动触发全量整理（后台线程，约 8 分钟；结果在 `data/skill-pool/runs/<versionId>.json`）。
- POST `/admin/skill-pool/promote`（form `name`/`pack`）：池条目收录进包清单（同名文件整体替换）。
- POST `/admin/skill-pool/remove-from-pack`（form `name`/`pack`）：从包剔除。
- POST `/admin/skill-pool/delete-entry`（form `name`）：从池删除并加黑名单。
- POST `/admin/skill-packs/<pack_id>/rebuild-zip`：从清单重建下载 ZIP（promote 后必须调，否则 zip 是旧的）。
- 页面均可用 `?key=<API_KEY>` 或 `X-API-Key` 头免登录访问。

### 2026-10-22 实操坑（必须遵守）

- `to-pool` / `rebuild-zip` 返回 `302` 是正常行为，不代表失败；成功与否要看后续记录状态或 ZIP 内容哈希。不要因为返回 HTML 重定向就重试。
- `to-pool` 路径里的 `<record_id>` 必须取自 `GET /api/skill-contributions` 的服务端记录（技能名 + 服务端下发的 versionId），不能用本地生成的时间戳拼接；拼错会 404 或静默不入池。
- `promote` 发布的是**技能池当前内容**，不是刚上传的贡献。上传后必须先对最新记录 `to-pool` 刷新池，再 `promote`；若先 promote 才发现内容是旧的，重新 `to-pool` + `promote`（本次 `ygt` 即因此二次 promote）。
- 重复 `rebuild-zip` 得到的 ZIP 整体 SHA256 每次都不同（zip 内条目/归档时间戳随构建变化），但清单 `version` 与逐文件哈希不变。验收以 manifest `version` + 逐文件 SHA256 为准；不要因两次重建的 ZIP 哈希不一致而重试或判失败。
- `promote` 接口可用 `X-API-Key: BOT_MANAGER_API_KEY` 调用；`rebuild-zip` 目前只接受浏览器登录 Cookie 时才返回 HTML 确认，但实际执行仍会更新 ZIP。如需避免凭据明文，可先 `curl -c cookiejar` 登录再用 `-b cookiejar` 发起。
- 不要直接把“服务端 manifest 与本地 SHA 对比”当作唯一判据；旧记录可能对应同一技能的旧版本。上传后必须用 `POST /api/skill-contributions` 返回的 `unchanged/stored` 判定，再 `to-pool` / `promote`，最终用 ZIP 内容逐文件 SHA 复核。
- `requirement-quality-audit`、`dfhis-frontend-unit-test-guide`、`dfhis-java-unit-test-guide`、`dfhis-consultation-orders` 在本次更新中出现过“manifest 与本地不匹配”，应以本地上传 payload 为准重新 `promote` + `rebuild-zip`，不要覆盖本地。
- `dfhis-laya-triage`、`dfhis-pacs-inpatient-identity`、`dfhis-template-scope` 等旧技能在服务端 manifest 中可能停留在历史版本；不要把“文件数一致”当成内容一致，必须逐文件哈希对比。

## 技能包下发到已打开的 Orca 客户端（2026-10-22 实证，源码 ~/workspace/code/git/orca）

- **客户端没有服务端推送通道，也不定时轮询**。Orca 启动时只把本地缓存重装回各 agent 家目录（`registerDfHisEnvironmentHandlers` → `refreshDfHisWorkflowPackInBackground` → `ensureDfHisWorkflowPackInstalled`），**不联网**；真正联网拉包的只有 `dfhisEnvironment.install`（设置页 “Save & install” / 一键配置，源码 `pullAndEnsureDfHisWorkflowPack`）。
- 因此服务端 `rebuild-zip` 完成后，“已打开客户端会自动更新”不成立，需要主动触发一次 install。UI 显示“本地修改 / Save & install”是保守判定，不代表真的落后；先读缓存元数据再下结论，别凭界面猜测。
- 无 UI 时的触发方式（运行中的 Orca 提供 runtime RPC）：读 `~/Library/Application Support/orca/orca-runtime.json` 拿 `authToken` 和 `transports[0].endpoint`（unix socket），按行写入 NDJSON：`{"id":"...","authToken":"...","method":"dfhisEnvironment.install","params":{}}`。**`params` 传 `{}` 或不传时使用已保存配置；传具体字段会先 `saveDfHisEnvironmentConfig` 落盘覆盖设置**，非必要不要传。
- 验证口径：`~/Library/Application Support/orca/dfhis-workflow-pack-cache/metadata.json` 的 `manifestVersion` 应等于服务端 `dfhis-skill-pack.json` 的 `version`（`appVersion` 只是拉取时的 Orca 版本，不能当新鲜度判断）；再把缓存 `dfhis/` 下文件与服务端 manifest 逐文件 SHA256 对齐。`retainCacheAcrossAppUpgrades: true` 保证升级不会用旧的内置包把已下载包盖回去。
- 该操作只覆盖**本机当前用户**的 Orca；其他机器/其他用户的家目录仍需各自触发，不能把一次成功当成全队已更新。被问“那么多人怎么下发”时，正确回答是：服务端包是唯一分发渠道，各客户端下次 install/首次启动拉取，不存在从一台机器群发到全队的通道；本地 RPC 只用于自机验收，别把它说成集体下发。

### 2026-10-26 远程包回退与收录边界

- DFHIS 远程包曾已完整下载，却因清单不含独立分发的 `ygt` 未通过必需技能校验，随后回退内置旧包。排查必须同时比较缓存 `manifestVersion` 和最终 agent 目录；缓存新不代表安装采用了远程包。远程包必需清单要按分发边界配置，并用“不含独立技能”的清单做端到端安装验收。
- 正式包与技能池有差异时不能全量 promote：两边可能各有新版，逐技能审查增删内容和文件集合，只收录确认向前的新版本，避免用技能池旧副本覆盖正式包独有规则或文档。
- `promote` 会发布池条目全部文件。收录前检查每个路径段，排除 `.keepers.local.md`、`.bundle-manifest.json` 等本地状态或生成元数据，不能只过滤根目录点文件；发布后同时验证无隐藏元数据路径、清单逐文件哈希及 ZIP 与清单完全一致。

## 2026-08-16 去重整治口径（已落地的服务端修复）

- 重复根因：①同人同人名多版本各自成单元；②LLM 失败兜底按单元逐条入池 → 同名多条。
- 修复（`skill_pool.py`，备份 `skill_pool.py.bak-20260816-dedupe`）：单元先按（技能名， userId) 折叠到最新版；兜底每簇只出一条且优先主理人变体；多变体 prompt 加"HIS/云效/发布领域质量相当以竺帅江变体为准"；落池前同名安全网去重。主理人 userId 可用 env `SKILL_POOL_PREFERRED_USER_ID` 覆盖。
- 贡献去重：每人每技能只留最新一条，旧版本走 delete-batch 删除（先 `tar czf` 备份 data/skill-contributions）。
- 注意：贡献记录的 userName 取自上传时身份解析，异常客户端会落成 `dt_xxx`（userId 仍正确）；展示异常时按 userId 修正 index.json 即可。
- dfhis-yibao-dmdz 池内目前是杜萍版本（竺帅江未上传过该技能），如需统一口径先上传再 promote。

## 2026-08-27 Orca 桌面发布误覆盖正式技能包事故

- 事故表现：正式 HIS 技能包从 26 项降为 13 项；每日 03:03 整理仍只更新技能池，不能自动修复正式包。
- 根因：Orca 桌面发布脚本从仓库静态目录 `resources/dfhis` 生成 13 项候选包，并默认覆盖服务器动态维护的正式 JSON/ZIP；发布前没有备份，也没有技能数回退门禁。
- 恢复口径：先备份线上正式 JSON/ZIP，再把仍在技能池的缺失技能逐项 `promote` 合并回正式清单，最后调用 `rebuild-zip`。不要用客户端缓存或仓库静态目录整体覆盖线上包。
- 桌面版本与正式技能包是两条独立发布链。桌面发布默认不得改技能包；只有显式 `--publish-skill-pack` 才能发布技能包。
- 显式发布前必须比较候选包与线上包的顶层技能数；候选数更少时默认终止，只有经过人工确认才能使用 `--allow-skill-pack-shrink`。
- 覆盖正式包前必须把当前 JSON/ZIP 及 SHA256 保存到 `static/downloads/dfhis/backups/`；发布后必须验证清单内文件哈希、ZIP 内容以及公网 JSON/ZIP 与服务器磁盘哈希一致。
