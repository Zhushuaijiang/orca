import { agentHookServer } from '../agent-hooks/server'
import { splitWorktreeIdForFilesystem } from '../../shared/worktree-id'
import { startSkillReviewCurator } from './review-curator'
import { createSkillReviewQueue } from './review-queue'
import { runSkillReview } from './review-runner'
import { createSkillReviewTrigger } from './review-trigger'

let started = false

export type SkillReviewServiceOptions = {
  /** 总开关（GlobalSettings.skillReviewEnabled）；缺省视为开启。 */
  isEnabled?: () => boolean
}

/** 自动技能沉淀服务：会话 Stop/SessionEnd → 节流队列 → 受限评审；24h 周期整理。 */
export function startSkillReviewService(options: SkillReviewServiceOptions = {}): void {
  if (started) {
    return
  }
  started = true
  const queue = createSkillReviewQueue({
    run: (request) =>
      runSkillReview(request, {
        // Why: worktreeId 自带路径（folder workspace 的 UUID 后缀由解析剥掉），无需查 Store。
        resolveWorktreePath: (worktreeId) =>
          splitWorktreeIdForFilesystem(worktreeId)?.worktreePath ?? null
      })
  })
  agentHookServer.subscribeEnrichedStatus(
    createSkillReviewTrigger({
      enqueue: queue.enqueue,
      isEnabled: options.isEnabled ? async () => options.isEnabled!() : undefined
    })
  )
  startSkillReviewCurator({ isEnabled: options.isEnabled })
}
