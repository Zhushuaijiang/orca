/**
 * Batch state for requirement deepening. Pure so the sequential driver in the dialog
 * stays a thin loop and the summary numbers can be tested without an agent or a ticket.
 */

export const REQUIREMENT_DEEPENING_BATCH_LIMIT = 20

export type RequirementDeepeningBatchStatus =
  | 'pending'
  | 'loading'
  | 'ready'
  | 'written'
  | 'skipped'
  | 'failed'

export type RequirementDeepeningBatchSource = {
  id: string
  serialNumber: string | null
  title: string
}

export type RequirementDeepeningBatchEntry = {
  workItemId: string
  title: string
  status: RequirementDeepeningBatchStatus
  original: string
  rewritten: string
  gaps: string
  growthRatio: number
  error: string
}

export type RequirementDeepeningBatchEntryPatch = Partial<
  Omit<RequirementDeepeningBatchEntry, 'workItemId' | 'title'>
>

export type RequirementDeepeningBatchSummary = {
  total: number
  pending: number
  ready: number
  written: number
  skipped: number
  failed: number
  /** Mean rewrite/original length across entries that produced a rewrite. */
  averageGrowthRatio: number
  withGaps: number
}

export function createRequirementDeepeningBatchEntries(
  items: readonly RequirementDeepeningBatchSource[]
): RequirementDeepeningBatchEntry[] {
  return items.map((item) => ({
    workItemId: item.serialNumber ?? item.id,
    title: item.title,
    status: 'pending',
    original: '',
    rewritten: '',
    gaps: '',
    growthRatio: 0,
    error: ''
  }))
}

export function updateRequirementDeepeningBatchEntry(
  entries: readonly RequirementDeepeningBatchEntry[],
  workItemId: string,
  patch: RequirementDeepeningBatchEntryPatch
): RequirementDeepeningBatchEntry[] {
  return entries.map((entry) => (entry.workItemId === workItemId ? { ...entry, ...patch } : entry))
}

export function summarizeRequirementDeepeningBatch(
  entries: readonly RequirementDeepeningBatchEntry[]
): RequirementDeepeningBatchSummary {
  const summary: RequirementDeepeningBatchSummary = {
    total: entries.length,
    pending: 0,
    ready: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    averageGrowthRatio: 0,
    withGaps: 0
  }
  let growthSum = 0
  let growthCount = 0
  for (const entry of entries) {
    switch (entry.status) {
      case 'pending':
      case 'loading':
        summary.pending += 1
        break
      case 'ready':
        summary.ready += 1
        break
      case 'written':
        summary.written += 1
        break
      case 'skipped':
        summary.skipped += 1
        break
      case 'failed':
        summary.failed += 1
        break
    }
    if (entry.rewritten.trim()) {
      growthSum += entry.growthRatio
      growthCount += 1
      if (entry.gaps.trim() && entry.gaps.trim() !== '无') {
        summary.withGaps += 1
      }
    }
  }
  summary.averageGrowthRatio = growthCount === 0 ? 0 : growthSum / growthCount
  return summary
}

export function exceedsRequirementDeepeningBatchLimit(count: number): boolean {
  return count > REQUIREMENT_DEEPENING_BATCH_LIMIT
}

export function isRequirementDeepeningBatchSettled(
  entries: readonly RequirementDeepeningBatchEntry[]
): boolean {
  return entries.every((entry) => entry.status !== 'pending' && entry.status !== 'loading')
}

export function canWriteRequirementDeepeningBatch(
  entries: readonly RequirementDeepeningBatchEntry[]
): boolean {
  return entries.some((entry) => entry.status === 'ready')
}
