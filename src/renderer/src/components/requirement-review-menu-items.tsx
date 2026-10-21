import { ClipboardCheck } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { saveRequirementReview, useRequirementReviewState } from '@/lib/requirement-review-state'
import { launchSessionRequirementReview } from '@/lib/yunxiao-review-handoff-launch'
import { isTuiAgent } from '../../../shared/tui-agent-config'
import { isRequirementReviewCurrent } from '../../../shared/requirement-review'

export function RequirementReviewMenuItems({
  worktreeId,
  paneKey
}: {
  worktreeId: string
  paneKey: string
}): React.JSX.Element | null {
  const entry = useAppStore((state) => state.agentStatusByPaneKey[paneKey])
  const liveReview = useRequirementReviewState((state) => state.reviews[paneKey])
  const savedReview = useAppStore(
    (state) => state.getKnownWorktreeById(worktreeId)?.requirementReviews?.[paneKey]
  )
  const candidate = liveReview ?? savedReview
  const review = candidate && isRequirementReviewCurrent(candidate, entry) ? candidate : undefined
  if (!entry || !isTuiAgent(entry.agentType)) {
    return null
  }
  const running =
    Boolean(liveReview) && (review?.phase === 'reviewing' || review?.phase === 'repairing')
  if (review?.phase === 'awaiting_confirmation') {
    return (
      <DropdownMenuItem
        disabled={
          entry.state !== 'done' || entry.sessionBoundary === true || entry.interrupted === true
        }
        onSelect={() => {
          const current = useAppStore.getState().agentStatusByPaneKey[paneKey]
          if (
            !isRequirementReviewCurrent(review, current) ||
            current?.state !== 'done' ||
            current.sessionBoundary ||
            current.interrupted
          ) {
            return
          }
          void saveRequirementReview(worktreeId, paneKey, { ...review, phase: 'confirmed' })
            .then(() => {
              toast.success(
                translate('requirementReview.confirmed', 'Requirement review confirmed')
              )
            })
            .catch(() => {
              useRequirementReviewState.getState().update(paneKey, review)
              toast.error(
                translate('requirementReview.saveFailed', 'Could not save requirement review')
              )
            })
        }}
      >
        <ClipboardCheck />
        {translate('requirementReview.confirmConsensus', 'Confirm discussion consensus')}
      </DropdownMenuItem>
    )
  }
  return (
    <DropdownMenuItem
      disabled={running || entry.state !== 'done' || entry.sessionBoundary === true}
      onSelect={() => {
        void launchSessionRequirementReview(worktreeId, paneKey).catch(() => {
          toast.error(
            translate('requirementReview.launchFailed', 'Could not start requirement review')
          )
        })
      }}
    >
      <ClipboardCheck />
      {running
        ? translate('requirementReview.progress', 'Requirement discussion {{round}}/3', {
            round: review.round
          })
        : review?.phase === 'confirmed'
          ? translate('requirementReview.restart', 'Review requirement again')
          : review?.phase === 'changes_requested'
            ? translate('requirementReview.retry', 'Continue requirement discussion (unresolved)')
            : translate('requirementReview.start', 'Discuss requirement (up to 3 rounds)')}
    </DropdownMenuItem>
  )
}
