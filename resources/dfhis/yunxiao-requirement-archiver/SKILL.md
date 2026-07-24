---
name: yunxiao-requirement-archiver
description: Archive Aliyun Yunxiao / DFHIS work-item requirements and drive Yunxiao-linked code workflows by calling the HIS MCP Bot Manager expert "云效需求归档专家". Use when the user asks to archive, download, capture, save, analyze, locate repositories for, or fix Yunxiao requirements, defects, DFHIS IDs, Yunxiao links, requirement descriptions, raw JSON, context, attachments, or related code changes.
---

# Yunxiao Requirement Archiver

## Overview

Use this skill to run the same server-side archive path as Bot Manager expert `云效需求归档专家` (`builtin_key=yunxiao_requirement_archiver`) through the HIS MCP service. Prefer MCP over direct SSH because Codex users may not have shell access to `192.168.1.10`.

## Source Expert

- HIS MCP URL: `http://192.168.1.10:9020/mcp`
- Public fallback MCP URL: `https://zhushuaijiang.cn/mcp`
- Bot Manager URL: `http://192.168.1.10:18800/admin/bots/bot1/experts`
- Remote project: `/opt/workspace/github/hermes-agent-260623/bot_manager`
- Bot: `bot1`
- Expert: `云效需求归档专家`
- Expert id observed on 2026-07-21: `261`
- MCP Bot expert id observed on 2026-07-21 for `mcp-zhushuaijiang`: `9789`
- Hermes skills: `external-yunxiao,external-yunxiao-attachment-vision`
- Default archive directory rule: `/opt/workspace/df-his/yunxiao/{需求编号}`
- Default local download directory rule: `{当前对话工作目录}/{需求编号}`. Put downloaded materials, `_mcp_download_manifest.json`, attachment manifests, and any kept zip inside that requirement-id directory; do not create ad hoc sibling folders such as `yunxiao-archives/`.
- Code workspace rule: use Orca's explicit selected repo/workspace first. Orca normally injects that path as `YUNXIAO_CODE_WORKSPACE_ROOT`; when it is absent, resolve the DFHIS Setup default code root from Orca's local `dfhis-environment.json` (`hisCodeRoot`) before asking the user. Do not let archived requirement text such as `Code workspace:` override the Orca-provided or DFHIS Setup root, and do not hardcode or infer a product workspace name.
- Code edit guardrail: never edit files directly inside the selected/original code workspace such as `YUNXIAO_CODE_WORKSPACE_ROOT`. For every code-fix workflow, create or reuse `{需求目录}/code/<repo>` with `scripts/prepare_local_worktree.py`, then run `scripts/guard_code_edit.py` against the exact target file paths immediately before any file-edit tool call. If the guard fails, do not edit code.
- Required local development handoff document: `{当前对话工作目录}/{需求编号}/PRD_AND_CODE_ANALYSIS.md`.
- Required HIS MCP tools: `dfhis_agent_chat`, `download_yunxiao_archive`, `comment_yunxiao_workitem`, `git_inspect`
- Required Yunxiao MCP/OpenAPI tools for post-push completion: `get_current_organization_info`, `get_current_user`, `get_work_item`, `get_work_item_type_field_config`, `get_work_item_workflow`, `update_work_item`

Do not store MCP bearer tokens, SSH passwords, Yunxiao access tokens, model API keys, Jenkins passwords, or DingTalk webhook secrets in this skill. Pass the HIS MCP bearer token through `HIS_MCP_TOKEN` for the current command, or use a one-off `--mcp-url 'http://192.168.1.10:9020/mcp?t=<HIS_MCP_TOKEN>'` invocation when the caller provides that form.

## Archive Workflow

