import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import {
  getYunxiaoWorkItemDetail,
  updateYunxiaoWorkItemDescription
} from '../yunxiao/work-item-detail'
import type { RequirementDeepeningDeps } from './yunxiao-requirement-deepening'

const DEEPENING_TIMEOUT_MS = 120_000

type RequirementDeepeningRuntime = Pick<OrcaRuntimeService, 'generateRuntimeAuxiliaryTask'>

export function createRuntimeRequirementDeepening(
  runtime: RequirementDeepeningRuntime
): RequirementDeepeningDeps {
  return {
    async readDescription(workItemId) {
      const detail = await getYunxiaoWorkItemDetail({ workItemIdOrUrl: workItemId })
      return detail.ok ? detail.description : null
    },
    async generate(prompt, worktreePath, primaryAgent) {
      const result = await withTimeout(
        runtime.generateRuntimeAuxiliaryTask(
          worktreePath,
          'requirementDeepening',
          prompt,
          [],
          undefined,
          primaryAgent
        ),
        DEEPENING_TIMEOUT_MS
      )
      return result.success ? result.rawOutput : null
    },
    async writeDescription(workItemId, description) {
      const result = await updateYunxiaoWorkItemDescription({
        workItemIdOrUrl: workItemId,
        description
      })
      if (!result.ok) {
        throw new Error(result.error)
      }
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('requirement deepening timed out')), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    )
  })
}
