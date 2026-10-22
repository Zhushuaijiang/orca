import { AUXILIARY_GENERATION_REQUEST_TIMEOUT_MS } from '../../shared/auxiliary-generation-timing'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import { readAuxiliaryCommandInput } from './auxiliary-command-input'
import { discussRequirement } from '../../shared/requirement-discussion'
import type { AuxiliaryGenerationResult } from '../../shared/auxiliary-model-types'

export const AUXILIARY_DISCUSSION_HANDLERS: Record<string, CommandHandler> = {
  'auxiliary discuss': async (context) => {
    const input = await readAuxiliaryCommandInput(context)
    if (input.images.length) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Analyze images with the vision task first, then supply the findings as discussion evidence.'
      )
    }
    let meta: { runtimeId: string } | undefined
    const result = await discussRequirement({
      context: input.prompt,
      generate: async (task, prompt) => {
        const response = await context.client.call<AuxiliaryGenerationResult>(
          'auxiliary.generate',
          { worktree: input.worktree, task, prompt, primaryAgent: input.primaryAgent },
          { timeoutMs: AUXILIARY_GENERATION_REQUEST_TIMEOUT_MS }
        )
        if (meta && response._meta.runtimeId !== meta.runtimeId) {
          throw new RuntimeClientError(
            'runtime_error',
            'The execution host restarted during requirement discussion. Preserve the evidence and retry the discussion.'
          )
        }
        meta = response._meta
        return response.result
      }
    })
    if (!meta) {
      throw new RuntimeClientError(
        'runtime_error',
        'No requirement discussion result was received.'
      )
    }
    printResult(
      { id: 'requirement-discussion', ok: true, result, _meta: meta },
      context.json,
      (value) => JSON.stringify(value, null, 2)
    )
    if (result.status !== 'ready_to_build') {
      process.exitCode = 1
    }
  }
}
