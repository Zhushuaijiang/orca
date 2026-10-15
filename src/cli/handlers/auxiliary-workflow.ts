import { dispatch, type HandlerContext } from '../dispatch'
import { getOptionalStringFlag, getRepeatedStringFlag } from '../flags'
import { buildCurrentWorktreeSelector } from '../selectors'
import { RuntimeClientError } from '../runtime/types'
import type { AuxiliaryTaskLaunch } from '../../shared/auxiliary-task-launch'
import type { TuiAgent } from '../../shared/tui-agent'

export async function runAuxiliaryWorkflow(
  context: HandlerContext,
  task: 'implementation' | 'testing',
  prompt: string,
  primaryAgent?: TuiAgent
): Promise<void> {
  if (process.env.ORCA_AUXILIARY_REQUEST === '1') {
    throw new RuntimeClientError(
      'invalid_argument',
      'An auxiliary worker cannot delegate another implementation or testing task.'
    )
  }
  if (getRepeatedStringFlag(context.flags, 'image').length) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Analyze images with the vision task before starting an implementation or testing worker.'
    )
  }
  const worktree =
    getOptionalStringFlag(context.flags, 'worktree') ?? buildCurrentWorktreeSelector(context.cwd)
  const response = await context.client.call<AuxiliaryTaskLaunch>('auxiliary.resolveLaunch', {
    worktree,
    task,
    primaryAgent
  })
  const route = response.result
  const flags = new Map(context.flags)
  flags.delete('task')
  flags.set(
    'spec',
    `${prompt}\n\nAuxiliary task: ${task}. Do not invoke automatic task routing or start other agents. Follow the live Orca worker contract and report evidence to the original coordinator.`
  )
  flags.set('agent', route.agentId)
  flags.set('worktree', worktree)
  if (route.modelId) {
    flags.set('model', route.modelId)
  }
  if (route.thinkingLevel) {
    flags.set('effort', route.thinkingLevel)
  }
  await dispatch(['orchestration', 'worker-start'], { ...context, flags })
}
