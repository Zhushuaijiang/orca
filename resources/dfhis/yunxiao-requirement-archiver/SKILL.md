---
name: yunxiao-requirement-archiver
description: Archive Aliyun Yunxiao / DFHIS work-item requirements and drive Yunxiao-linked code workflows by using Orca's direct Yunxiao archive scripts. Use when the user asks to archive, download, capture, save, analyze, locate repositories for, or fix Yunxiao requirements, defects, DFHIS IDs, Yunxiao links, manually pasted Yunxiao requirement URLs, requirement descriptions, raw JSON, context, attachments, or related code changes.
---

# Yunxiao Requirement Archiver

## Overview

Use this skill to run the Orca-local version of Bot Manager expert `云效需求归档专家` (`builtin_key=yunxiao_requirement_archiver`). Prefer `scripts/run_direct_archive.py`, which calls the official Yunxiao MCP directly with the DFHIS Setup `YUNXIAO_ACCESS_TOKEN`; use HIS MCP only as a legacy fallback.

When this skill triggers from any raw `DFHIS-12345` text or `devops.aliyun.com/projex` URL, including a manually pasted prompt outside the todo pool, treat the session as an Orca Yunxiao requirement workflow. The first user-visible progress message must include the exact marker `Orca Yunxiao requirement workflow gate` and the target DFHIS id so the transcript is auditable across new sessions.

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
- UI/module ownership rule: the task-page repository, work-item service name, or product label is only a starting hint. Before planning or editing UI code, prove the runtime owner of the affected page/component by tracing routes, menu config, iframe/micro-frontend registration, remote component imports, shared package aliases, and screenshot-visible page names. DFHIS frontends often reuse pages across products and workstation modules; if ownership evidence points to another repository, mark the original repository as caller/container only and add the actual mounted repository to the implementation plan before edits.
- Code edit guardrail: never edit files directly inside the selected/original code workspace such as `YUNXIAO_CODE_WORKSPACE_ROOT`. For every code-fix workflow, create or reuse `{需求目录}/code/<repo>` with `scripts/prepare_local_worktree.py`, then run `scripts/guard_code_edit.py` against the exact target file paths immediately before any file-edit tool call. If the guard fails, do not edit code.
- DFHIS build/API guardrail: do not modify build or dependency files such as `build.gradle`, `settings.gradle`, `pom.xml`, or dependency lock files to solve a requirement. Do not switch published dependencies to `compile project(...)`, do not enable local project API modules, and do not add/modify/rely on project-local `*-api` / API modules, DTOs, Req classes, Feign clients, or client API packages as the only contract change; these project APIs are deprecated and invalid for new requirement work. If an implementation requires API contract, DTO, Req, Feign client, or external API field changes, locate and update the corresponding shared module in `df-his-api` first, and record the API jar/release dependency plus every consuming repository that must compile against it. If a solution appears to require any build/API-module change but the `df-his-api` path or release plan is unclear, mark the Requirement Contract as `needs_clarification` or `blocked` and request architecture/product confirmation before code edits.
- Required local development handoff document: `{当前对话工作目录}/{需求编号}/PRD_AND_CODE_ANALYSIS.md`.
- Required requirement gate: create a concise Requirement Contract before any code edit. If the contract status is `needs_clarification`, ask 1-3 blocking decision questions and stop until answered.
- Required audit marker: for manual prompts, todo-pool items, linked work items, and follow-up checks, record `Orca Yunxiao requirement workflow gate` in both the first visible progress message and the `Methodology Gate` section of `PRD_AND_CODE_ANALYSIS.md`.
- Required Yunxiao MCP/OpenAPI tools for direct archive and post-push completion: `get_current_organization_info`, `get_current_user`, `get_work_item`, `list_workitem_attachments`, `get_workitem_file`, `list_work_item_comments`, `create_work_item_comment`, `create_workitem_attachment`, `get_work_item_type_field_config`, `get_work_item_workflow`, `update_work_item`
- Optional legacy HIS MCP tools: `dfhis_agent_chat`, `download_yunxiao_archive`, `comment_yunxiao_workitem`, `git_inspect`

