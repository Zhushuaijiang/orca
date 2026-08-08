import type { TuiAgent } from '../../shared/types'
import { readSkillReviewState, writeSkillReviewState } from './review-state'

export type SkillReviewRequest = {
  worktreeId: string
  agent: TuiAgent
  paneKey: string
  /** providerSession.transcriptPath——agent 自报的权威 transcript 位置，可能缺失。 */
  transcriptPath?: string
  providerSessionId?: string
  /** trigger 侧首次看到该 pane 的时间；用于丢弃过短会话，可能未知。 */
  sessionStartedAt?: number
  receivedAt: number
}

export type SkillReviewQueueDeps = {
  run: (request: SkillReviewRequest) => Promise<void>
  now?: () => number
  throttleMs?: number
  minSessionMs?: number
}

const DEFAULT_THROTTLE_MS = 30 * 60_000
const DEFAULT_MIN_SESSION_MS = 2 * 60_000

export function skillReviewTargetKey(
  request: Pick<SkillReviewRequest, 'worktreeId' | 'agent'>
): string {
  return `${request.worktreeId}:${request.agent}`
}

/** 串行（并发=1）评审队列：同目标节流去重，重启即弃（周期整理兜底）。 */
export function createSkillReviewQueue(deps: SkillReviewQueueDeps): {
  enqueue: (request: SkillReviewRequest) => void
  idle: () => Promise<void>
  pendingCount: () => number
} {
  const now = deps.now ?? Date.now
  const throttleMs = deps.throttleMs ?? DEFAULT_THROTTLE_MS
  const minSessionMs = deps.minSessionMs ?? DEFAULT_MIN_SESSION_MS
  const pending = new Map<string, SkillReviewRequest>()
  let drainPromise: Promise<void> | null = null

  async function drain(): Promise<void> {
    for (;;) {
      const next = pending.values().next()
      if (next.done) {
        return
      }
      const request = next.value
      pending.delete(skillReviewTargetKey(request))

      if (request.sessionStartedAt && now() - request.sessionStartedAt < minSessionMs) {
        continue
      }
      const key = skillReviewTargetKey(request)
      const state = await readSkillReviewState()
      const lastRun = state.lastReviewAtByTarget[key]
      if (lastRun && now() - Date.parse(lastRun) < throttleMs) {
        continue
      }
      // Why: 开始即记时间——失败也节流，避免异常会话反复触发评审烧 token。
      state.lastReviewAtByTarget[key] = new Date(now()).toISOString()
      await writeSkillReviewState(state)

      try {
        await deps.run(request)
      } catch (err) {
        console.warn('[skill-review] run failed', err)
      }
    }
  }

  function kick(): void {
    if (drainPromise) {
      return
    }
    drainPromise = drain().finally(() => {
      drainPromise = null
      // Why: drain 收尾与 finally 之间可能有新入队，补一脚避免请求卡住。
      if (pending.size > 0) {
        kick()
      }
    })
  }

  return {
    enqueue(request): void {
      // Why: Map 同 key 覆盖——排队期间同目标又来一个 SessionEnd，只留最新的。
      pending.set(skillReviewTargetKey(request), request)
      kick()
    },
    async idle(): Promise<void> {
      while (drainPromise) {
        await drainPromise
      }
    },
    pendingCount(): number {
      return pending.size
    }
  }
}
