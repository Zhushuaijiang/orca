import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
import { useAppStore } from '@/store'
import type {
  Automation,
  AutomationRun,
  AutomationRunOutputSnapshot
} from '../../../shared/automations-types'
import { extractYunxiaoRequirementGateOutcomesFromSnapshot } from '../../../shared/yunxiao-requirement-gate-outcome'
import {
  buildYunxiaoReviewHandoffPrompt,
  buildYunxiaoReviewHandoffTitle,
  extractYunxiaoReviewHandoffWorkItemIds,
  resolveYunxiaoReviewHandoff,
  shouldLaunchYunxiaoReviewHandoff
} from '../../../shared/yunxiao-review-handoff'

const OUTCOMES_SUMMARY_LIMIT = 800

export async function maybeLaunchYunxiaoReviewHandoff(args: {
  automation: Automation
  run: AutomationRun
  worktreeId: string
  implementerPaneKey: string | null
  outputSnapshot: AutomationRunOutputSnapshot | null
}): Promise<void> {
  const source = args.automation.yunxiaoTodoPool
  if (source?.kind !== 'yunxiao-todo-pool') {
    return
  }
  const store = useAppStore.getState()
  const implementerStatus = args.implementerPaneKey
    ? store.agentStatusByPaneKey[args.implementerPaneKey]
    : undefined
  const outcomes =
    args.run.yunxiaoRequirementOutcomes ??
    extractYunxiaoRequirementGateOutcomesFromSnapshot(args.outputSnapshot)
  if (
    !shouldLaunchYunxiaoReviewHandoff({
      reviewHandoff: source.reviewHandoff,
      interrupted: implementerStatus?.interrupted === true,
      outcomes
    })
  ) {
    return
  }

  const reviewHandoff = resolveYunxiaoReviewHandoff(source.reviewHandoff)
  const worktree = store.getKnownWorktreeById(args.worktreeId)
  const workItemIds = extractYunxiaoReviewHandoffWorkItemIds(args.run.title, args.automation.prompt)
  const archiveDirs = [
    ...new Set(
      (outcomes ?? [])
        .map((outcome) => outcome.requirementContract?.archiveDir)
        .filter((dir): dir is string => Boolean(dir))
    )
  ]
  const outcomesSummary = summarizeYunxiaoReviewOutcomes(args.outputSnapshot?.content ?? null)

  const result = await launchAgentBackgroundSession({
    agent: reviewHandoff.agentId,
    worktreeId: args.worktreeId,
    prompt: buildYunxiaoReviewHandoffPrompt({
      runTitle: args.run.title,
      implementerAgentId: args.automation.agentId,
      implementerSessionId: implementerStatus?.providerSession?.id ?? null,
      workItemIds,
      worktreePath: worktree?.path ?? null,
      archiveDirs,
      outcomesSummary
    }),
    launchSource: 'task_page',
    title: buildYunxiaoReviewHandoffTitle(args.run.title)
  })
  result?.terminalOwnership?.release()
}

function summarizeYunxiaoReviewOutcomes(content: string | null): string | null {
  if (!content) {
    return null
  }
  const trimmed = content.trim()
  if (!trimmed) {
    return null
  }
  return trimmed.length <= OUTCOMES_SUMMARY_LIMIT
    ? trimmed
    : `${trimmed.slice(0, OUTCOMES_SUMMARY_LIMIT)}\n…`
}
