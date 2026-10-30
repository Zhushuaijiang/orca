---
name: requirement-delivery-flow
description: Controlled, evidence-driven workflow for carrying a complex requirement from intake to delivery. Use when a requirement involves external system integration, multi-module codebase investigation, black-box API reverse engineering, or needs structured verification before handoff. Provides gate-based phase control, parallel sub-agent exploration strategy, Requirement Contract state machine, and honest evidence classification.
---

# Requirement Delivery Flow

Universal methodology for taking a complex requirement from intake to verified delivery. Not tied to any specific product, platform, or language. Use as a cross-cutting overlay on domain-specific skills (e.g. yunxiao-requirement-archiver, his-workflow-harness).

复杂需求开始拆解、合并或提测前读取 [质量契约与技能分工](references/quality-contract.md)。此文档统一阶段完成条件；具体领域规则仍归领域技能。

## When to Apply

- Requirement touches multiple modules, services, or repositories.
- External/third-party API integration with incomplete documentation.
- The codebase is large and you need to locate relevant code before editing.
- You must deliver not just code but structured evidence and status updates.
- Any requirement where "guessing" the architecture could cause rework.

For single-file bug fixes or trivial changes, skip this skill — it adds overhead without value.

## Phase 1: Intake — Evidence Archival

Goal: capture the requirement's ground truth before any analysis.

1. **Archive raw materials**: requirement text, attachments, linked documents, screenshots. Store under `{workspace}/{requirement-id}/`.
2. **Extract binary attachments**: PDFs, Word docs, images — extract text with `pdfplumber`/`python-docx`/vision tools. Never analyze a requirement whose key evidence is locked in a binary you haven't read.
3. **Identify the authoritative source**: if the requirement references a parent spec, contract, or external standard, trace to the original and read it fully.
4. Read the evidence needed for the affected behavior before dependent coding. Missing material does not block independent investigation or planning; record what remains unknown.

## Phase 2: Analysis — Parallel Codebase Investigation

Goal: understand the relevant code and its consumers. Default to one agent; use permitted delegation only when independent investigation materially helps.

### Parallel Exploration Strategy

When delegation is warranted and authorized, give each investigation a specific scope:

- ❌ Bad: "Look at how the plugin system works"
- ✅ Good: "Search `df-web-yewugymk` for: anchor point registration (`maoDianEnum`), plugin SDK method signatures (`DfApp.plugin.*`), iframe sandbox setup. Report: (1) how anchors map to plugins, (2) what SDK methods are available, (3) parameter passing mechanism."

Rules:

- Do not create agents merely to satisfy a fixed count. Independent review does not replace runtime verification.
- Each sub-agent should cover one repo, one subsystem, or one concern.
- Sub-agents are **explore-only** — they read and analyze, never modify files.
- Main agent synthesizes sub-agent reports into decisions, not pass-through.

### Analysis Output

Produce a structured analysis document covering:

- Current state: what already exists that can be reused.
- Gap analysis: what's missing that must be built.
- Risk profile: external dependencies, crypto/format compatibility, network reachability, multi-repo coordination.
- **Blocking questions**, only if unresolved: questions whose answers materially change business behavior. Reuse existing decisions; routine implementation choices remain autonomous.

## Runtime-Evidence-First Diagnosis for UI/Rendering Defects

When the reported symptom is "page blank", "white screen", "component won't load", or similar rendering failure, static code analysis alone is **insufficient** to identify root cause. Follow this protocol before writing any fix:

1. **Capture runtime errors before diagnosing.** Use available browser, logs, or focused E2E to collect console errors first; ask the user only for evidence you cannot obtain. Do not propose a fix based solely on code reading — common blank-screen root causes (circular imports, missing modules, registration failures) are visible only at runtime.
2. **Lock the reproduction environment.** Verify from the request and available evidence: (a) repository/sub-application, (b) branch/tag, (c) URL path. Ask only for unresolved identity; do not assume — wrong branch or wrong repo wastes an entire fix cycle.
3. **After a failed fix, go back to evidence — do not guess again.** If a fix is deployed and the user reports the problem persists: re-capture console errors from the current state, verify the deployment actually contains the fix (read config/package hashes), then base the next diagnosis on new runtime evidence.
4. **No more than one hypothesis without fresh runtime evidence.** If you've made one fix based on a hypothesis and it failed, the next step must produce new runtime evidence, not a new guess. Multi-agent code review does not substitute for runtime evidence.