Do not store MCP bearer tokens, SSH passwords, Yunxiao access tokens, model API keys, Jenkins passwords, or DingTalk webhook secrets in this skill. Prefer credentials already saved by DFHIS Setup. For one-off shell usage, pass `YUNXIAO_ACCESS_TOKEN` through the current process environment only.

## HIS MCP Business Gate

When DFHIS business semantics are not proven by local code or archive evidence, ask the HIS MCP expert before implementing guesses or declaring a blocker. Use `dfhis_agent_chat` when available; if unavailable, record that exact limitation in `PRD_AND_CODE_ANALYSIS.md`.

Mandatory HIS MCP triggers:

- Rule-engine behavior involving `GZ_MOXING`, `GZ_SHUXING`, `GZ_GUIZE`, QLExpress variables, model attributes, prompt text, or rule scope.
- Diagnosis semantics such as 主诊断, `zhenDuanLb`, diagnosis ordering, first-row assumptions, 医保/入院登记诊断 categories, or disease extension flags.
- Dictionary, tenant, and parameter rollout such as `gy_daima`, `gy_daimalb`, `tenantid`, code defaults, site-maintained options, or missing-data compatibility.
- Clinical workflow ownership or cross-station reuse, especially when a page appears under one workstation/module but routes, imports, iframes, or shared components mount another workstation/module's implementation.
- Any case where the agent is about to write “业务不确定”, “缺规则配置口径”, “页面不在当前仓库”, or “只能猜”.

Ask focused questions with current evidence and the proposed implementation. Preserve the conclusion in the decision ledger and as passing `business` verification evidence, then convert the answer into concrete code, SQL, or verification changes.

General guardrails learned from prior work:

- When rule expressions read context properties, verify the required rule metadata tables as well as the expression table; do not assume the expression row alone is enough for runtime loading or UI maintenance.
- Do not take a diagnosis, order, charge, prescription, or document list's first row as the business primary item unless HIS MCP or code evidence proves the ordering contract; prefer explicit category/flag fields and a documented fallback order.
- If a product rule is scoped to a specific category, status, flag, tenant, or workflow phase, model “the scoped item exists” separately when absence should mean “this rule does not apply” rather than “block”.
- Check target table column lengths and uniqueness rules before generating ids for rule/dictionary/parameter SQL; fix ids deterministically and record the fix.

## Requirement Contract Gate

Every archive/analyze/fix workflow must produce the first-view Requirement Contract before implementation:

```yaml
status: needs_clarification | ready_to_build | missing_repo | blocked | ready_to_verify
owner: product | development | qa | agent | external
next_action: One concrete next step.
intent: One sentence describing the business/user outcome.
blocking_questions:
  - id: Q1
    question: Decision question.
    options:
      - label: Recommended concrete option
        impact: What implementation/behavior this chooses.
    why_blocking: Why implementation would diverge without this answer.
```

Rules:

