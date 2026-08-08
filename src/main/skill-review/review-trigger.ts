import type { AgentHookEventPayload } from '../../shared/agent-hook-listener'
import type { TuiAgent } from '../../shared/types'
import type { SkillReviewRequest } from './review-queue'

// Why: Orca 的 managed hooks 没给 claude/codex/kimi 装 SessionEnd（只有
// copilot/grok/devin 有），所以主触发用全 agent 都有的 Stop；会话级节流在队列里。
const TRIGGER_EVENTS = new Set(['Stop', 'SessionEnd'])
const MAX_TRACKED_PANES = 1000

export type SkillReviewTriggerEvent = Pick<
  AgentHookEventPayload,
  | 'paneKey'
  | 'hookEventName'
  | 'worktreeId'
  | 'source'
  | 'providerSession'
  | 'connectionId'
  | 'isReplay'
>

export type SkillReviewTriggerDeps = {
  enqueue: (request: SkillReviewRequest) => void
  isEnabled?: () => Promise<boolean>
  now?: () => number
}

export function createSkillReviewTrigger(
  deps: SkillReviewTriggerDeps
): (payload: SkillReviewTriggerEvent) => void {
  const paneFirstSeenAt = new Map<string, number>()

  return (payload) => {
    const now = (deps.now ?? Date.now)()
    if (!payload.paneKey) {
      return
    }
    if (!paneFirstSeenAt.has(payload.paneKey)) {
      // Why: 简单有界——超上限全清，代价只是几个 pane 失去"首次见到"时间。
      if (paneFirstSeenAt.size >= MAX_TRACKED_PANES) {
        paneFirstSeenAt.clear()
      }
      paneFirstSeenAt.set(payload.paneKey, now)
    }
    if (payload.isReplay) {
      return
    }
    if (!payload.hookEventName || !TRIGGER_EVENTS.has(payload.hookEventName)) {
      return
    }
    // Why: SSH 会话的 transcript/技能库都在远端主机——由远端 Orca（headless
    // serve 也启动本服务）评审，本地跳过避免双跑和跨主机执行。
    if (payload.connectionId !== null) {
      return
    }
    const worktreeId = payload.worktreeId
    const agent = payload.source
    if (!worktreeId || !agent) {
      return
    }
    const sessionStartedAt = paneFirstSeenAt.get(payload.paneKey)
    void (async () => {
      const enabled = deps.isEnabled ? await deps.isEnabled() : true
      if (!enabled) {
        return
      }
      deps.enqueue({
        worktreeId,
        agent: agent as TuiAgent,
        paneKey: payload.paneKey,
        transcriptPath: payload.providerSession?.transcriptPath,
        providerSessionId: payload.providerSession?.id,
        sessionStartedAt,
        receivedAt: now
      })
    })().catch((err) => console.warn('[skill-review] trigger failed', err))
  }
}
