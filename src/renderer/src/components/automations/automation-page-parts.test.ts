import { describe, expect, it } from 'vitest'
import type { AutomationRun } from '../../../../shared/automations-types'
import { getAutomationRunStatusLabel } from './automation-page-parts'

describe('automation page parts', () => {
  it('labels empty Yunxiao todo pool skips as no actionable items', () => {
    const run = {
      error: 'No matching actionable Yunxiao todo pool items are available.'
    } satisfies Pick<AutomationRun, 'error'>

    expect(getAutomationRunStatusLabel('skipped_precheck', run)).toBe('No actionable items')
  })

  it('labels legacy empty Yunxiao todo pool skips as no actionable items', () => {
    const run = {
      error: 'No matching Yunxiao todo pool items are queued.'
    } satisfies Pick<AutomationRun, 'error'>

    expect(getAutomationRunStatusLabel('skipped_precheck', run)).toBe('No actionable items')
  })

  it('keeps generic precheck skips distinct from empty queue skips', () => {
    const run = {
      error: 'Precheck exited with code 1.'
    } satisfies Pick<AutomationRun, 'error'>

    expect(getAutomationRunStatusLabel('skipped_precheck', run)).toBe('Precheck skipped')
    expect(getAutomationRunStatusLabel('skipped_precheck')).toBe('Precheck skipped')
  })
})