- Put the contract at the top of `PRD_AND_CODE_ANALYSIS.md`; keep detailed implementation maps, acceptance criteria, risks, and evidence below it.
- Treat manual Yunxiao links and DFHIS IDs exactly like todo-pool items. Do not downgrade the workflow because the user pasted the requirement directly into a new chat.
- Ask only questions whose answers change implementation, acceptance criteria, rollout, data/API behavior, or UI workflow. Prefer 1-3 multiple-choice questions with a recommended option and impact.
- Record every answer in the decision ledger before continuing.
- If running interactively, use the native blocking question flow when available; otherwise ask directly in chat and wait. If unattended, write the questions to `PRD_AND_CODE_ANALYSIS.md`, comment/update Yunxiao when possible, mark the todo pool item as `needs-clarification` when a tool is available, include the exact final-output line `Contract status: needs_clarification`, and stop before code edits.
- Apply the Orca Superpowers-style gate: clarify before code, keep the first-view contract compact, record alternatives/design confirmation for focused/mandatory risk, write the implementation plan before edits, then verify with fresh command/screenshot/build/test/artifact evidence before claiming completion.
- Default low-risk work to one builder plus local verification. Escalate to focused review for unresolved decisions, UI/workflow, API/database, requirement conflict, weak verification, or explicit user review requests. Escalate to mandatory independent PRD/architecture/implementation/verifier multi-agent review for multi-repo, permission/release, API/database plus weak verification, or UI/workflow plus requirement conflict cases. Use Orca orchestration or available agent-dispatch tools when available; if independent dispatch is unavailable, state that blocker explicitly and do not mark the requirement safe/complete. Preserve each reviewer verdict in `reviewChecks`; the coordinator decides by evidence, not vote count.
- Completion is blocked while any required reviewer role is missing, blocking questions are unresolved, the implementation plan is missing, or fresh verification evidence is absent.
- When native automation result reporting is available, return structured `yunxiaoRequirementOutcomes` as a per-item array with `itemId`, `poolStatus`, `requirementContract`, and evidence; put `riskProfile`, `reviewChecks`, and `methodologyGate` inside `requirementContract` so Orca can update the todo pool without parsing final text.
- Do not claim completion without fresh evidence from tests, builds, screenshots, or inspected artifacts.

## Delivery State Versus Final Acceptance

Keep delivery progress separate from final business acceptance. Do not turn an expected unpublished state into a user-facing blocker.

- Before code is committed and pushed, deployed UI/static assets are expected not to contain the change. Record this as `implementation_pending_push`, not as package/runtime failure.
- After code is pushed but before frontend/backend release, deployed UI may still be old. Record this as `code_pushed_pending_release_validation`.
- If a deployed app is reachable but its `config.json`, commit id, or bundled JS does not contain the pushed change after release was expected, record `deployed_package_missing_requirement_changes` with asset evidence.
- If code, SQL, attachments, Yunxiao comment, and structured fields are done but post-release UI evidence is missing, update Yunxiao to `待测试` when appropriate and state “交付已流转，最终验收待发布后验证”; do not report the whole workflow as blocked unless the user asked for final production acceptance.
- Never ask the user why a deployed package lacks a change when the branch has not yet been pushed or released. First check local commits, remote branches, Yunxiao fields, and release status.

## Contract Revision And Evidence Invalidation

- Treat any clarification that changes behavior, geometry, data, workflow, runtime entry, or acceptance criteria as a new contract revision. Update the top contract, acceptance checks, risks, and implementation plan before continuing.
- Mark evidence from the superseded contract as `superseded`; do not use an old screenshot, build, or review as proof for the revised behavior.
- Any material edit invalidates the previous build, runtime, screenshot, measurement, and review evidence. Repeat focused self-test, build/runtime refresh, DOM inspection, screenshot, and visual inspection from the final diff before push or Yunxiao closeout.
- For UI acceptance, separate position, width/right edge, row/column alignment, and input-area geometry. Record numeric measurements and the exact selector or visible text used to observe each claim.

## Archive Workflow

