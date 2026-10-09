import { dispatch, type CommandHandler } from '../dispatch'
import { getOptionalStringFlag } from '../flags'
import { buildCurrentWorktreeSelector } from '../selectors'
import { printResult } from '../format'
import type {
  AutomaticRoutingResult,
  AutomaticTaskExecutionResult
} from '../../shared/automatic-task-routing-types'
import { readAuxiliaryCommandInput } from './auxiliary-command-input'

export const AUTOMATIC_AUXILIARY_HANDLERS: Record<string, CommandHandler> = {
  'auxiliary route': async (context) => {
    const input = await readAuxiliaryCommandInput(context)
    const response = await context.client.call<AutomaticRoutingResult>('auxiliary.route', input, {
      timeoutMs: 180_000
    })
    printResult(
      response,
      context.json,
      (result) => result.error ?? result.route?.reason ?? 'Automatic routing is disabled.'
    )
  },
  'auxiliary auto': async (context) => {
    const input = await readAuxiliaryCommandInput(context)
    const response = await context.client.call<AutomaticTaskExecutionResult>(
      'auxiliary.auto',
      input,
      { timeoutMs: 360_000 }
    )
    const route = response.result.routing.route
    if (route?.action === 'worker' && route.agentId) {
      const flags = new Map(context.flags)
      flags.set(
        'spec',
        `${input.prompt}\n\nThis is a delegated task. Do not invoke automatic task routing or delegate again. Follow the live Orca worker contract and return evidence to the coordinator.`
      )
      flags.set('agent', route.agentId)
      flags.set('worktree', input.worktree)
      if (route.modelId) {
        flags.set('model', route.modelId)
      }
      if (route.thinkingLevel) {
        flags.set('effort', route.thinkingLevel)
      }
      if (!flags.has('retry-request') && response.result.routing.historyId) {
        flags.set('retry-request', response.result.routing.historyId)
      }
      await dispatch(['orchestration', 'worker-start'], { ...context, flags })
      return
    }
    printResult(response, context.json, (result) =>
      result.result?.success
        ? result.result.rawOutput
        : result.result && !result.result.success
          ? result.result.error
          : (result.routing.error ??
            result.routing.route?.reason ??
            'Continue in the primary agent.')
    )
  },
  'auxiliary history': async (context) => {
    const response = await context.client.call<
      { id: string; createdAt: string; reason: string; agentId?: string; modelId?: string }[]
    >('auxiliary.history', {
      worktree:
        getOptionalStringFlag(context.flags, 'worktree') ??
        buildCurrentWorktreeSelector(context.cwd)
    })
    printResult(response, context.json, (records) =>
      records
        .map(
          (record) =>
            `${record.createdAt} ${record.agentId ?? 'primary'} ${record.modelId ?? ''}: ${record.reason}`
        )
        .join('\n')
    )
  }
}
