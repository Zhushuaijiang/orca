---
name: ui-spec-review
description: Review HIS frontend code (Vue/React/CSS/SCSS) against the 28 UI specifications — layout background #E9E9EC, 8px spacing, 4px radius, Dx tables, form grid 12px gutter, text color #1A1A1A, line height 22px/18px, button-group alignment, and modal 90%×80% sizing. Use as the UI gate for HIS frontend requirements before claiming completion, or when reviewing tables, forms, modals, colors, typography, buttons, or layout for compliance.
---

# UI Specification Review (HIS 前端)

Review HIS frontend code against the established UI design standards. This spec applies to **HIS 前端代码**（Vue/React、CSS/SCSS），不适用于医共体/YGT。常用于「UI 门禁」：前端需求在宣布完成前，必须先过本规范门禁。

## Review Workflow

1. **Read the UI specifications** from `references/ui-specs.md` to cover all 28 rules.
2. **Run the scanner** for the mechanically checkable rules:

```bash
node scripts/ui-spec-review.mjs --repo /path/to/requirement/code/repo --json
node scripts/ui-spec-review.mjs --repo /path/to/requirement/code/repo --changed-only --json
```

3. **Analyze** the remaining rules that scripts cannot judge (emphasis `【】`, button ordering, table column proportion, scrollbar visibility, modal max sizing):
   - Component structure and styling
   - Layout properties (margins, padding, spacing)
   - Color values and usage
   - Typography and text formatting
   - Alignment and positioning
   - Table configurations
   - Button arrangements
   - Modal dimensions
4. **Identify violations** by comparing code patterns against the specification.
5. **Report findings** by category with specific `file:line` references; a non-empty violation list blocks the gate.

## Specification Categories

- **Layout** (规范 1-5): Background colors, margins, padding, border radius
- **Table Global** (规范 6-10): Spacing, alignment, button positioning
- **Table Data Grid** (规范 11-15): Component type, sizing, scrolling
- **Form** (规范 16-18): Grid system, gutter spacing, label alignment
- **Color** (规范 19-20): Text colors, functional colors
- **Text** (规范 21-23): Line heights, emphasis formatting
- **Button** (规范 24-26): Button group ordering, colors
- **Modal** (规范 27-28): Default and maximum sizing

## Common Violations to Check

| Issue | Spec | Correct Pattern |
|-------|------|-----------------|
| Hardcoded page background not #E9E9EC | #1 | `background: #E9E9EC` |
| Margin/padding not 8px | #2, #3, #4 | `margin: 8px`, `padding: 8px` |
| Border radius not 4px/0px | #5 | `border-radius: 4px` (贴边容器 `0px`) |
| Table spacing not 8px/16px | #6, #7 | `gap: 8px`, `margin-bottom: 16px` |
| Action buttons not right-aligned | #9 | `justify-content: flex-end` |
| Form gutter not 12px | #17 | `gutter: 12` / `gap: 12px` |
| Text color not #1A1A1A | #19 | `color: #1A1A1A` (用透明度区分) |
| Line height not 22px/18px | #21, #22 | `line-height: 22px` (表格区 18px) |
| Missing Dx table | #11 | Use `df-dx-table`（DfDxTable，DevExtreme DataGrid，df-web-bui） |
| Wrong modal size | #27 | `width: 90%`, `height: 80%` |

## Gate Usage (与 his-workflow-harness 配合)

- 在 `his-workflow-harness` 中，对涉及用户可见前端的改动运行 `ui-review` 门禁：

```bash
node /path/to/his-workflow-harness/scripts/his-workflow.mjs ui-review --repo <repo> --json
```

- 或者在需求工作区直接对本技能执行扫描，并把 `report.json` 作为 UI 规范证据写入
  `requirementContract.methodologyGate.verificationEvidence`（evidence type: `ui`）。
- 门禁判定：`violations` 非空 = 门禁不通过；脚本 `status: 'fail'` 时不能宣称前端完成。

## Review Output Format

Organize findings by category with `file:line`:

```
## Layout Issues
- [x] src/views/patient/index.vue:42: background is #FFFFFF, should be #E9E9EC
- [x] src/views/patient/index.vue:45: padding is 16px, should be 8px

## Table Issues
- [x] src/components/order-list.vue:78: not using Dx table component

## Color Issues
- [x] src/styles/table.scss:120: text color hardcoded, should use #1A1A1A with opacity
```

## Resources

- `references/ui-specs.md` — all 28 UI specifications by category. Read when starting a review.
- `scripts/ui-spec-review.mjs` — deterministic scanner for mechanically checkable rules; supports `--repo`, `--changed-only`, `--json`, and `selftest`.
- `agents/ui-spec-review-gate.yaml` — gate agent definition for UI-related gates.

## Safety

- The scanner is read-only: it never edits source files. Run it in the Yunxiao requirement worktree created by `yunxiao-requirement-archiver`.
- After changing this skill, run the selftest:

```bash
node scripts/ui-spec-review.mjs selftest --json
```
