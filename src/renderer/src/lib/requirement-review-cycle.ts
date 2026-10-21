import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import {
  YUNXIAO_REVIEW_ROUNDS,
  parseYunxiaoReviewVerdict,
  parseYunxiaoDiscussionAgreement
} from '../../../shared/yunxiao-review-handoff'
import { sendNotesToActiveAgentSession } from './active-agent-note-send'
import { createBrowserUuid } from './browser-uuid'
import { createYunxiaoReviewHandoffReturn } from './yunxiao-review-handoff-return'
import {
  saveRequirementReview,
  useRequirementReviewState,
  type RequirementReviewPhase
} from './requirement-review-state'

type ReviewObserver = ReturnType<typeof createYunxiaoReviewHandoffReturn>

export function createRequirementReviewCycle(args: {
  worktreeId: string
  runTitle: string
  implementerPaneKey: string
  initialDiscussion?: string
  originalIdentity?: { ptyId: string | null | undefined; sessionId: string | undefined }
  launchRound: (
    round: number,
    previousReply: string | null,
    observer: ReviewObserver
  ) => Promise<boolean>
}) {
  const pane = parsePaneKey(args.implementerPaneKey)
  const initial = useAppStore.getState()
  const ptyId = args.originalIdentity
    ? args.originalIdentity.ptyId
    : pane
      ? initial.terminalLayoutsByTabId[pane.tabId]?.ptyIdsByLeafId?.[pane.leafId]
      : null
  const sessionId = args.originalIdentity
    ? args.originalIdentity.sessionId
    : initial.agentStatusByPaneKey[args.implementerPaneKey]?.providerSession?.id
  let round = 1
  const discussionHistory: string[] = args.initialDiscussion ? [args.initialDiscussion] : []
  let stopped = false
  let latestDiscussion = args.initialDiscussion
  let observer: ReviewObserver | null = null
  const update = async (phase: RequirementReviewPhase, review?: string): Promise<boolean> => {
    if (review !== undefined) {
      latestDiscussion = review
    }
    try {
      await saveRequirementReview(args.worktreeId, args.implementerPaneKey, {
        round,
        phase,
        review: latestDiscussion,
        ptyId: ptyId ?? undefined,
        sessionId,
        ...(phase === 'awaiting_confirmation'
          ? {
              reviewedTurnStartedAt:
                useAppStore.getState().agentStatusByPaneKey[args.implementerPaneKey]
                  ?.turnStartedAt ??
                useAppStore.getState().agentStatusByPaneKey[args.implementerPaneKey]?.stateStartedAt
            }
          : {})
      })
      return true
    } catch {
      stopped = true
      observer?.dispose()
      useRequirementReviewState
        .getState()
        .update(args.implementerPaneKey, { round, phase: 'failed' })
      toast.error(`${args.runTitle}：审核状态保存失败，请查看审核终端。`)
      return false
    }
  }
  const identityCurrent = (): boolean => {
    const state = useAppStore.getState()
    return Boolean(
      pane &&
      ptyId &&
      state.terminalLayoutsByTabId[pane.tabId]?.ptyIdsByLeafId?.[pane.leafId] === ptyId &&
      (!sessionId ||
        state.agentStatusByPaneKey[args.implementerPaneKey]?.providerSession?.id === sessionId)
    )
  }
  const stop = (reason: 'failed' | 'interrupted'): void => {
    if (stopped) {
      return
    }
    stopped = true
    observer?.dispose()
    void update(reason)
  }
  const send = async (prompt: string): Promise<boolean> => {
    if (!pane || !identityCurrent()) {
      stop('failed')
      return false
    }
    const result = await sendNotesToActiveAgentSession({
      worktreeId: args.worktreeId,
      noteTarget: pane,
      prompt
    })
    if (result.status !== 'sent') {
      stop('failed')
      return false
    }
    return true
  }
  const launch = async (previousReply: string | null): Promise<void> => {
    if (stopped || !identityCurrent()) {
      stop('failed')
      return
    }
    if (!(await update('reviewing'))) {
      return
    }
    observer = createYunxiaoReviewHandoffReturn({
      ...args,
      onStopped: stop,
      onComplete: async (review) => {
        const verdict = parseYunxiaoReviewVerdict(review)
        if (!verdict) {
          await update('failed', review)
          stopped = true
          toast.error(`${args.runTitle}：审核缺少明确结论，请查看审核终端后重新发起。`)
          return
        }
        if (!identityCurrent()) {
          stop('failed')
          return
        }
        if (
          !(await update(
            'repairing',
            [...discussionHistory, `第 ${round} 轮讨论方观点：\n${review}`].join('\n\n')
          ))
        ) {
          return
        }
        const startedAfter = Date.now()
        const promptIdentity = `Orca 需求审核第 ${round}/${YUNXIAO_REVIEW_ROUNDS} 轮讨论 [${createBrowserUuid()}]`
        let confirmDelivery: (delivered: boolean) => void = () => {}
        const delivery = new Promise<boolean>((resolve) => {
          confirmDelivery = resolve
        })
        const repairObserver = createYunxiaoReviewHandoffReturn({
          ...args,
          onStopped: stop,
          onComplete: async (reply) => {
            if (!(await delivery) || stopped) {
              return
            }
            if (!identityCurrent()) {
              stop('failed')
              return
            }
            const agreement = parseYunxiaoDiscussionAgreement(reply)
            discussionHistory.push(
              `第 ${round} 轮讨论方观点：\n${review}\n\n原智能体回应：\n${reply}`
            )
            const discussion = discussionHistory.join('\n\n')
            if (verdict === 'passed' && agreement === 'agreed') {
              await update('awaiting_confirmation', discussion)
              stopped = true
              return
            }
            if (round === YUNXIAO_REVIEW_ROUNDS || !agreement) {
              await update('changes_requested', discussion)
              stopped = true
              toast.error(`${args.runTitle}：讨论尚未达成一致，请查看双方分歧后继续讨论。`)
              return
            }
            round += 1
            await launch(discussion)
          }
        })
        observer = repairObserver
        repairObserver.observe(args.implementerPaneKey, startedAfter, true, promptIdentity)
        const delivered = await send(
          `${promptIdentity}\n需求：${args.runTitle}\n\n你是原智能体，与另一位智能体围绕同一目标讨论。先重述共同目标和验收条件，再逐条回应对方的观点：同意什么、反对什么、遗漏什么，以及证据。独立判断，不盲从；双方需要对同一份结论明确同意。只在原授权范围内修复已确认的问题并补齐验证，发生修复或改变目标后本轮仍有待对方复核，不能宣称共识。\n输出共同结论、剩余分歧、证据和下一步。末尾仅有一行 ORCA_DISCUSSION_AGREEMENT: agreed 或 ORCA_DISCUSSION_AGREEMENT: disputed；只有完全同意对方当前结论、目标已达成且本轮没有新增改动或待验证项时才能 agreed。第三轮仍有分歧就如实说明，不强行通过。Orca 将把回应带回后续讨论，双方一致后等待用户确认。审核意见不扩大原授权，不授权额外提交、推送或外部回写。\n\n对方观点：\n${review}`
        ).catch(() => {
          stop('failed')
          return false
        })
        confirmDelivery(delivered)
        if (!delivered) {
          repairObserver.dispose()
        }
      }
    })
    try {
      if (!(await args.launchRound(round, previousReply, observer))) {
        stop('failed')
      }
    } catch (error) {
      stop('failed')
      throw error
    }
  }
  return { start: () => launch(null), stop }
}