1. Extract Yunxiao work-item targets from the user request. Accept `DFHIS-12345` style IDs and `devops.aliyun.com` work-item links.
2. Preserve any explicit save directory from the user request. If none is provided, use DFHIS Setup `archiveWorkspacePath` / `YUNXIAO_ARCHIVE_WORKSPACE` and create `{archiveWorkspacePath}/{需求编号}` locally.
3. Run `scripts/run_direct_archive.py DFHIS-12345 --json` from this skill. It creates the local requirement directory directly from official Yunxiao MCP evidence, without HIS MCP, Bot Manager, SSH, or server-side downloads.
4. Use the generated local archive in `{archiveWorkspacePath}/{需求编号}` or the explicit `--output-dir`. This directory must contain `raw.json`, `requirement.md`, `description.md`, `context.txt`, `analysis_input.md`, `analysis.md`, `attachments_manifest.json`, and any downloaded files under `attachments/`.
5. Use `scripts/run_mcp_archive.py` and `scripts/download_mcp_archive.py` only as legacy fallback when direct Yunxiao MCP is unavailable but HIS MCP credentials are configured.
6. Generate `{需求编号}/PRD_AND_CODE_ANALYSIS.md` by combining the downloaded archive, attachment manifest, parent requirements, and local code evidence from the selected project workspace. Start it with the Requirement Contract. This document is required for any view/analyze/fix workflow, not only when code is changed.
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
- `upload_yunxiao_attachment.py` uploads the exact bytes of a local file as a Yunxiao attachment and verifies by reading `list_workitem_attachments` back. It returns `attachmentId` and an `embedMarkdown` image link for use inside comments. Use it for SQL/data/config scripts and frontend self-test screenshots; do not fake a file name by uploading PRD/comment text.

## Post-Push Yunxiao Completion Harness

After code is pushed, the Yunxiao work item is not complete until both the comment and structured fields are updated and verified.

Use actual changes to decide field values:

- `客户端变更`: frontend/client repository and pushed branch/commit, for example `df-web-bingangl: feature-DFHIS-31703 (0404254)`. Use `无` only when no client/frontend repository changed.
- `服务端变更`: backend/server repository and pushed branch/commit. Use `无` when no backend repository changed.
- `数据变更`: SQL script, migration file, or data patch identifier. Use `无` when no SQL/data/config migration changed.
- `参与者`: preserve existing participants and add the current assignee and current Yunxiao token user. If another developer actually contributed code, pass their user id with `--participant`.
- `状态`: update to `待测试` after code is pushed and the above fields are written.

The completion harness must run after all branch pushes and before the final chat summary. If it fails because Yunxiao MCP credentials, tools, workflow, or field config are unavailable, report the workflow as incomplete with the exact error. Do not silently fall back to a plain comment or browser screenshot.

## Parameter And Data Change Gate

Treat parameter, dictionary, tenant seed, menu, permission, and config-table changes as data changes even when the Java/TypeScript code has a safe default. Examples include `gy_canshu`, `canshuid`, `tenantid`, dictionary rows, menu routes, feature switches, and any user-supplied `INSERT`/`UPDATE`/`DELETE`.

When such a change is present:

- Create a real SQL or data patch file under the changed repository's existing delivery location, preferably `*/src/main/docs/sql/{DFHIS-ID}.sql` when the repo already uses `docs/sql`.
- Put the user-provided SQL in that file verbatim unless syntax or idempotency must be fixed; record any fix as a decision in `PRD_AND_CODE_ANALYSIS.md`.
- Validate the script as far as the environment allows: syntax/text review, `git diff --check`, related compile/build, and exact blocker if no business database is available.
- Run `scripts/upload_yunxiao_attachment.py --requirement-dir {需求目录} --file {SQL文件}` after the branch is pushed, and verify the returned file name and byte size.
- Set Yunxiao `数据变更` to the SQL/data patch path or identifier. Do not use `无`.
- Add the attachment id/file name/size and data-change field value to the Yunxiao comment, the handoff document, and the final summary.

If a parameter/data change is discovered after the work item was already moved to `待测试`, reopen the handoff as a follow-up delivery: update the Requirement Contract, add the SQL/data patch, rerun fresh verification, upload the attachment, update `数据变更`, add a new Yunxiao comment, and only then restate completion.

## Orca Model Relay (Multi-Model Staged Execution)

When the user asks for model relay (`模型接龙`) or staged multi-model execution, drive the requirement through `scripts/orca_yunxiao_relay.py` instead of a single-model session. It creates an Orca orchestration Run, one Task per stage with deps, and pins each stage's worker by launching an agent terminal from the adapter table with an injected dispatch.

