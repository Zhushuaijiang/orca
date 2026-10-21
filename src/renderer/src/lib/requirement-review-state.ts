import { create } from 'zustand'
import { useAppStore } from '@/store'
import type {
  RequirementReviewRecord,
  RequirementReviewPhase
} from '../../../shared/requirement-review'

export type { RequirementReviewPhase }
export type RequirementReviewState = Omit<RequirementReviewRecord, 'updatedAt'>

export const useRequirementReviewState = create<{
  reviews: Record<string, RequirementReviewState>
  update: (paneKey: string, review: RequirementReviewState) => void
}>((set) => ({
  reviews: {},
  update: (paneKey, review) =>
    set((state) => ({ reviews: { ...state.reviews, [paneKey]: review } }))
}))

const pendingWrites = new Map<string, Promise<void>>()

export async function saveRequirementReview(
  worktreeId: string,
  paneKey: string,
  review: RequirementReviewState
): Promise<void> {
  if (review.phase !== 'confirmed' && review.phase !== 'awaiting_confirmation') {
    useRequirementReviewState.getState().update(paneKey, review)
  }
  const previous = pendingWrites.get(worktreeId) ?? Promise.resolve()
  const write = previous
    .catch(() => {})
    .then(async () => {
      const state = useAppStore.getState()
      const worktree = state.getKnownWorktreeById(worktreeId)
      if (!worktree) {
        throw new Error('Review workspace unavailable')
      }
      const result = await state.updateWorktreeMeta(worktreeId, {
        requirementReviews: {
          ...worktree.requirementReviews,
          [paneKey]: { ...review, updatedAt: Date.now() }
        }
      })
      if (!result.ok) {
        throw new Error(result.error ?? 'Could not save requirement review')
      }
      useRequirementReviewState.getState().update(paneKey, review)
    })
  pendingWrites.set(worktreeId, write)
  try {
    await write
  } finally {
    if (pendingWrites.get(worktreeId) === write) {
      pendingWrites.delete(worktreeId)
    }
  }
}