1. Extract Yunxiao work-item targets from the user request. Accept `DFHIS-12345` style IDs and `devops.aliyun.com` work-item links.
2. Preserve any explicit save directory from the user request. If none is provided, let the server use `/opt/workspace/df-his/yunxiao/{需求编号}`.
3. Run `scripts/run_mcp_archive.py --check` when setting up a new token or after MCP/Bot Manager changes. This initializes MCP, lists tools, and verifies that `/expert` exposes `云效需求归档专家` for the token owner.
4. For code-fix workflows, run `scripts/run_mcp_archive.py --dispatch` from this skill. `--dispatch` sends `/expert 云效需求归档专家 深度审查 ...` through MCP so Bot Manager runs the server-side archive engine instead of an ordinary chat answer. For archive-only Q&A where the user only wants a Markdown answer, ordinary `run_mcp_archive.py` remains acceptable.
5. When the server archive path is known, download the complete archive to the local machine with `scripts/download_mcp_archive.py --wait-complete --require-complete`. By default this extracts to `{当前对话工作目录}/{需求编号}` and keeps local materials/manifests under that single directory. This is required before code-fix work so the local coding agent can inspect `requirement.md`, `context.txt`, `analysis.md`, screenshots, and parent-requirement material without SSH. If `dfhis_agent_chat` returns a confusing natural-language blocker but `download_yunxiao_archive` successfully downloads a verified complete archive for the same work item, treat the archive as available and continue the code-fix workflow.
6. Generate `{需求编号}/PRD_AND_CODE_ANALYSIS.md` by combining the downloaded archive, attachment manifest, parent requirements, and local code evidence from the selected project workspace. This document is required for any view/analyze/fix workflow, not only when code is changed.
7. Return a concise chat summary and link to `PRD_AND_CODE_ANALYSIS.md`. Do not rely on chat-only analysis as the durable handoff.
8. If MCP returns `未找到专家` or `当前没有启用的专家`, do not assume the expert card is disabled. First run `--check` and compare `/expert` output with Bot Manager. If the admin page shows the expert enabled but `/expert` is empty, report an MCP/Bot Manager routing mismatch and ask an administrator to check the Bot Manager internal `/internal/experts` endpoint and service restart state.
9. If the script reports another failure, include the run id when available and the server error message. Do not invent archive files that were not returned.

Use `scripts/run_archive.py` only as a legacy fallback when the user explicitly allows direct SSH access to the Bot Manager host.

## MCP Script Usage

Run these commands from this installed skill directory. Use `python3` on macOS/Linux, `python` when it points to Python 3, or `py -3` on Windows.

Check that the remote MCP service and expert route are reachable:

```bash
HIS_MCP_TOKEN='...' python3 scripts/run_mcp_archive.py --check
```

Equivalent one-off URL-token form:

```bash
python3 scripts/run_mcp_archive.py \
  --mcp-url 'http://192.168.1.10:9020/mcp?t=<HIS_MCP_TOKEN>' \
  --check
```

Archive a work item:

```bash
HIS_MCP_TOKEN='...' python3 scripts/run_mcp_archive.py "请归档 DFHIS-12345"
```

Trigger the server-side archive engine for a code-fix workflow:

```bash
HIS_MCP_TOKEN='...' python3 scripts/run_mcp_archive.py --dispatch "请归档 DFHIS-12345 到 /opt/workspace/df-his/yunxiao/DFHIS-12345"
```

Archive to an explicit server directory:

```bash
HIS_MCP_TOKEN='...' python3 scripts/run_mcp_archive.py "请归档 DFHIS-12345 到 /opt/workspace/df-his/yunxiao/DFHIS-12345"
```

Download a completed server archive to local disk:

```bash
HIS_MCP_TOKEN='...' python3 scripts/download_mcp_archive.py DFHIS-12345 \
  --wait-complete --require-complete
```

Comment on the Yunxiao work item after pushing code:

```bash
HIS_MCP_TOKEN='...' python3 scripts/comment_mcp_yunxiao.py DFHIS-12345 \
  --content-file /path/to/comment.md
```

Update Yunxiao completion fields after pushing code. This is mandatory after a successful push and is not replaced by a comment:

```bash
python3 scripts/update_yunxiao_completion_fields.py \
  --requirement-dir /path/to/DFHIS-12345 \
  --client-change 'df-web-example: feature-DFHIS-12345 (abcdef1)' \
  --server-change '无' \
  --data-change '无'
```

Useful options:

