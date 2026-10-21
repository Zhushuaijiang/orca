import { z } from 'zod'
import type { AgentStatusEntry } from './agent-status-types'

export const RequirementReviewPhaseSchema = z.enum([
  'reviewing',
  'repairing',
  'awaiting_confirmation',
  'confirmed',
  'changes_requested',
  'interrupted',
  'failed'
])

export type RequirementReviewPhase = z.infer<typeof RequirementReviewPhaseSchema>

export const RequirementReviewRecordSchema = z.object({
  round: z.number().finite(),
  phase: RequirementReviewPhaseSchema,
  review: z.string().optional(),
  sessionId: z.string().optional(),
  ptyId: z.string().optional(),
  reviewedTurnStartedAt: z.number().finite().optional(),
  updatedAt: z.number().finite()
})

export type RequirementReviewRecord = z.infer<typeof RequirementReviewRecordSchema>

export const RequirementReviewsSchema = z.record(z.string(), RequirementReviewRecordSchema)

export function isRequirementReviewCurrent(
  review: Omit<RequirementReviewRecord, 'updatedAt'>,
  entry: AgentStatusEntry | undefined
): boolean {
  return Boolean(
    entry &&
    (!review.sessionId || review.sessionId === entry.providerSession?.id) &&
    (review.reviewedTurnStartedAt === undefined ||
      review.reviewedTurnStartedAt === (entry.turnStartedAt ?? entry.stateStartedAt))
  )
}
