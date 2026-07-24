---
name: yunxiao-requirement-archiver
description: Archive Aliyun Yunxiao / DFHIS work-item requirements and drive Yunxiao-linked code workflows by using Orca's direct Yunxiao archive scripts. Use when the user asks to archive, download, capture, save, analyze, locate repositories for, or fix Yunxiao requirements, defects, DFHIS IDs, Yunxiao links, requirement descriptions, raw JSON, context, attachments, or related code changes.
---

# Yunxiao Requirement Archiver

## Overview

Use this skill to run the Orca-local version of Bot Manager expert `云效需求归档专家` (`builtin_key=yunxiao_requirement_archiver`). Prefer `scripts/run_direct_archive.py`, which calls the official Yunxiao MCP directly with the DFHIS Setup `YUNXIAO_ACCESS_TOKEN`; use HIS MCP only as a legacy fallback.

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
- Required Yunxiao MCP/OpenAPI tools for direct archive and post-push completion: `get_current_organization_info`, `get_current_user`, `get_work_item`, `list_workitem_attachments`, `get_workitem_file`, `list_work_item_comments`, `create_work_item_comment`, `get_work_item_type_field_config`, `get_work_item_workflow`, `update_work_item`
- Optional legacy HIS MCP tools: `dfhis_agent_chat`, `download_yunxiao_archive`, `comment_yunxiao_workitem`, `git_inspect`

Do not store MCP bearer tokens, SSH passwords, Yunxiao access tokens, model API keys, Jenkins passwords, or DingTalk webhook secrets in this skill. Prefer credentials already saved by DFHIS Setup. For one-off shell usage, pass `YUNXIAO_ACCESS_TOKEN` through the current process environment only.

## Archive Workflow

1. Extract Yunxiao work-item targets from the user request. Accept `DFHIS-12345` style IDs and `devops.aliyun.com` work-item links.
2. Preserve any explicit save directory from the user request. If none is provided, use DFHIS Setup `archiveWorkspacePath` / `YUNXIAO_ARCHIVE_WORKSPACE` and create `{archiveWorkspacePath}/{需求编号}` locally.
3. Run `scripts/run_direct_archive.py DFHIS-12345 --json` from this skill. It creates the local requirement directory directly from official Yunxiao MCP evidence, without HIS MCP, Bot Manager, SSH, or server-side downloads.
4. Use the generated local archive in `{archiveWorkspacePath}/{需求编号}` or the explicit `--output-dir`. This directory must contain `raw.json`, `requirement.md`, `description.md`, `context.txt`, `analysis_input.md`, `analysis.md`, `attachments_manifest.json`, and any downloaded files under `attachments/`.
5. Use `scripts/run_mcp_archive.py` and `scripts/download_mcp_archive.py` only as legacy fallback when direct Yunxiao MCP is unavailable but HIS MCP credentials are configured.
6. Generate `{需求编号}/PRD_AND_CODE_ANALYSIS.md` by combining the downloaded archive, attachment manifest, parent requirements, and local code evidence from the selected project workspace. This document is required for any view/analyze/fix workflow, not only when code is changed.
7. Return a concise chat summary and link to `PRD_AND_CODE_ANALYSIS.md`. Do not rely on chat-only analysis as the durable handoff.
8. If the direct script reports another failure, include the exact error and the target DFHIS id. Do not invent archive files that were not returned.

Use `scripts/run_archive.py` only as a legacy fallback when the user explicitly allows direct SSH access to the Bot Manager host.

## Direct Script Usage

Run these commands from this installed skill directory. Use `python3` on macOS/Linux, `python` when it points to Python 3, or `py -3` on Windows.

Archive a work item directly through the official Yunxiao MCP:

```bash
python3 scripts/run_direct_archive.py DFHIS-12345
```

Archive to an explicit local directory:

```bash
python3 scripts/run_direct_archive.py DFHIS-12345 \
  --output-dir /path/to/yunxiao/DFHIS-12345
```

Skip large attachment downloads when only text evidence is needed:

```bash
python3 scripts/run_direct_archive.py DFHIS-12345 --no-attachments
```

Comment on the Yunxiao work item after pushing code:

