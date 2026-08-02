---
name: dfhis-company-environment
description: DFHIS 公司内网环境验证资料。用于 HIS/云HIS/DFHIS/医共体/YGT 需求修复后的本地验证、数据库查询、Redis 检查、Oracle/MySQL/PostgreSQL 连接、SkyWalking 排查、Jenkins/发布验证、Node 18/Node 22/Node 24 工具链切换、环境选择和联调排障。
---

# DFHIS Company Environment

Use this skill when a DFHIS task needs real company environment details for verification.

## Reference Files

- Read `references/environment-index.md` first to choose the target environment.
- Read `references/runtime-toolchain.md` before frontend builds, Jenkins builds, package installs, or any task that depends on Node/pnpm/yarn/npm versions.
- Read only the matching file under `references/company-environment/` before querying a database, Redis, middleware, SkyWalking, or service endpoint.
- If Jenkins, packaging, or release details are added later, keep them under `references/` and load only the relevant reference for the task.

## Verification Rules

- Match the environment to the task stage: local development, test, pre-release, demo, standard database, 152, 183, or YGT/医共体 development.
- Select the runtime from repository evidence first, then project family fallback from `references/runtime-toolchain.md`.
- Prefer read-only checks for database and middleware validation.
- Do not print passwords, tokens, or full connection strings in chat, Yunxiao comments, commits, PR descriptions, or logs unless the user explicitly asks for the exact value.
- Record verification evidence by environment name, query purpose, command category, and result summary instead of echoing credentials.
- If an environment cannot be reached, report the exact host/service category and error, then try the next relevant validation route only when it is safe.

## HIS Test Account Password Lookup

When HIS integrated E2E needs a login password and the task targets a real company environment, do not guess or block on memory. Load the matching environment file and query the target PostgreSQL database read-only for the public internal password parameter:

```sql
select canshuid, canshums, canshuzhi
from df_zhushuju.gy_canshu
where canshuid like '%万能密码%';
```

For reports and chat, record only that the password parameter exists and is non-empty. Do not echo `canshuzhi` unless the user explicitly asks for the exact value. Use the retrieved value only inside the local E2E process, environment variables, or an ignored credential file.

## Common Use

1. Load `references/environment-index.md`.
2. Select the environment whose stage matches the requirement.
3. Open the corresponding Markdown file in `references/company-environment/`.
4. Load `references/runtime-toolchain.md` before build or Jenkins work.
5. Run focused validation: database query, Redis key check, service health, SkyWalking trace, or Jenkins/build check.
6. Summarize results without exposing secrets.

## Executable Workflow

- Use `his-workflow-harness` for general HIS runtime selection, local verification, read-only database checks, Jenkins, deployment, and smoke evidence.
- Use `ygt` and its harness for 医共体/YGT repositories.
- Run harness commands against the isolated requirement worktree, not the original aggregate code root.
- Use the bundled `../his-workflow-harness/references/company-environments.json` catalog for named company environments; add service mappings there as Jenkins jobs become known.
- Pass an alternate catalog through `HIS_WORKFLOW_CATALOG` or `--catalog` when a requirement needs mappings not present in the bundled catalog.
- Save the harness report below the requirement directory and record its `runtime`, `database`, `jenkins`, `deployment`, and `smoke` evidence in the Requirement Contract.