Measured impact: one session (DFHIS-31796) spent 8 days and 6 failed fix rounds because the agent kept diagnosing from static analysis instead of requesting browser console errors. The actual root cause (circular import) was identifiable only from the runtime module loading error.

## Phase 3: Clarification — Blocking Decision Gate

Goal: resolve all architecture-level unknowns before writing code.

Use `AskUserQuestion` or equivalent structured flow:

- Present 1-3 questions, each with a recommended option and impact description.
- **Listen for user-proposed alternatives** — users often know a simpler path (e.g., "use a dynamic script instead of modifying Java code"). Evaluate seriously before pushing back.
- Record every decision in a **decision ledger** with rationale.
- Update the Requirement Contract status from `needs_clarification` → `ready_to_build`.

### Requirement Contract (State Machine)

合同模板、生命周期与高风险独立评审触发条件以 `requirement-contract-gate` 为更完整版本；本节只保留交付流程所需的最小状态机。

Track requirement status with a YAML frontmatter block:

```yaml
status: needs_clarification | ready_to_build | blocked | ready_to_verify | delivered
intent: 'One sentence: the user outcome this requirement achieves.'
decisions:
  - id: D1
    decision: 'Concrete architecture/implementation choice'
    source: 'user | agent | code-evidence'
blocking_questions:
  - id: Q1
    question: 'Specific decision question'
    options:
      - label: 'Recommended option'
        impact: 'What this choice means for implementation'
    why_blocking: 'Why implementation diverges without this answer'
```

Rules:

- Do not implement behavior dependent on unresolved business decisions; continue independent work. Existing user decisions remain valid until changed.
- A decision change affecting behavior, data, or workflow creates a new contract revision. Invalidate affected evidence and record the impact; preserve unrelated valid evidence.
- Keep the contract compact — details go in the analysis document below it.

## Phase 4: Implementation — Iterative Build

Goal: produce working code with incremental verification.

### Before Writing Code

1. Write an implementation plan (plan mode or markdown) listing every deliverable file, its purpose, and dependencies.
2. Verify key technical assumptions independently before committing to them:
   - Crypto/format compatibility: test with `curl` or a script before writing production code.
   - API reachability: probe the endpoint before assuming it works.
   - Parameter injection: if the target framework has quirks (e.g., form-encoded params auto-injected as variables), verify with a minimal test first.

### During Implementation

- Track progress with `TodoList` — one item per deliverable.
- Mark each item done only when the deliverable is verified, not when the code is written.
- Behavioral changes require meaningful tests of observable outcomes using the actual production entry or implementation. Reuse repository conventions; do not create mirrored logic, placeholder tests, or tests for low-impact prose changes just to meet a count. See the HIS harness for applicable verification.
- If you hit a wall on one deliverable, don't block all progress — continue with independent deliverables and return to the blocker.

### Honest Scoping

- If a step requires an environment you don't have (production network, specific hardware, deployed release), **say so explicitly**. Mark it as "requires deployment-environment verification" rather than claiming success.
- Never dress up a failed test as a passed one.

#### Never report a partially failing command as passing

A command that exits non-zero is a failure, even when the only error is pre-existing and your diff added none. Writing "eslint 0 errors" (or "tests pass") over `exit 1` turns a failed command into a claimed pass and violates the evidence gate — reviewers read the wording, not your intent.

Report exit code + the single failure + its baseline provenance, e.g. `全文件 eslint exit 1（唯一为基线既有 line 221 keyword-spacing）；本次 diff 未新增 lint 违规`. Confirm the provenance before attributing it: `git show <base-sha>:<path>` on the base revision, or a stashed run, then check the line is outside your diff. Do not widen the change just to make the command green when the failure is pre-existing and out of scope.