- `--mcp-url` defaults to the LAN MCP endpoint and can be set to the public fallback URL. It may include `?t=<token>` for one-off calls; `?token=`, `?access_token=`, and `?mcp_token=` are also accepted. If both URL token and `HIS_MCP_TOKEN` exist, the environment variable wins. Scripts strip the token from the request URL and send it as a Bearer authorization header.
- `--expert` defaults to `云效需求归档专家`.
- `--timeout` controls the local HTTP request timeout. Use a larger value for work items with many attachments.
- `--session-id` can force a specific Agent session id, but ordinary archive runs should use the script default fresh session.
- `run_mcp_archive.py --dispatch` triggers Bot Manager's background expert run via MCP and returns a report link quickly. Follow it with `download_mcp_archive.py --wait-complete --require-complete`.
- `run_mcp_archive.py --review-mode quick` can be paired with `--dispatch` when the user explicitly asks for a quick daily-style expert run instead of deep review.
- `--json` prints the raw MCP JSON wrapper instead of only the expert answer.
- `--check` exits non-zero when `/expert` does not list the configured expert, even if MCP itself initializes successfully.
- `download_mcp_archive.py --no-attachments` can skip large screenshot/file attachments when only text context is needed.
- `download_mcp_archive.py` defaults to extracting into `./DFHIS-12345` from the current conversation working directory. Use `--output-dir` only when the user explicitly requests a different local path.
- `download_mcp_archive.py --keep-zip` keeps the verified zip inside the requirement-id directory.
- `download_mcp_archive.py --require-complete` exits non-zero when core evidence such as `raw.json`, `context.txt`, or `attachments_manifest.json` is missing.
- `download_mcp_archive.py --wait-complete` polls until the archive becomes `complete`, which prevents stale minimal server directories from being mistaken for successful archives while a background run is still executing.
- If the server archive contains root `attachments/` files but omits the root `attachments_manifest.json`, `download_mcp_archive.py` generates a local `attachments_manifest.json` from the verified MCP file list and marks it as locally generated.
- `comment_mcp_yunxiao.py` publishes a Markdown comment through HIS MCP and Bot Manager's configured Yunxiao integration. Use it after every successful branch push.
- `update_yunxiao_completion_fields.py` uses Yunxiao MCP/OpenAPI directly. It reads `raw.json`, resolves the current organization, finds the work item workflow and field config, updates status to `待测试`, adds participants, writes `客户端变更`/`服务端变更`/`数据变更`, then reads the work item back and fails if verification does not match.

## Post-Push Yunxiao Completion Harness

After code is pushed, the Yunxiao work item is not complete until both the comment and structured fields are updated and verified.

Use actual changes to decide field values:

- `客户端变更`: frontend/client repository and pushed branch/commit, for example `df-web-bingangl: feature-DFHIS-31703 (0404254)`. Use `无` only when no client/frontend repository changed.
- `服务端变更`: backend/server repository and pushed branch/commit. Use `无` when no backend repository changed.
- `数据变更`: SQL script, migration file, or data patch identifier. Use `无` when no SQL/data/config migration changed.
- `参与者`: preserve existing participants and add the current assignee and current Yunxiao token user. If another developer actually contributed code, pass their user id with `--participant`.
- `状态`: update to `待测试` after code is pushed and the above fields are written.

The completion harness must run after all branch pushes and before the final chat summary. If it fails because Yunxiao MCP credentials, tools, workflow, or field config are unavailable, report the workflow as incomplete with the exact error. Do not silently fall back to a plain comment or browser screenshot.

## PRD And Code Analysis Handoff

After downloading the archive, create one durable handoff document named `PRD_AND_CODE_ANALYSIS.md` in the requirement-id directory. Use `templates/prd_code_analysis.md` as the required structure.

Inputs that must be consumed:

- `raw.json`, `requirement.md`, `description.md`, `context.txt`, `analysis.md`, `attachments_manifest.json`, and any `original/*` parent requirement files.
- All downloaded screenshots/attachments that show pages, buttons, fields, prompts, states, dictionaries, or expected UI behavior.
- Local code under the resolved code root. Use `YUNXIAO_CODE_WORKSPACE_ROOT` first. If it is absent, read the DFHIS Setup default code root from Orca's `dfhis-environment.json` field `hisCodeRoot` and export/use it as `YUNXIAO_CODE_WORKSPACE_ROOT`. Do not override this root with requirement-body hints or remembered workspace names.

Resolve the code root before declaring it missing. Use this order:

