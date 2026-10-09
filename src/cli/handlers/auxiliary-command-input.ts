import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { HandlerContext } from '../dispatch'
import { getOptionalStringFlag, getRepeatedStringFlag } from '../flags'
import { buildCurrentWorktreeSelector } from '../selectors'
import { RuntimeClientError } from '../runtime/types'
import { isTuiAgent } from '../../shared/tui-agent-config'

export async function readAuxiliaryCommandInput({ flags, cwd }: HandlerContext) {
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
  return {
    prompt,
    images: getRepeatedStringFlag(flags, 'image'),
    ...(primaryAgent ? { primaryAgent } : {}),
    worktree: getOptionalStringFlag(flags, 'worktree') ?? buildCurrentWorktreeSelector(cwd),
    depth: process.env.ORCA_AUXILIARY_REQUEST === '1' ? 1 : 0
  }
}
