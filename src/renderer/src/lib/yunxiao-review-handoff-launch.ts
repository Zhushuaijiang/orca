import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { createRequirementReviewCycle } from './requirement-review-cycle'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { isRequirementReviewCurrent } from '../../../shared/requirement-review'
import { useRequirementReviewState } from './requirement-review-state'
import type { TuiAgent } from '../../../shared/tui-agent'
import { isTuiAgent } from '../../../shared/tui-agent-config'
import { loadYunxiaoReviewHandoffPreference } from '@/components/yunxiao-review-handoff-preference'
import { resolveWorktreeAuxiliaryLaunch } from './worktree-auxiliary-launch'
import type { SessionOptionValue } from '../../../shared/native-chat-session-options'
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
  const workItemIds = extractYunxiaoReviewHandoffWorkItemIds(args.run.title, args.automation.prompt)
  const archiveDirs = [
    ...new Set(
      (outcomes ?? [])
        .map((outcome) => outcome.requirementContract?.archiveDir)
        .filter((dir): dir is string => Boolean(dir))
    )
  ]
  const outcomesSummary = summarizeYunxiaoReviewOutcomes(args.outputSnapshot?.content ?? null)
  await launchRequirementReview({
    worktreeId: args.worktreeId,
    runTitle: args.run.title,
    implementerPaneKey: args.implementerPaneKey,
    implementerAgentId: args.automation.agentId,
    reviewerAgentId: reviewHandoff.agentId,
    workItemIds,
    archiveDirs,
    outcomesSummary
  })
}

export async function launchSessionRequirementReview(
  worktreeId: string,
  paneKey: string
): Promise<void> {
  const entry = useAppStore.getState().agentStatusByPaneKey[paneKey]
  if (!entry || !isTuiAgent(entry.agentType) || entry.state !== 'done' || entry.sessionBoundary) {
    toast.error('请等待原智能体完成当前任务后发起需求审核。')
    return
  }
  const title = entry.terminalTitle || entry.prompt.slice(0, 100) || '需求审核'
  await launchRequirementReview({
    worktreeId,
    runTitle: title,
    implementerPaneKey: paneKey,
    implementerAgentId: entry.agentType,
    reviewerAgentId: loadYunxiaoReviewHandoffPreference().agentId,
    workItemIds: extractYunxiaoReviewHandoffWorkItemIds(title, entry.prompt),
    archiveDirs: [],
    outcomesSummary: `原用户目标：\n${entry.prompt}\n\n已有结果：\n${summarizeYunxiaoReviewOutcomes(entry.lastAssistantMessage ?? null) ?? '尚无摘要'}`
  })
}

async function launchRequirementReview(args: {
  worktreeId: string
  runTitle: string
  implementerPaneKey: string | null
  implementerAgentId: TuiAgent
  reviewerAgentId: TuiAgent
  workItemIds: string[]
  archiveDirs: string[]
  outcomesSummary: string | null
}): Promise<void> {
  if (!args.implementerPaneKey) {
    toast.error(`${args.runTitle}：原会话不可用，未启动审核。`)
    return
  }
  const initialStore = useAppStore.getState()
  const currentSession =
    initialStore.agentStatusByPaneKey[args.implementerPaneKey]?.providerSession?.id
  const originalPane = parsePaneKey(args.implementerPaneKey)
  const originalIdentity = {
    sessionId: currentSession,
    ptyId: originalPane
      ? initialStore.terminalLayoutsByTabId[originalPane.tabId]?.ptyIdsByLeafId?.[
          originalPane.leafId
        ]
      : null
  }
  const prior =
    useRequirementReviewState.getState().reviews[args.implementerPaneKey] ??
    initialStore.getKnownWorktreeById(args.worktreeId)?.requirementReviews?.[
      args.implementerPaneKey
    ]
  const sameSession = prior
    ? isRequirementReviewCurrent(prior, initialStore.agentStatusByPaneKey[args.implementerPaneKey])
    : true
  if (
    prior &&
    sameSession &&
    ['reviewing', 'repairing', 'awaiting_confirmation'].includes(prior.phase) &&
    (useRequirementReviewState.getState().reviews[args.implementerPaneKey] ||
      prior.phase === 'awaiting_confirmation')
  ) {
    toast.error('当前会话已有审核，请先完成审核和确认。')
    return
  }
  const implementerPaneKey = args.implementerPaneKey
  const initialReview = {
    round: 1,
    sessionId: currentSession,
    review: sameSession ? prior?.review : undefined
  }
  useRequirementReviewState
    .getState()
    .update(implementerPaneKey, { ...initialReview, phase: 'reviewing' })
  const store = useAppStore.getState()
  const implementerStatus = store.agentStatusByPaneKey[args.implementerPaneKey]
  const worktree = store.getKnownWorktreeById(args.worktreeId)
  const route = await resolveWorktreeAuxiliaryLaunch({
    worktreeId: args.worktreeId,
    task: 'review',
    primaryAgent: args.implementerAgentId,
    agentOverride: args.reviewerAgentId
  }).catch((error) => {
    useRequirementReviewState
      .getState()
      .update(implementerPaneKey, { ...initialReview, phase: 'failed' })
    toast.error(`${args.runTitle}：审核接力未启动，请检查执行主机版本和辅助模型配置。`)
    throw error
  })
  const sessionOptions: Record<string, SessionOptionValue> = {
    ...(route.modelId ? { model: route.modelId } : {}),
    ...(route.thinkingLevel
      ? {
          effort: route.thinkingLevel,
          thinking: route.thinkingLevel,
          reasoningEffort: route.thinkingLevel
        }
      : {})
  }
  const cycle = createRequirementReviewCycle({
    ...args,
    originalIdentity,
    initialDiscussion: sameSession ? prior?.review : undefined,
    implementerPaneKey: args.implementerPaneKey,
    launchRound: async (round, previousReply, reviewReturn) => {
      const startedAt = Date.now()
      const result = await launchAgentBackgroundSession({
        agent: route.agentId,
        ...(Object.keys(sessionOptions).length ? { sessionOptions } : {}),
        worktreeId: args.worktreeId,
        prompt: buildYunxiaoReviewHandoffPrompt({
          runTitle: args.runTitle,
          implementerAgentId: args.implementerAgentId,
          implementerSessionId: implementerStatus?.providerSession?.id ?? null,
          workItemIds: args.workItemIds,
          worktreePath: worktree?.path ?? null,
          archiveDirs: args.archiveDirs,
          outcomesSummary:
            [args.outcomesSummary, previousReply ?? (sameSession ? prior?.review : null)]
              .filter(Boolean)
              .join('\n\n') || null,
          round
        }),
        launchSource: 'task_page',
        title: `${buildYunxiaoReviewHandoffTitle(args.runTitle)} ${round}/3`,
        onAgentStatus: reviewReturn.onAgentStatus,
        onExit: reviewReturn.onExit
      })
      if (result) {
        reviewReturn.observe(result.paneKey, startedAt)
      } else {
        reviewReturn.dispose()
      }
      result?.terminalOwnership?.release()
      return Boolean(result)
    }
  })
  await cycle.start()
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
