import { describe, expect, it } from 'vitest'
import {
  canWriteRequirementDeepeningBatch,
  exceedsRequirementDeepeningBatchLimit,
  REQUIREMENT_DEEPENING_BATCH_LIMIT,
  createRequirementDeepeningBatchEntries,
  isRequirementDeepeningBatchSettled,
  summarizeRequirementDeepeningBatch,
  updateRequirementDeepeningBatchEntry,
  type RequirementDeepeningBatchEntry
} from './requirement-deepening-batch'

const sources = [
  { id: '1', serialNumber: 'DFHIS-1', title: '退费状态' },
  { id: '2', serialNumber: null, title: '无编号条目' }
]

function entry(overrides: Partial<RequirementDeepeningBatchEntry>): RequirementDeepeningBatchEntry {
  return {
    workItemId: 'DFHIS-1',
    title: 't',
    status: 'pending',
    original: '',
    rewritten: '',
    gaps: '',
    growthRatio: 0,
    error: '',
    ...overrides
  }
}

describe('createRequirementDeepeningBatchEntries', () => {
  it('prefers the serial number and starts every entry pending', () => {
    const entries = createRequirementDeepeningBatchEntries(sources)
    expect(entries.map((item) => item.workItemId)).toEqual(['DFHIS-1', '2'])
    expect(entries.every((item) => item.status === 'pending')).toBe(true)
  })
})

describe('updateRequirementDeepeningBatchEntry', () => {
  it('patches only the matching entry and keeps the rest untouched', () => {
    const entries = createRequirementDeepeningBatchEntries(sources)
    const next = updateRequirementDeepeningBatchEntry(entries, 'DFHIS-1', {
      status: 'ready',
      rewritten: '新稿'
    })
    expect(next[0]?.status).toBe('ready')
    expect(next[1]).toBe(entries[1])
    expect(entries[0]?.status).toBe('pending')
  })

  it('ignores an unknown work item id', () => {
    const entries = createRequirementDeepeningBatchEntries(sources)
    expect(updateRequirementDeepeningBatchEntry(entries, 'missing', { status: 'failed' })).toEqual(
      entries
    )
  })
})

describe('summarizeRequirementDeepeningBatch', () => {
  it('counts statuses and averages growth across rewrites only', () => {
    const summary = summarizeRequirementDeepeningBatch([
      entry({
        workItemId: 'a',
        status: 'ready',
        rewritten: 'x',
        growthRatio: 0.8,
        gaps: '待取证：日志'
      }),
      entry({ workItemId: 'b', status: 'written', rewritten: 'y', growthRatio: 1.2, gaps: '无' }),
      entry({ workItemId: 'c', status: 'skipped' }),
      entry({ workItemId: 'd', status: 'failed', error: 'boom' }),
      entry({ workItemId: 'e', status: 'loading' })
    ])
    expect(summary.total).toBe(5)
    expect(summary.ready).toBe(1)
    expect(summary.written).toBe(1)
    expect(summary.skipped).toBe(1)
    expect(summary.failed).toBe(1)
    expect(summary.pending).toBe(1)
    expect(summary.averageGrowthRatio).toBeCloseTo(1)
    expect(summary.withGaps).toBe(1)
  })

  it('reports zero growth when nothing was rewritten', () => {
    const summary = summarizeRequirementDeepeningBatch([entry({ status: 'skipped' })])
    expect(summary.averageGrowthRatio).toBe(0)
    expect(summary.withGaps).toBe(0)
  })
})

describe('batch gates', () => {
  it('is settled only when no entry is pending or loading', () => {
    expect(isRequirementDeepeningBatchSettled([entry({ status: 'ready' })])).toBe(true)
    expect(isRequirementDeepeningBatchSettled([entry({ status: 'loading' })])).toBe(false)
    expect(isRequirementDeepeningBatchSettled([])).toBe(true)
  })

  it('caps how many work items one batch may start', () => {
    expect(exceedsRequirementDeepeningBatchLimit(REQUIREMENT_DEEPENING_BATCH_LIMIT)).toBe(false)
    expect(exceedsRequirementDeepeningBatchLimit(REQUIREMENT_DEEPENING_BATCH_LIMIT + 1)).toBe(true)
  })

  it('can write only when something is ready', () => {
    expect(canWriteRequirementDeepeningBatch([entry({ status: 'ready' })])).toBe(true)
    expect(canWriteRequirementDeepeningBatch([entry({ status: 'written' })])).toBe(false)
  })
})
