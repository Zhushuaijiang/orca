---
name: yunxiao-requirement-archiver
description: Archive, analyze, locate code for, implement, verify, or deliver Aliyun Yunxiao/DFHIS work items with Orca's direct Yunxiao scripts. Use for DFHIS IDs, devops.aliyun.com/projex links, Yunxiao requirements/bugs/attachments, requirement code fixes, or Yunxiao completion writeback.
---

# Yunxiao Requirement Archiver

Keep context bounded. Run deterministic scripts first, retrieve only relevant evidence, and load one stage reference at a time. Never load every archive file, fact card, repository, or reference into the prompt.

## Intake

1. In the first visible update, include `Orca Yunxiao requirement workflow gate` and the DFHIS id.
2. Run `python3 scripts/run_direct_archive.py DFHIS-12345 --json`. It reads DFHIS Setup credentials and writes `{archiveWorkspacePath}/{id}`. Use `run_mcp_archive.py` only if direct Yunxiao MCP is unavailable and legacy HIS MCP is configured.
3. Read the compact requirement text, comments, attachment manifest, relevant attachments, and parent `ORIGIN-*` evidence. Do not dump `raw.json` or unrelated files into context.
4. Create/update `PRD_AND_CODE_ANALYSIS.md` from `templates/prd_code_analysis.md`. Put this contract first:

```yaml
status: needs_clarification | ready_to_build | missing_repo | blocked | ready_to_verify
owner: product | development | qa | agent | external
next_action: one concrete action
intent: one sentence business outcome
blocking_questions: []
```

Ask only questions that materially change behavior, acceptance, rollout, data, API, or UI. Record answers in the decision ledger. Stop before edits only when a blocking decision is genuinely unresolved.

For every PRD, immediately after the compact contract write a concise **“需求意图与最终诉求”** section before source evidence, code analysis, or detailed questions. It must state: the underlying business problem (not feature names), the final business outcome, the value to the primary roles, and the end-to-end closure standard. For a complex parent requirement, add at most five product decision questions with recommended options and business consequences; keep only 1-3 implementation blockers in the Contract, and place detailed questions in a collapsed appendix or the relevant child requirement.

## Locate Before Reading

Use the multi-project knowledge/code-graph route when available:

```text
requirement text → project-aware knowledge/history hits → candidate repos/symbols/tables
→ project code graph → focused current-code search → exact files and call chain
```

Treat index hits as candidates, not current truth. Query `project-index.mjs search` with the detected project id and requirement terms before broad search. It uses the runtime-generated manifest and must never embed a developer's absolute code path. Validate all claims against the selected code root. For legacy HIS-only environments, fall back to `his-fact-index.mjs` and `his-code-index.mjs`. Resolve the active code root in this order: `YUNXIAO_CODE_WORKSPACE_ROOT`, the selected project entry, then `YUNXIAO_DEFAULT_CODE_ROOT`.

Search only candidate repositories first. Expand globally only when the top candidates fail and record why. For UI work, prove the rendered owner using route/menu, iframe or micro-frontend registration, component imports, aliases, and screenshot text; a shell repository is not automatically the page owner.

When business semantics remain uncertain after archive and code evidence, use the HIS MCP expert. This is mandatory for clinical ordering/category semantics, rule-engine metadata, dictionaries/tenant parameters, or ambiguous cross-station ownership. Save the conclusion as `business` evidence.

## Risk And Model Routing

- Routine, well-specified, one- or multi-repository changes: one capable builder plus deterministic local verification.
- Focused review: unresolved design choice, UI/workflow change, API/database impact, evidence conflict, weak verification, or explicit review request.
- Four-role independent review (`prd_gate`, `architecture`, `implementation`, `verifier`): only compound high-risk work, such as ambiguous UI workflow plus conflicting evidence, or API/database/release impact plus weak verification. Multi-repository scope alone is not sufficient.
- Use a fast/low-cost capable model for archive parsing, search, implementation, builds, Git, and writeback. Reserve the strongest model for ambiguous root cause, architecture, clinical semantics, or final high-risk review.

Do not poll background tasks; completion notifications are automatic. Batch related document edits. Continue the same requirement session only while its context remains bounded; after compaction or large logs, start a focused continuation that references the current contract/evidence rather than the full transcript.

## Code And Delivery

Before code changes, read [delivery-workflow.md](references/delivery-workflow.md). It contains the isolated-worktree, edit guard, tests, commit, push, attachment, comment, and structured-field rules.

Hard constraints:

- Never edit the selected/original code root. Prepare `{requirement_dir}/code/<repo>` with `prepare_local_worktree.py`, then run `guard_code_edit.py` immediately before edits.
- Do not solve requirements by changing build/lock files, enabling local project dependencies, or only changing deprecated project-local `*-api`/DTO/Req/Feign contracts. Contract changes start in shared `df-his-api` with a release and consumer compile plan; otherwise mark the contract blocked.
- Add focused tests for changed behavior and run the repository's correct runtime/build. A build does not replace tests.
- A material edit invalidates earlier build/runtime/screenshot/review evidence; refresh affected evidence from the final diff.

For general HIS runtime selection and validation, use `his-workflow-harness`. For YGT use its harness. For frontend/UI acceptance, read [verification-and-evidence.md](references/verification-and-evidence.md). If environment access blocks that workflow, then read [access-and-runtime-unblocking.md](references/access-and-runtime-unblocking.md).

## Completion

After successful push, complete all applicable actions from `delivery-workflow.md`: upload SQL/screenshots, post the Yunxiao comment, update structured client/server/data fields, move to `开发测试`, and read back verification. Existing field values must be preserved; use append flags for incremental delivery. For the `开发测试` handoff, assignment follows `yunxiao-contacts` as the single source of truth: choose one developer and write that same user as `assignedTo` and the only `participants` entry; remove stale or automatically added participants and fail read-back if the count or identity does not match.

Return a concise Chinese summary with repositories, branches, commits, tests/build/runtime/UI evidence, attachment/comment/writeback results, contract status, and remaining owner. Do not claim completion from code reading, `git diff --check`, or an unverified reviewer opinion.

## Failures

Report the exact failing operation and DFHIS id. Never expose credentials. Do not invent missing evidence, guess a repository, copy server worktrees, or silently skip Yunxiao writeback. Keep verified partial progress and assign the remaining action to a concrete owner.