Stages run in parallel whenever their deps allow it — the coordinator dispatches every dep-satisfied stage and waits on all in-flight dispatches concurrently. Default topology: `archive_prd → implement → review ∥ verify (speculative overlap) → screenshot → deliver (waits review+verify+screenshot)`. A blocking review verdict aborts immediately and stops in-flight stages; speculative verify evidence is then superseded. Multiple requirements can also run concurrently as separate Runs (the todo-pool use case).

Worker profiles use `cli:model` form, resolved from `YX_RELAY_MODEL_*` env > `relayModels` in `dfhis-environment.json` > DFHIS Setup `relayExecModel` (bare kimi alias, exec role only) > built-in defaults. A bare alias without `cli:` means `kimi:` (backward compatible). DFHIS Setup saves `relayExecModel` / `relayExecApiKey` locally; its Install/repair writes the deepseek provider/model block into kimi `config.toml` when the alias is missing. Roles (user rule 2026-08-04):

- `doc` (archive/analysis/PRD/contract) → `kimi:kimi-code/k3`
- `visual` (screenshots/UI acceptance) → `kimi:kimi-code/k3`; must be image-capable, hard constraint
- `review` (pre-commit independent review) → `kimi:kimi-code/k3`; a blocking verdict aborts the pipeline
- `exec` (implementation, lint/build, git, Yunxiao comment + field writeback) → `kimi:deepseek/deepseek-v4-flash`

Per-CLI differences live in the script's `ADAPTERS` table (code shipped via the skill pack), never in per-CLI user configuration. Verified end-to-end 2026-08-04 (Orca terminal launch → injected dispatch → `worker_done`):

| cli | launch template | probe result |
| --- | --- | --- |
| kimi | `kimi --yolo -m {model}` | PASS (`deepseek/deepseek-v4-flash`) |
| claude | `claude --model {model} --permission-mode bypassPermissions` | PASS (`glm-5.1`) |
| codex | `codex --model {model} -a never -s danger-full-access` | PASS (`k3`); `--full-auto` is rejected by codex-cli ≥ 0.146, do not use it |
| opencode | `opencode -m {model}` | PASS (`deepseek/deepseek-v4-flash`) |

```bash
python3 scripts/orca_yunxiao_relay.py DFHIS-12345                 # full pipeline
python3 scripts/orca_yunxiao_relay.py DFHIS-12345 --from-stage review
python3 scripts/orca_yunxiao_relay.py DFHIS-12345 --stages verify,deliver
python3 scripts/orca_yunxiao_relay.py DFHIS-12345 --dry-run
python3 scripts/orca_yunxiao_relay.py --check --probe             # new-machine bootstrap check
python3 scripts/orca_yunxiao_relay.py --check --fix --api-key sk-...   # add deepseek provider to kimi config
```

Relay operating rules learned from DFHIS-31894 (`{需求目录}/RELAY.md` is the per-requirement ledger):

- Workers must launch with auto-approve (`--yolo` / adapter equivalent); otherwise they stall on tool-approval prompts.
- The deliver stage must run workflow steps 11-14 completely: a Yunxiao comment never replaces `update_yunxiao_completion_fields.py` field writeback and the `待测试` status transition.
- A worker that hits an environmental block (e.g. missing OS permission) reports `worker_done --outcome failed`; dependent tasks stay pending until the coordinator verifies the blockage is real and overrides with `task-update --status completed` (only for stages marked `allow_env_block`, e.g. screenshot).
- `check --wait` output contains `_keepalive` heartbeat lines and replays the oldest unacked delivery; ack each delivery before expecting the next.
- A completed dispatch cannot be `retry-of` restarted; close the stalled terminal so it settles, then start a fresh worker.
- If a task stays `pending` after its deps completed (readiness lag), nudge with `task-update --status ready` and retry `worker-start`.
- Stages hand off through files (archive, `PRD_AND_CODE_ANALYSIS.md`, `RELAY.md`), not shared session memory; worker specs must name the stage's gates explicitly because execution models do not follow the skill's formal gates unprompted.