If a false pass was already published externally (Yunxiao comment, PR body), append a short correction comment and keep its id; do not leave the external record asserting success.

Source: DFHIS-32753 (2026-10-15). The PRD and Yunxiao comment claimed "eslint 改动文件 0 错误" while the command exited 1; the user required the precise wording above and an appended clarification comment.

## Phase 5: Delivery — Structured Evidence and Handoff

Goal: deliver complete evidence, not just code.

### Evidence Classification

Classify every piece of evidence into one of these types:

| Type          | Description                                   | Example                                |
| ------------- | --------------------------------------------- | -------------------------------------- |
| `build`       | Compilation/package success                   | `npm run build` exit 0, Jenkins green  |
| `runtime`     | Endpoint/script executes correctly            | API returns expected response          |
| `screenshot`  | Visual proof of behavior                      | UI shows correct data                  |
| `business`    | Business semantics confirmed by domain expert | SME confirms field meaning             |
| `database`    | Read-only query confirms data state           | `SELECT` returns expected rows         |
| `integration` | External system interaction verified          | Third-party API returns valid response |

Each evidence item must have: what was tested, what was the result, when it was captured. Mark stale evidence as `superseded` after any material code change.

### Delivery Closure

First satisfy the applicable handoff conditions in [quality-contract.md](references/quality-contract.md). Read-only analysis ends with reviewable findings. External comments, uploads, assignments, and status changes below require task authorization; importing this skill alone grants none.

1. **Comment**: write a structured completion comment on the requirement ticket.
2. **Data change first, gate before publishing**: when the requirement ships SQL/parameters/dictionaries/menu scripts, write the script body into the Yunxiao `数据变更` field as plain PostgreSQL DDL/DML (no `begin/commit`, no `do $$`, no stored procedures/functions; assertions become trailing read-only `SELECT`s), then run the gate **before** any comment, attachment or field writeback:

   ```bash
   python3 ~/.agents/skills/dfhis-data-change-sql/scripts/check_data_change.py --file <requirement_dir>/sql/<id>.sql
   python3 ~/.agents/skills/dfhis-data-change-sql/scripts/check_data_change.py --work-item <DFHIS-ID>
   ```

   Non-zero exit blocks delivery. The field cap is 16,000 characters; only an over-length script may fall back to "over the cap + summary + attachment name" with an explanation. Work-item types without a `数据变更` field cannot carry the body there: report the limitation instead of inventing a field, and never let an attachment be the only carrier of the script. Rules live in `dfhis-data-change-sql`.

3. **Other attachments**: upload screenshots and non-SQL deliverables as attachments, not inline text.
4. **Status transition**: update the ticket status (e.g., → "ready for testing") and assign to the next owner.
5. **Reference data**: cache frequently-queried IDs (user IDs, org IDs, project IDs) in a `contacts.md` or similar file within the skill pack to avoid redundant API calls in future sessions.

## Black-Box System Integration Patterns

When integrating with a system that has poor or no documentation:

### 1. Source Code as Truth

- Official docs for forked/customized systems are often wrong. Read the actual source code (JS bundles, decompiled classes, source repos).
- Extract API paths from minified JS: `grep -oP '"/api/[^"]*"' bundle.js`

### 2. Full HTTP Capture

- Never assume how authentication works. Use `curl -v` or HTTP proxy to capture the complete request/response cycle.
- Tokens may come from response **headers**, not response body. Check both.
- Login flows may return dynamic tokens — don't try to compute them with formulas.

### 3. Incremental Verification

- Test each layer independently: crypto → signing → HTTP transport → business logic.
- If one layer fails, isolate it before blaming the whole chain.
- Keep test scripts — they become regression checks.

### 4. Framework Quirks

- Dynamic script engines (MagicAPI, Groovy, etc.) often inject parameters as variables, not via `request.body`.
- POST format matters: `application/json` vs `application/x-www-form-urlencoded` can change behavior entirely.
- Fork behavior: if a system is forked from open source, assume the fork changed things. Verify against the fork, not the original.

