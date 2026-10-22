import { AUXILIARY_GENERATION_REQUEST_TIMEOUT_MS } from '../../shared/auxiliary-generation-timing'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  isAuxiliaryTaskId,
  type AuxiliaryGenerationResult
} from '../../shared/auxiliary-model-types'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag, getRepeatedStringFlag } from '../flags'
import { printResult } from '../format'
import { buildCurrentWorktreeSelector } from '../selectors'
import { RuntimeClientError } from '../runtime/types'
import { isTuiAgent } from '../../shared/tui-agent-config'
import { AUTOMATIC_AUXILIARY_HANDLERS } from './auxiliary-automatic-routing'
import { AUXILIARY_DISCUSSION_HANDLERS } from './auxiliary-discussion'
import { runAuxiliaryWorkflow } from './auxiliary-workflow'

export const AUXILIARY_HANDLERS: Record<string, CommandHandler> = {
  ...AUTOMATIC_AUXILIARY_HANDLERS,
  ...AUXILIARY_DISCUSSION_HANDLERS,
  'auxiliary run': async (context) => {
    const { client, flags, cwd, json } = context
    const task = getRequiredStringFlag(flags, 'task')
    if (!isAuxiliaryTaskId(task)) {
      throw new RuntimeClientError('invalid_argument', `Unknown auxiliary task: ${task}`)
    }
    const file = getOptionalStringFlag(flags, 'prompt-file')
    const text = getOptionalStringFlag(flags, 'prompt')
    if (file && text) {
      throw new RuntimeClientError('invalid_argument', 'Choose either --prompt or --prompt-file.')
    }
    const prompt = file ? await readFile(resolve(cwd, file), 'utf8') : text
    if (!prompt?.trim()) {
      throw new RuntimeClientError('invalid_argument', 'Supply --prompt or --prompt-file.')
    }
    const primaryAgent = getOptionalStringFlag(flags, 'primary-agent')
    if (primaryAgent !== undefined && !isTuiAgent(primaryAgent)) {
      throw new RuntimeClientError('invalid_argument', `Unknown primary agent: ${primaryAgent}`)
    }
    if (task === 'implementation' || task === 'testing') {
      await runAuxiliaryWorkflow(context, task, prompt, primaryAgent)
      return
    }
    const response = await client.call<AuxiliaryGenerationResult>(
      'auxiliary.generate',
      {
        task,
        prompt,
        images: getRepeatedStringFlag(flags, 'image'),
        ...(primaryAgent ? { primaryAgent } : {}),
        worktree: getOptionalStringFlag(flags, 'worktree') ?? buildCurrentWorktreeSelector(cwd)
      },
      { timeoutMs: AUXILIARY_GENERATION_REQUEST_TIMEOUT_MS }
    )
    if (!response.result.success) {
      throw new RuntimeClientError('generation_failed', response.result.error)
    }
    printResult(response, json, (result) => (result.success ? result.rawOutput : result.error))
  }
}