## DFHIS Frontend Verification Environment

Do not stop at `vue-cli-service: command not found` or missing `node_modules` when the repository can be verified with its locked package manager in an isolated worktree.

For DFHIS frontend repositories:

- Inspect `package.json`, lock files, `.nvmrc`, `.node-version`, and existing scripts before choosing commands. Prefer the lock-file package manager: `yarn.lock` means Yarn, `pnpm-lock.yaml` means pnpm, `package-lock.json` means npm.
- Legacy Vue CLI 3/4 DFHIS frontends with `yarn.lock` usually require Node 18. If `nvm` is available, run `nvm use 18` before `yarn install` and record the exact Node/npm/yarn versions. Do not run verification on the host's default Node 20/22 and then report generic dependency failure.
- When using corepack, prevent package-definition churn: set `COREPACK_ENABLE_AUTO_PIN=0`. If corepack or another tool adds a `packageManager` field, remove that unintended change before continuing and record it as an installation side effect.
- Install only inside `{需求目录}/code/<repo>` or another approved isolated worktree, never in the original selected code root. Use frozen/locked installs such as `corepack yarn install --frozen-lockfile --force`; avoid changing `package.json`, lock files, or dependency definitions to make validation pass.
- After install/build scripts, run `git status --short` and revert only generated side effects you created, such as version stamping in `public/config.json`; leave ignored `node_modules/` or `dist/` as local artifacts.
- If full lint is blocked by unrelated historical files, run focused lint or syntax checks on the requirement's changed/affected files, then run the closest build script. Record both the full-lint blocker and the focused/build evidence in `PRD_AND_CODE_ANALYSIS.md`.

## Frontend Screenshot Self-Test Gate

When any frontend/client code changed, self-test screenshots of the modified page are mandatory delivery evidence, not optional polish. Testers rely on these images; a frontend change delivered with build-only evidence is incomplete.

- Never close a frontend change with "sub-app cannot render locally" as a non-blocking limitation. Stand up the local rendering stack and capture real screenshots; the concrete recipe is in [verification-and-evidence.md](references/verification-and-evidence.md).
- Screenshot the modified business page in each acceptance state (for example collapsed/expanded, before/after values), never only the login page, shell home, or a menu. Inspect every image visually before uploading.
- Store final images under `{需求目录}/evidence/screenshots/` with descriptive names that include the DFHIS id.
- Compress before upload; the Yunxiao MCP rejects large payloads with `HTTP 413 Payload Too Large`:

  ```bash
  sips -Z 1100 -s format jpeg -s formatOptions 45 shot.png --out shot.jpg
  ```

  Use `-Z`; combining `-s pixelsWide` with `-s format` silently produces no file.
- Upload each image with `scripts/upload_yunxiao_attachment.py --requirement-dir {需求目录} --file {截图}`, then embed the returned `embedMarkdown` into a comment posted with `scripts/comment_yunxiao.py` so the images render inline on the work item.
- Record the screenshot attachment ids in `PRD_AND_CODE_ANALYSIS.md` and the final summary. Any later material edit invalidates the images: mark them `superseded` and recapture from the final diff.

## Executable HIS Workflow Gate

For general HIS repositories, run `his-workflow-harness` intake against the isolated requirement worktree before dependency installation, build, database, Jenkins, deployment, or smoke work. Use the returned repository runtime and package manager; do not reuse the host's default Node. YGT repositories must use the YGT harness instead.

Before `ready_to_verify`, set `methodologyGate.requiredEvidenceTypes` and populate matching passing evidence:

- Every frontend/backend build: `runtime` plus `build` or `passing_test` as applicable.
- UI/workflow: `build` and `screenshot`.
- Database/data/config: `database`; keep checks read-only and attach the delivery SQL separately.
- Mandatory HIS MCP business gate: `business`.
- Jenkins/release: `jenkins`, `deployment`, and `smoke` in addition to local build evidence.
- Successful Yunxiao comment, attachment, field update, and read-back: `yunxiao`.