1. `YUNXIAO_CODE_WORKSPACE_ROOT`
2. `YUNXIAO_DEFAULT_CODE_ROOT`
3. `${ORCA_USER_DATA_PATH}/dfhis-environment.json` field `hisCodeRoot`
4. Platform fallback config files, preferring the active profile with a non-empty `hisCodeRoot`:
   - `~/Library/Application Support/orca-dev/dfhis-environment.json`
   - `~/Library/Application Support/orca/dfhis-environment.json`
   - `~/AppData/Roaming/orca-dev/dfhis-environment.json`
   - `~/AppData/Roaming/orca/dfhis-environment.json`
   - `~/AppData/Roaming/Orca/dfhis-environment.json`

Portable resolver:

```bash
python3 - <<'PY'
import json, os, pathlib

paths = []
if os.environ.get("ORCA_USER_DATA_PATH"):
    user_data = pathlib.Path(os.environ["ORCA_USER_DATA_PATH"])
    paths.extend([
        user_data / "dfhis-environment.json",
    ])
home = pathlib.Path.home()
paths.extend([
    home / "Library/Application Support/orca-dev/dfhis-environment.json",
    home / "Library/Application Support/orca/dfhis-environment.json",
    home / "AppData/Roaming/orca-dev/dfhis-environment.json",
    home / "AppData/Roaming/orca/dfhis-environment.json",
    home / "AppData/Roaming/Orca/dfhis-environment.json",
])

for key in ("YUNXIAO_CODE_WORKSPACE_ROOT", "YUNXIAO_DEFAULT_CODE_ROOT"):
    value = os.environ.get(key, "").strip()
    if value:
        print(value)
        raise SystemExit(0)

for path in paths:
    try:
        value = json.loads(path.read_text()).get("hisCodeRoot", "").strip()
    except Exception:
        continue
    if value:
        print(value)
        raise SystemExit(0)
raise SystemExit("YUNXIAO_CODE_WORKSPACE_ROOT is unset and DFHIS Setup hisCodeRoot was not found")
PY
```

The document must be implementation-ready:

- Include source metadata and archive status so the document is auditable.
- Separate confirmed facts from inference. Mark any uncertain rule as `待确认`.
- List every affected frontend/backend repository with branch, remote when available, module purpose, and concrete file paths with line references.
- When locating repositories, search the selected code workspace first by project name, route, endpoint path, Feign client name, package name, controller class, and API module references. Repository directory names may differ from service names, so do not mark a service repository missing until the selected workspace has been checked. Use fallback roots only after recording why the selected workspace was insufficient.
- Describe current behavior from code evidence before proposing changes.
- Provide frontend PRD, backend PRD, database/schema changes, parameter/dictionary changes, API contract changes, state transitions, validation rules, compatibility behavior for parameter-off mode, and rollback/feature toggle behavior.
- Include an implementation checklist ordered by dependency, with exact files/classes/functions to edit or create.
- Include acceptance criteria, regression scope, and test cases that a developer/QA can execute.
- Do not write vague directives such as “modify related code”; every required change must name the likely file, API, table, parameter, or unresolved repository gap.

If the needed repository is absent from the local code root after endpoint/package/API cross-checks, record the missing repo in the document with the API/module name and evidence that references it. Continue analyzing available code instead of blocking the whole handoff.

## HIS Code-Fix Workflow

When the user asks to fix a DFHIS requirement:

