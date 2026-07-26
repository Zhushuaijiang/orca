# {WORK_ITEM_ID} {TITLE} PRD And Code Analysis

## 1. Requirement Contract

- Status: `needs_clarification / ready_to_build / missing_repo / blocked / ready_to_verify`
- Owner: `product / development / qa / agent / external`
- Next action:
- Intent:
- Local archive directory:
- PRD path:
- Evidence updated at:
- Contract updated at:

### 1.1 Blocking Questions

Ask only questions whose answers change implementation, acceptance criteria, rollout, data/API behavior, or UI workflow. Prefer 1-3 options with a recommended choice. If status is `ready_to_build`, write `None` and remove placeholder question rows. If status is `needs_clarification`, include 1-3 blocking questions only.

| ID | Question | Options | Why Blocking | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| None |  |  |  |  |  |

### 1.2 Decision Ledger

Record every answer before continuing. If no decision has been made yet, write `None` and remove placeholder decision rows.

| ID | Decision | Source | Implementation Impact | Decided At |
| --- | --- | --- | --- | --- |
| None |  |  |  |  |

### 1.3 Contract Evidence Summary

- Confirmed:
- Inferred:
- Not confirmed:

### 1.4 Methodology Gate

Use this section to keep the workflow compact but auditable. Default low-risk work to one builder plus local verification. Use focused review for unresolved decisions, UI/workflow, API/database, requirement conflict, weak verification, or explicit review requests. Use mandatory PRD/architecture/implementation/verifier review for multi-repo, permission/release, API/database plus weak verification, or UI/workflow plus requirement conflict cases.

| Gate | Required? | Evidence / Link |
| --- | --- | --- |
| Implementation plan before edits |  |  |
| Test-first or regression evidence |  |  |
| Independent review checks |  |  |
| Final verification evidence |  |  |

### 1.5 Review Checks Snapshot

Record independent reviewer outputs here when focused or mandatory review is required. The coordinator decides by evidence against the contract, not by vote count.

| Role | Verdict | Top Risks | Evidence / Dispatch | Reviewed At |
| --- | --- | --- | --- | --- |
| None |  |  |  |  |

## 2. Document Status

- Work item: `{WORK_ITEM_ID}`
- Yunxiao link:
- Local archive directory:
- Archive quality:
- Archive generated at:
- Document generated at:
- HIS code root:
- Analyst:
- Current conclusion: `可开发 / 需补仓库 / 需补需求 / 阻塞 / 待验证`

## 3. Source Evidence

### 3.1 Yunxiao Metadata

- Project:
- Work item type:
- Status:
- Assignee:
- Creator:
- Sprint:
- Customer:
- System/module:
- Priority:
- Parent requirements:

### 3.2 Archive Files

List the downloaded files used for this document. Include `raw.json`, `requirement.md`, `context.txt`, `analysis.md`, `attachments_manifest.json`, parent requirement files, and attachment count.

### 3.3 Attachment Evidence

For every screenshot or attachment that affects implementation, record:

| Attachment | Page/Module | Visible Controls/Fields | Confirmed Requirement Facts | Implementation Impact |
| --- | --- | --- | --- | --- |
| `attachments/...` |  |  |  |  |

## 4. Requirement PRD

### 4.1 Background And Problem

Describe the current business problem in product terms. Do not copy raw HTML or long source excerpts.

### 4.2 Goals

- 

### 4.3 Non-Goals

- 

### 4.4 Users And Scenarios

| User Role | Scenario | Entry Point | Expected Result |
| --- | --- | --- | --- |
|  |  |  |  |

### 4.5 Functional Requirements

Use stable requirement ids, for example `FR-001`.

| ID | Requirement | Trigger/Condition | Expected Behavior | Source Evidence |
| --- | --- | --- | --- | --- |
| FR-001 |  |  |  |  |

### 4.6 Compatibility Rules

Document feature flags/parameters and parameter-off behavior. Parameter-off mode must preserve current behavior unless the Yunxiao requirement says otherwise.

### 4.7 Validation And Error Messages

| Rule | Condition | Message | Blocking? | Frontend/Backend Owner |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

### 4.8 State Transitions

Describe business state changes before and after implementation.

| Entity | Current State | Event | Next State | Notes |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 5. Current Code Analysis

### 5.1 Repository Map

| Repository | Local Path | Branch | Remote | Role | Present Locally? |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

### 5.2 Existing Flow

Explain the existing frontend-to-backend flow with concrete evidence.

| Step | Current Behavior | Evidence File:Line | Notes |
| --- | --- | --- | --- |
|  |  |  |  |

### 5.3 Affected Frontend Code

| File | Lines/Function | Current Responsibility | Required Change | Risk |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

### 5.4 Affected Backend Code

| File | Lines/Class/Method | Current Responsibility | Required Change | Risk |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

### 5.5 Database, Parameter, Dictionary, And API Impact

| Type | Name | Current Evidence | Required Change | Migration/Config Notes |
| --- | --- | --- | --- | --- |
| Parameter |  |  |  |  |
| Dictionary |  |  |  |  |
| Table/Column |  |  |  |  |
| API |  |  |  |  |

### 5.6 Missing Or External Repositories

If a referenced service/API implementation is absent from the local code root, list it here with the evidence that proves it is required.

| Missing Component | Evidence | Why Required | Next Action |
| --- | --- | --- | --- |
|  |  |  |  |

## 6. Proposed Implementation Plan

### 6.1 Design Summary

State the chosen approach and why it matches the existing architecture.

### 6.1.1 Alternatives And Design Confirmation

Keep this short. For focused/mandatory risk, record the main alternatives before edits and the chosen design confirmation.

| Option | Why Considered | Decision | Reason |
| --- | --- | --- | --- |
|  |  |  |  |

### 6.2 Frontend Changes

| Order | File | Change | Dependency |
| --- | --- | --- | --- |
| 1 |  |  |  |

### 6.3 Backend Changes

| Order | File | Change | Dependency |
| --- | --- | --- | --- |
| 1 |  |  |  |

### 6.4 Database/Configuration Changes

Include migration SQL or config records if known. If not known, write the exact table/parameter/dictionary that must be provided and mark as `待确认`.

### 6.5 API Contract

For every new or changed API:

```text
API:
Method:
Path:
Request:
Response:
Validation:
Error cases:
Backward compatibility:
```

## 7. Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-001 |  |  |  |  |

## 8. Test Plan

### 8.1 Developer Verification

- 

### 8.2 QA Regression

| Area | Case | Expected Result |
| --- | --- | --- |
|  |  |  |

### 8.3 Data Setup

- 

### 8.4 Verification Evidence Records

Do not claim completion without fresh evidence. Prefer command, screenshot, build, test, or inspected artifact records over prose.

| Type | Command / Artifact | Result | Evidence Link / Output Summary | Collected At |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 9. Risks And Open Questions

| ID | Risk/Open Question | Impact | Owner | Required Decision |
| --- | --- | --- | --- | --- |
| Q-001 |  |  |  |  |

## 10. Developer Checklist

- [ ] Confirm archive quality and source evidence.
- [ ] Confirm Requirement Contract status is `ready_to_build` before code edits.
- [ ] Record answers to blocking questions in the decision ledger.
- [ ] Confirm all impacted repositories exist locally or record missing repositories.
- [ ] Apply database/parameter/dictionary changes.
- [ ] Implement backend changes.
- [ ] Implement frontend changes.
- [ ] Run local verification.
- [ ] Update this document with actual changed files and validation results.
- [ ] Push branch and comment on Yunxiao if code was changed.