Use `his-workflow-harness full` only when the user requested Jenkins/deployment and the service catalog is unambiguous. Save its report under `{需求目录}/evidence/his-workflow` and copy the report evidence into the Requirement Contract. A missing catalog mapping is a concrete release blocker, not permission to guess a job or environment.

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

- Start with a Requirement Contract. If it is `needs_clarification`, include the blocking questions and do not present the plan as implementation-ready.
- Include source metadata and archive status so the document is auditable.
- Separate confirmed facts from inference. Mark any uncertain rule as `待确认`.
- List every affected frontend/backend repository with branch, remote when available, module purpose, and concrete file paths with line references.
- When locating repositories, search the selected code workspace first by project name, route, endpoint path, Feign client name, package name, controller class, and API module references. Repository directory names may differ from service names, so do not mark a service repository missing until the selected workspace has been checked. Use fallback roots only after recording why the selected workspace was insufficient.
- For UI requirements, add a page/component ownership trace before the implementation plan. Required evidence includes the screenshot page/module name, route/menu entry, component import path, micro-frontend/iframe/container registration, and final repository that owns the rendered component. Do not rely on the current Orca task repo or the work-item service name if the code proves the UI is mounted from another repository. If a repository is only a shell that loads another repo's page, list both roles separately.
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
4. Cross-check with read-only evidence. Use local `rg` against the selected Orca code workspace, including project names, routes, menu keys, component names, screenshot-visible text, service endpoint paths, Feign client names, controller names, and package names because service names and repository directories can differ. For UI pages, trace whether the selected frontend is a shell/container that mounts another repository's page through route config, iframe/micro-frontend registration, shared package aliases, or comments in code. If business ownership or reuse is unclear, ask HIS MCP before deciding the owning repo. Use HIS MCP `git_inspect` only as optional fallback. Do not use SSH shell access to `192.168.1.10` as a required step.
5. Generate or update `{需求编号}/PRD_AND_CODE_ANALYSIS.md` from the required template before editing code. The document must include the Requirement Contract, final planned file/module changes, and known gaps. If the contract is `needs_clarification`, ask/record the blocking questions and stop before cloning or editing code.
6. Resolve the Git remote URL for each target repository from the local selected code workspace first. Use HIS MCP only as an optional fallback for missing remote metadata. Do not copy repositories from `/opt/workspace/df-his/df-knowledge` with `rsync`, `scp`, or server filesystem access.
7. Clone or update only the target repository on the local machine using local Git credentials. Use `scripts/prepare_local_worktree.py` to run `git clone`, `git fetch`, and `git worktree add`. Put requirement-specific code worktrees under `{需求目录}/code/{repo-name}` so requirement evidence and code stay together. Branch naming is based on Yunxiao work-item type: defects/bugs use `hotfix-DFHIS-12345`; requirements/features use `feature-DFHIS-12345`. If the type is unknown, inspect `raw.json`/`requirement.md` first instead of guessing.
8. Before every code edit, run `scripts/guard_code_edit.py --requirement-dir {需求目录} {待编辑文件...}` and confirm it prints `ok`. This is mandatory even when the target file path looks obvious. The guard must validate that each edited path is under `{需求目录}/code/<repo>` and that the branch is `feature-DFHIS-12345` or `hotfix-DFHIS-12345`; if it fails, fix the worktree setup first and do not edit the original workspace.
9. Implement the smallest code change that matches the evidence and the handoff document. Do not modify unrelated repositories or formatting. Do not modify `build.gradle`/`settings.gradle`/`pom.xml`/dependency lock files, switch to `compile project(...)`, or touch project-local `*-api` / API modules as the only contract change. If API contract changes are required, update the matching `df-his-api` module and include API jar/release dependency plus downstream compile verification in the handoff; if that path is unclear, stop and update the contract as `needs_clarification` or `blocked`.
10. Verify locally. Prefer `lint`, `build`, or syntax checks from the repo scripts. For frontend repositories, follow the DFHIS frontend verification environment gate above before declaring dependency/tooling blockers. If private dependencies still block verification after the correct Node/package-manager attempt, record the exact blocker in both the chat summary and the handoff document.
11. Commit and push the branch from the local machine. If this requirement came from an Orca Yunxiao todo pool claim, the git commit message must be exactly the full Yunxiao URL from the claim's `提交信息` or `链接` field, and nothing else. Do not replace it with only `DFHIS-12345`, the title, a summary, or a conventional commit message. Push explicitly to the requirement branch, for example `git push -u origin feature-DFHIS-12345`, then verify `git status -sb` so the local branch tracks the pushed feature/hotfix branch rather than the RC base. Do not upload patches to `192.168.1.10` for server-side pushing.
12. After every successful push, comment on the Yunxiao work item with `scripts/comment_yunxiao.py`. The comment must include repository, branch, commit id, changed files, concise fix summary, validation result, handoff document path, and any dependency/test blockers. When any frontend/client code changed, first capture and upload self-test screenshots of the modified page and embed them in this comment (see Frontend Screenshot Self-Test Gate). If commenting fails, treat the workflow as incomplete and report the exact failure.
13. If a SQL/data/config script changed, upload the exact script file with `scripts/upload_yunxiao_attachment.py` and verify the attachment list before updating structured fields. If upload or verification fails, treat the workflow as incomplete.
14. After the comment and any required attachment upload, run `scripts/update_yunxiao_completion_fields.py` to update structured Yunxiao fields. Set `客户端变更` only for frontend/client repositories that changed, `服务端变更` only for backend/server repositories that changed, and `数据变更` only for SQL/data/config migration scripts that changed; otherwise set the field to `无`. The script must update status to `待测试`, add participants, and verify by reading the work item back. If this field update fails or verification fails, treat the workflow as incomplete and report the exact failure.
15. Report branch name, commit id, pushed remote, Yunxiao comment status/action id, Yunxiao attachment id/status when relevant, Yunxiao field update status, changed files, validation result, local archive path, PRD/code-analysis document path, and any dependency/test blockers.