```bash
python3 scripts/comment_yunxiao.py DFHIS-12345 \
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

- `run_direct_archive.py` reads `YUNXIAO_ACCESS_TOKEN`, `YUNXIAO_MCP_URL`, and `YUNXIAO_ARCHIVE_WORKSPACE` from the environment first, then falls back to Orca's local `dfhis-environment.json`.
- `--output-dir` may be either an archive root or the exact requirement directory. If omitted, the script writes to `{YUNXIAO_ARCHIVE_WORKSPACE}/{需求编号}`.
- `--mcp-url` defaults to the official Yunxiao MCP URL with `organization-management,project-management` toolsets.
- `--timeout` controls each HTTP/tool request timeout. Use a larger value for work items with many attachments.
- `--json` prints a machine-readable wrapper with `work_item_id`, `output_dir`, `rows`, and `message`.
- `run_mcp_archive.py`, `download_mcp_archive.py`, and `comment_mcp_yunxiao.py` remain available for legacy HIS MCP fallback only.
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

1. Archive or reuse the existing local archive with `scripts/run_direct_archive.py`.
2. Inspect the local archive before code changes. Required evidence files are `raw.json`, `requirement.md`, `description.md`, `context.txt`, `analysis_input.md`, `analysis.md`, and `attachments_manifest.json`. If core evidence is missing, rerun direct archive; only use `download_mcp_archive.py --wait-complete --require-complete` as a HIS MCP fallback.
3. Use the local archive facts and local code search to identify affected repositories, modules, file paths, rg keywords, and whether backend/database changes are required.
4. Cross-check with read-only evidence. Use local `rg` against the selected Orca code workspace, including project names, routes, service endpoint paths, Feign client names, controller names, and package names because service names and repository directories can differ. Use HIS MCP `git_inspect` only as optional fallback. Do not use SSH shell access to `192.168.1.10` as a required step.
5. Generate or update `{需求编号}/PRD_AND_CODE_ANALYSIS.md` from the required template before editing code. The document must include the final planned file/module changes and known gaps.
6. Resolve the Git remote URL for each target repository from the local selected code workspace first. Use HIS MCP only as an optional fallback for missing remote metadata. Do not copy repositories from `/opt/workspace/df-his/df-knowledge` with `rsync`, `scp`, or server filesystem access.
7. Clone or update only the target repository on the local machine using local Git credentials. Use `scripts/prepare_local_worktree.py` to run `git clone`, `git fetch`, and `git worktree add`. Put requirement-specific code worktrees under `{需求目录}/code/{repo-name}` so requirement evidence and code stay together. Branch naming is based on Yunxiao work-item type: defects/bugs use `hotfix-DFHIS-12345`; requirements/features use `feature-DFHIS-12345`. If the type is unknown, inspect `raw.json`/`requirement.md` first instead of guessing.
8. Before every code edit, run `scripts/guard_code_edit.py --requirement-dir {需求目录} {待编辑文件...}` and confirm it prints `ok`. This is mandatory even when the target file path looks obvious. The guard must validate that each edited path is under `{需求目录}/code/<repo>` and that the branch is `feature-DFHIS-12345` or `hotfix-DFHIS-12345`; if it fails, fix the worktree setup first and do not edit the original workspace.
9. Implement the smallest code change that matches the evidence and the handoff document. Do not modify unrelated repositories or formatting.
10. Verify locally. Prefer `lint`, `build`, or syntax checks from the repo scripts. If private dependencies block verification, record the exact blocker in both the chat summary and the handoff document.
11. Commit and push the branch from the local machine. Do not upload patches to `192.168.1.10` for server-side pushing.
12. After every successful push, comment on the Yunxiao work item with `scripts/comment_yunxiao.py`. The comment must include repository, branch, commit id, changed files, concise fix summary, validation result, handoff document path, and any dependency/test blockers. If commenting fails, treat the workflow as incomplete and report the exact failure.
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
python3 scripts/comment_yunxiao.py DFHIS-12345 \
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

## Expected Archive Output

The direct archive should generate:

- `raw.json`
- `requirement.md`
- `description.md`
- `context.txt`
- `attachments_raw.json` when ordinary attachment listing succeeds
- `attachments_manifest.json`
- `original_requirements.json`
- `analysis_input.md`
- `analysis.md`
- `comments_raw.json` when comments are readable
- downloaded files under `attachments/`

The final Markdown must report archive status, target directory, file list, attachment counts, and failed downloads.

## Legacy HIS MCP Download

Use this only when direct Yunxiao MCP is unavailable and HIS MCP credentials are configured. The HIS MCP server should expose `download_yunxiao_archive`; the tool is read-only, restricted to `/opt/workspace/df-his/yunxiao`, and returns a zip as base64 chunks with `zip_sha256` for local verification.

The downloader reports `archive_quality`:

- `complete`: core evidence files exist (`raw.json`, `requirement.md`, `description.md`, `context.txt`, `analysis.md`, `attachments_manifest.json`).
- `minimal`: only generated requirement/analysis/description text is present. This is useful for triage but not enough for confident code changes when screenshots or comments are expected.
- `incomplete`: missing even core generated documents; stop and report the failure.

Default local archive layout:

```text
./DFHIS-12345/
├── requirement.md
├── context.txt
├── analysis.md
├── analysis_input.md
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
- If Yunxiao MCP authentication fails, ask for a current Yunxiao access token. Do not write the token into files.
- If direct archive fails because `get_work_item`, `list_workitem_attachments`, `get_workitem_file`, or `list_work_item_comments` is unavailable, ask an administrator to enable the official Yunxiao project-management toolset. Use HIS MCP fallback only when its credentials are already configured.
- If `run_direct_archive.py` generates missing or incomplete core files, do not proceed to code changes unless the user explicitly accepts the evidence gap. Ask for the missing Yunxiao details, screenshots, comments, or an API/auth fix.
- If tooling identifies only a server filesystem path and no Git remote URL, derive the remote from an already-local Git clone or ask the user for the remote. Do not fall back to server filesystem copying.
- If `comment_yunxiao.py` fails or `create_work_item_comment` is unavailable, treat the workflow as incomplete and report the exact failure. Do not silently skip the Yunxiao comment.
- If Yunxiao MCP/OpenAPI lacks `update_work_item`, `get_work_item`, `get_work_item_type_field_config`, or `get_work_item_workflow`, ask an administrator to enable the project-management toolset. Do not mark a pushed requirement complete until structured Yunxiao fields have been updated and verified.
- If local Git push fails with host key verification, use a workspace-local `known_hosts` file with `GIT_SSH_COMMAND`; do not require server-side pushing.
- If legacy HIS MCP expert routing is needed and the expert id changes, rerun `run_mcp_archive.py --check`; the legacy script can fall back to looking up the expert by name.