### 5. Binary/Encrypted Format Evidence Checks

- Separate four claims: bytes can be decrypted/repacked; authenticity/binding checks pass; the process starts; the requested runtime behavior changes. Prove each separately. A changed file field plus a running service does not prove that field controls runtime behavior; read the effective value after startup and check other persisted sources.
- For a failing hash/checksum, trace both operands from the final comparison back to their real producers. Do not assign a field's role from a struct offset alone; compare the captured value and follow writes. A signed payload, registry value, and ordinary date field are different sources.
- Missing imported symbols or source-file strings do not prove a native program lacks a cryptographic operation. Statically linked wrappers may perform modular arithmetic without the expected library name. Require a call-chain trace and a successful known sample.
- A buffer is not a substitution table merely because a function references it. Compare file/runtime bytes, inspect initialization and read/write references, and require exact known-sample round trips before naming the transform.
- Verify the delivered download bytes as well as an API's embedded payload. If the consumer expects encoded text, decoding that text for download changes the file format even though the underlying ciphertext is correct.
- When new evidence contradicts an earlier completion claim, correct the report, API success wording, and existing memory in place; do not leave incompatible conclusions as equally current.

Source: authorized third-party test-system analysis, 2026-10-22. Independent recomputation identified zero buffers mistaken for cipher tables and a binding hash obtained from RSA decoding rather than the registry. A prior runtime log also showed the original effective counter despite an edited file; the download handler had returned decoded ciphertext instead of the expected base64 file text. No product secrets or credentials belong in this shared lesson.

## Common Pitfalls

| Pitfall                                                                                           | Prevention                                                                                                                               |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Assuming auth token mechanism                                                                     | Capture full HTTP exchange with `-v`; check headers AND body                                                                             |
| Confusing ID systems (memberId vs userId)                                                         | Build a mapping table; verify which ID the target API expects before using it                                                            |
| Browser automation depending on OS permissions                                                    | Prefer API/curl solutions; treat browser automation as last resort                                                                       |
| Claiming "tested" when environment can't reach target                                             | Explicitly state "requires deployment-environment verification"                                                                          |
| Writing "0 errors" over a command that exited non-zero because of a pre-existing baseline failure | Report exit code + the single failure + baseline provenance (`git show <base>:<path>`); see Honest Scoping                               |
| Asking open-ended clarification questions                                                         | Always provide specific multiple-choice options with recommended answer                                                                  |
| Sub-agent prompts too vague                                                                       | List exact search patterns, file paths, and specific questions                                                                           |
| Ignoring user's proposed simpler alternative                                                      | Evaluate the user's suggestion seriously — they know the system                                                                          |
| Single giant verification at the end                                                              | Verify incrementally at each technical milestone                                                                                         |
| Stale evidence after code change                                                                  | Any material edit invalidates prior evidence; re-capture before delivery                                                                 |
| Diagnosing UI blank/white-screen from static code only                                            | Capture browser console errors before proposing any fix; static analysis generates hypotheses, not root causes                           |
| Fixing the wrong branch or wrong sub-application                                                  | Verify exact branch + repo + URL from current evidence; ask only if unresolved                                                           |
| Guessing a new root cause after a failed fix                                                      | Re-capture runtime evidence (console errors, deployed package check) before next hypothesis; no guessing loops                           |
| Treating "passed with non-blocking limitation: no runtime verification" as safe to release        | Missing required runtime/UI verification blocks ready-for-test claims; an authorized draft/code backup may proceed with the gap explicit |

## Delivery vs. Final Acceptance

Keep these separate:

- **Delivered**: code written, evidence captured, ticket transitioned to testing. The authorized development handoff is complete; retain any explicit remaining obligations.
- **Accepted**: business confirms the requirement works in production after release. This happens later and may depend on deployment.

Do not block delivery waiting for final acceptance unless the user explicitly asks for production verification. Update the ticket status honestly and state "delivered, final acceptance pending release validation" when appropriate.