## DFHIS Micro-Frontend Release Verification

For runtime, UI, workflow, authentication, or deployed-package requirements, read [verification-and-evidence.md](references/verification-and-evidence.md). When a gate is blocked, read [access-and-runtime-unblocking.md](references/access-and-runtime-unblocking.md) before retrying. Use the iterative loop in those references; a successful build or one screenshot is not final UI proof.

When validating a deployed DFHIS frontend, prove which bundle is actually serving the page. Do not rely only on the main shell's default child-app `entry` or on a connection failure to a configured host.

Required checks:

- Check the main shell `config.json`, but treat it as shell evidence only.
- If the user supplies a mounted child-app path such as `/apps/{subAppCode}`, verify that child app directly; DFHIS deployments often expose child apps through nginx paths even when the shell's default `entry` points elsewhere.
- Fetch the child app's `config.json` when present and record branch, commit, build time, and app name.
- Parse the child app HTML for hashed JS/CSS assets, then scan those assets for requirement-specific stable keywords such as DFHIS id, route key, dictionary id, field name, API method, or prompt text.
- Compare deployed commit/asset keywords with pushed branch commits. If the app is reachable but keywords are absent, the evidence is “child app reachable but deployed package lacks this change”.
- If direct child host access fails, retry with explicit no-proxy/direct networking when safe, then test known mounted paths before declaring the child app unavailable.
- Record one of these states in the Requirement Contract: `shell_available_child_unknown`, `child_app_unreachable`, `child_app_available_old_package`, `child_app_contains_change_pending_ui_test`, or `ui_verified_after_release`.

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
git commit -m "https://devops.aliyun.com/projex/bug/DFHIS-12345"
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