1. Archive or reuse the existing archive via HIS MCP.
2. Download the complete archive locally with `scripts/download_mcp_archive.py --wait-complete --require-complete`. Inspect the script's `archive_quality` result before code changes. If the quality is `minimal` or `incomplete`, treat the workflow as failed/blocked for code modification, not as success; report the missing evidence and ask for Yunxiao/API/attachment recovery or user-supplied screenshots/details.
3. Call HIS MCP `dfhis_agent_chat` with the local requirement facts and ask for affected repositories, modules, file paths, rg keywords, and whether backend/database changes are required.
4. Cross-check with read-only evidence. Use MCP `git_inspect` for allowed git metadata and local `rg` against the selected Orca code workspace, including project names, routes, service endpoint paths, Feign client names, controller names, and package names because service names and repository directories can differ. Do not use SSH shell access to `192.168.1.10` as a required step.
5. Generate or update `{需求编号}/PRD_AND_CODE_ANALYSIS.md` from the required template before editing code. The document must include the final planned file/module changes and known gaps.
6. Resolve the Git remote URL for each target repository. Prefer MCP output that includes the remote; otherwise ask HIS MCP for the exact Git remote. Do not copy repositories from `/opt/workspace/df-his/df-knowledge` with `rsync`, `scp`, or server filesystem access.
7. Clone or update only the target repository on the local machine using local Git credentials. Use `scripts/prepare_local_worktree.py` to run `git clone`, `git fetch`, and `git worktree add`. Put requirement-specific code worktrees under `{需求目录}/code/{repo-name}` so requirement evidence and code stay together. Branch naming is based on Yunxiao work-item type: defects/bugs use `hotfix-DFHIS-12345`; requirements/features use `feature-DFHIS-12345`. If the type is unknown, inspect `raw.json`/`requirement.md` first instead of guessing.
8. Before every code edit, run `scripts/guard_code_edit.py --requirement-dir {需求目录} {待编辑文件...}` and confirm it prints `ok`. This is mandatory even when the target file path looks obvious. The guard must validate that each edited path is under `{需求目录}/code/<repo>` and that the branch is `feature-DFHIS-12345` or `hotfix-DFHIS-12345`; if it fails, fix the worktree setup first and do not edit the original workspace.
9. Implement the smallest code change that matches the evidence and the handoff document. Do not modify unrelated repositories or formatting.
10. Verify locally. Prefer `lint`, `build`, or syntax checks from the repo scripts. If private dependencies block verification, record the exact blocker in both the chat summary and the handoff document.
11. Commit and push the branch from the local machine. Do not upload patches to `192.168.1.10` for server-side pushing.
12. After every successful push, comment on the Yunxiao work item with `scripts/comment_mcp_yunxiao.py`. The comment must include repository, branch, commit id, changed files, concise fix summary, validation result, handoff document path, and any dependency/test blockers. If commenting fails, treat the workflow as incomplete and report the exact failure.
13. After the comment, run `scripts/update_yunxiao_completion_fields.py` to update structured Yunxiao fields. Set `客户端变更` only for frontend/client repositories that changed, `服务端变更` only for backend/server repositories that changed, and `数据变更` only for SQL/data/config migration scripts that changed; otherwise set the field to `无`. The script must update status to `待测试`, add participants, and verify by reading the work item back. If this field update fails or verification fails, treat the workflow as incomplete and report the exact failure.
14. Report branch name, commit id, pushed remote, Yunxiao comment status/action id, Yunxiao field update status, changed files, validation result, local archive path, PRD/code-analysis document path, and any dependency/test blockers.

## Local Git Workflow

Use local Git for all repository operations. The standard setup command is:

```bash
python3 scripts/prepare_local_worktree.py \
  --remote ssh://git@119.3.123.58:2289/group/project.git \
  --repo-dir /path/to/local/cache/project \
  --worktree-dir "$YUNXIAO_REQUIREMENT_DIR/code/project" \
  --base-ref origin/RC_2.16.1_250514 \
  --branch hotfix-DFHIS-12345
```

Then work inside `--worktree-dir`:

```bash
python3 scripts/guard_code_edit.py \
  --requirement-dir "$YUNXIAO_REQUIREMENT_DIR" \
  "$YUNXIAO_REQUIREMENT_DIR/code/project/path/to/file.java"
git status --short
git add <changed-files>
git commit -m "fix(scope): message"
git push -u origin <branch>
python3 scripts/comment_mcp_yunxiao.py DFHIS-12345 \
  --content-file /path/to/comment.md
python3 scripts/update_yunxiao_completion_fields.py \
  --requirement-dir "$YUNXIAO_REQUIREMENT_DIR" \
  --client-change "project: feature-DFHIS-12345 (<commit>)" \
  --server-change "无" \
  --data-change "无"
```

If host key verification fails, create a workspace-local `known_hosts` file and run Git with:

```bash
GIT_SSH_COMMAND="ssh -o UserKnownHostsFile=/path/to/work/known_hosts -o StrictHostKeyChecking=yes" git push -u origin <branch>
```

Never require:

- `ssh root@192.168.1.10`
- `rsync` or `scp` from `/opt/workspace/df-his/df-knowledge`
- applying patches on a server worktree
- server-side `git push`

## Expected Server Output

The server-side expert should generate:

- `raw.json`
- `requirement.md`
- `description.md`
- `context.txt`
- `attachments_raw.json` when ordinary attachment listing succeeds
- `attachments_manifest.json`
- `original_requirements.json`
- `analysis_input.md`
- `analysis.md`
- `soul_analysis.md` when second-stage SOUL analysis is available
- downloaded files under `attachments/`

The final Markdown must report archive status, target directory, file list, attachment counts, failed downloads, and any second-stage analysis returned by the server.

## Local Archive Download

The HIS MCP server should expose `download_yunxiao_archive`. The tool is read-only, restricted to `/opt/workspace/df-his/yunxiao`, and returns a zip as base64 chunks with `zip_sha256` for local verification. Use `scripts/download_mcp_archive.py` instead of implementing ad hoc curl calls.

The downloader reports `archive_quality`:

- `complete`: core evidence files exist (`raw.json`, `requirement.md`, `description.md`, `context.txt`, `analysis.md`, `attachments_manifest.json`).
- `minimal`: only generated requirement/analysis/description text is present. This is useful for triage but not enough for confident code changes when screenshots or comments are expected.
- `incomplete`: missing even core generated documents; stop and report the failure.

Default local archive layout:

```text
./DFHIS-12345/
├── _mcp_download_manifest.json
├── DFHIS-12345.zip
├── requirement.md
├── context.txt
├── analysis.md
├── PRD_AND_CODE_ANALYSIS.md
├── attachments_manifest.json
├── attachments/
├── code/
│   └── <repo-name>/
└── original/
```

## Failure Handling

- If no DFHIS ID or Yunxiao link is present, ask the user for the target requirement identifier.
- Do not infer the code workspace from a work item prefix, product label, archived `Code workspace:` text, or a remembered previous task. Use `YUNXIAO_CODE_WORKSPACE_ROOT` first, then the DFHIS Setup default code root resolver above. Stop and ask which local code workspace should be used only when both are absent or the resolved root clearly conflicts with the requirement evidence.
- If MCP authentication fails, ask for a current HIS MCP bearer token. Do not write the token into files.
- If MCP is reachable but `dfhis_agent_chat` says the expert is missing, verify with `run_mcp_archive.py --check`. If `/expert` is empty while the Bot Manager card shows enabled, treat it as a server routing/internal endpoint issue, not as proof that the user disabled the expert. Ask a Bot Manager administrator to check `/internal/experts` and restart the relevant services.
- If `dfhis_agent_chat` returns an inconsistent archive failure but `download_mcp_archive.py` succeeds for the same DFHIS id, record the inconsistent expert reply as a server-side expert-routing risk and continue with the verified local archive.
- If `download_mcp_archive.py` reports `archive_quality.level` as `minimal` or `incomplete`, do not proceed to code changes unless the user explicitly accepts the evidence gap. Ask for the missing Yunxiao details, screenshots, comments, or an API/auth fix.
- If MCP identifies only a server filesystem path and no Git remote URL, ask MCP for the remote URL or derive it from an already-local Git clone. Do not fall back to server filesystem copying.
- If `download_yunxiao_archive` is missing from `tools/list`, ask an administrator to deploy/restart the HIS MCP server version that exposes the archive download tool. Do not use SSH/SCP as the normal team workflow.
- If `comment_yunxiao_workitem` is missing from HIS MCP `tools/list`, ask an administrator to deploy/restart the HIS MCP server version that exposes the Yunxiao comment tool. Do not silently skip the Yunxiao comment.
- If Yunxiao MCP/OpenAPI lacks `update_work_item`, `get_work_item`, `get_work_item_type_field_config`, or `get_work_item_workflow`, ask an administrator to enable the project-management toolset. Do not mark a pushed requirement complete until structured Yunxiao fields have been updated and verified.
- If local Git push fails with host key verification, use a workspace-local `known_hosts` file with `GIT_SSH_COMMAND`; do not require server-side pushing.
- If the expert id changes, rerun with `--check`; the script can fall back to looking up the expert by name.
