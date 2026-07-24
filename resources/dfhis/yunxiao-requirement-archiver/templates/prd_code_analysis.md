# {WORK_ITEM_ID} {TITLE} PRD And Code Analysis

## 1. Document Status

- Work item: `{WORK_ITEM_ID}`
- Yunxiao link:
- Local archive directory:
- Archive quality:
- Archive generated at:
- Document generated at:
- HIS code root:
- Analyst:
- Current conclusion: `可开发 / 需补仓库 / 需补需求 / 阻塞`

## 2. Source Evidence

### 2.1 Yunxiao Metadata

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

### 2.2 Archive Files

List the downloaded files used for this document. Include `raw.json`, `requirement.md`, `context.txt`, `analysis.md`, `attachments_manifest.json`, parent requirement files, and attachment count.

### 2.3 Attachment Evidence

For every screenshot or attachment that affects implementation, record:

| Attachment | Page/Module | Visible Controls/Fields | Confirmed Requirement Facts | Implementation Impact |
| --- | --- | --- | --- | --- |
| `attachments/...` |  |  |  |  |

## 3. Requirement PRD

### 3.1 Background And Problem

Describe the current business problem in product terms. Do not copy raw HTML or long source excerpts.

### 3.2 Goals

- 

### 3.3 Non-Goals

- 

### 3.4 Users And Scenarios

| User Role | Scenario | Entry Point | Expected Result |
| --- | --- | --- | --- |
|  |  |  |  |

### 3.5 Functional Requirements

Use stable requirement ids, for example `FR-001`.

| ID | Requirement | Trigger/Condition | Expected Behavior | Source Evidence |
| --- | --- | --- | --- | --- |
| FR-001 |  |  |  |  |

### 3.6 Compatibility Rules

Document feature flags/parameters and parameter-off behavior. Parameter-off mode must preserve current behavior unless the Yunxiao requirement says otherwise.

### 3.7 Validation And Error Messages

| Rule | Condition | Message | Blocking? | Frontend/Backend Owner |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

### 3.8 State Transitions

Describe business state changes before and after implementation.

| Entity | Current State | Event | Next State | Notes |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 4. Current Code Analysis

### 4.1 Repository Map

| Repository | Local Path | Branch | Remote | Role | Present Locally? |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

### 4.2 Existing Flow

Explain the existing frontend-to-backend flow with concrete evidence.

| Step | Current Behavior | Evidence File:Line | Notes |
| --- | --- | --- | --- |
|  |  |  |  |

### 4.3 Affected Frontend Code

| File | Lines/Function | Current Responsibility | Required Change | Risk |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

### 4.4 Affected Backend Code

| File | Lines/Class/Method | Current Responsibility | Required Change | Risk |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

### 4.5 Database, Parameter, Dictionary, And API Impact

| Type | Name | Current Evidence | Required Change | Migration/Config Notes |
| --- | --- | --- | --- | --- |
| Parameter |  |  |  |  |
| Dictionary |  |  |  |  |
| Table/Column |  |  |  |  |
| API |  |  |  |  |

### 4.6 Missing Or External Repositories

If a referenced service/API implementation is absent from the local code root, list it here with the evidence that proves it is required.

| Missing Component | Evidence | Why Required | Next Action |
| --- | --- | --- | --- |
|  |  |  |  |

## 5. Proposed Implementation Plan

### 5.1 Design Summary

State the chosen approach and why it matches the existing architecture.

### 5.2 Frontend Changes

| Order | File | Change | Dependency |
| --- | --- | --- | --- |
| 1 |  |  |  |

### 5.3 Backend Changes

| Order | File | Change | Dependency |
| --- | --- | --- | --- |
| 1 |  |  |  |

### 5.4 Database/Configuration Changes

Include migration SQL or config records if known. If not known, write the exact table/parameter/dictionary that must be provided and mark as `待确认`.

### 5.5 API Contract

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

## 6. Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-001 |  |  |  |  |

## 7. Test Plan

### 7.1 Developer Verification

- 

### 7.2 QA Regression

| Area | Case | Expected Result |
| --- | --- | --- |
|  |  |  |

### 7.3 Data Setup

- 

## 8. Risks And Open Questions

| ID | Risk/Open Question | Impact | Owner | Required Decision |
| --- | --- | --- | --- | --- |
| Q-001 |  |  |  |  |

## 9. Developer Checklist

- [ ] Confirm archive quality and source evidence.
- [ ] Confirm all impacted repositories exist locally or record missing repositories.
- [ ] Apply database/parameter/dictionary changes.
- [ ] Implement backend changes.
- [ ] Implement frontend changes.
- [ ] Run local verification.
- [ ] Update this document with actual changed files and validation results.
- [ ] Push branch and comment on Yunxiao if code was changed.
