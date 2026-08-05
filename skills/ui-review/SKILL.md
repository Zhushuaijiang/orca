---
name: ui-review
description: Review frontend UI code for layout, table, form, typography, color, button, and modal compliance. Use when reviewing UI changes, verifying visual consistency, checking table columns/alignment, or validating forms/modals before claiming completion.
---

# UI Review

Use this skill when reviewing frontend UI code for visual and structural compliance. It covers general UI review principles applicable to any web frontend (React, Vue, CSS/SCSS).

## Review Workflow

1. **Understand the change scope**: identify which UI elements are affected (layout, tables, forms, modals, typography, colors, buttons).
2. **Run available scanners or checks** for mechanically verifiable rules.
3. **Analyze the remaining rules** that require human judgment:
   - Component structure and styling
   - Layout properties (margins, padding, spacing)
   - Color values and usage
   - Typography and text formatting
   - Alignment and positioning
   - Table configurations
   - Button arrangements
   - Modal dimensions
4. **Identify violations** by comparing code patterns against expected behavior.
5. **Verify with real rendering**: build the project and capture screenshots to confirm the UI matches expectations.

## Key Review Areas

### Layout

- Verify page background, container spacing, and padding are consistent.
- Check border radius conventions (e.g., 4px for cards, 0px for edge containers).

### Tables

- **Column width strategy**: Prefer auto-width adaptation over fixed widths. Do not hardcode widths for most columns; let content determine widths. Only set minimum widths for columns that must not truncate (e.g., critical identifiers).
- **Header truncation**: Always verify table headers are fully displayed. If truncation occurs, restore auto-width first, then adjust critical column widths.
- **Text alignment**: Right-align numeric columns (quantities, amounts, prices); left-align text columns by default.
- **Column order**: Follow business logic and user expectations. Changing column order requires screenshot verification.
- **Spacing**: Verify table internal spacing and spacing between tables matches the design system.

### Forms

- Verify grid/gutter spacing is consistent.
- Check label alignment (right-aligned labels with left-aligned controls, or all left-aligned).
- Verify form controls are properly sized and spaced.

### Typography & Color

- Check text color hierarchy uses the design system's base color with opacity variations.
- Verify line heights match the design system (e.g., 22px for body, 18px for table data).
- Use emphasis formatting (e.g., 【】) for critical identifiers like names, IDs, or item names.

### Buttons & Modals

- Verify button group ordering follows the design system (primary actions at the start/end).
- Check button colors use the design system's functional colors.
- Verify modal dimensions follow the design system (e.g., 90% × 80% for large modals).

## Verification Requirements

- **Build**: The project must build successfully before review.
- **Screenshot**: Capture actual page screenshots after the build to verify visual correctness.
- **Real data**: Use real or representative data when verifying tables and forms.
- **No self-declaration**: Do not claim UI completion based on code inspection or git diff alone; always verify with rendering.

## Reporting

Report findings by category with specific `file:line` references. A non-empty violation list blocks completion.
