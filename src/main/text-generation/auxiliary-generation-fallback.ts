import { planCommitMessageGeneration } from '../../shared/commit-message-plan'
import type { ResolvedSourceControlAiGenerationParams } from '../../shared/source-control-ai'
import type { InternalTextGenerationResult } from './source-control-text-generation-types'

export const CANCELED_AUXILIARY_RESULT = {
  success: false,
  error: 'Generation canceled.',
  canceled: true
} as const

export async function executeWithAuxiliaryFallback(input: {
  signal?: AbortSignal
  params: ResolvedSourceControlAiGenerationParams
  prompt?: string
  backslash: 'literal' | 'escape'
  execute: (
    params: ResolvedSourceControlAiGenerationParams,
    plan?: ReturnType<typeof planCommitMessageGeneration>
  ) => Promise<InternalTextGenerationResult>
}): Promise<InternalTextGenerationResult> {
  if (input.signal?.aborted) {
    return CANCELED_AUXILIARY_RESULT
  }
  let result = await input.execute(input.params)
  if (input.signal?.aborted) {
    return CANCELED_AUXILIARY_RESULT
  }
  if (input.prompt === undefined) {
    return result
  }
  for (const candidate of input.params.fallbackCandidates ?? []) {
    if (input.signal?.aborted) {
      return CANCELED_AUXILIARY_RESULT
    }
    if (result.success || result.canceled) {
      break
    }
    const planned = planCommitMessageGeneration(
      { ...candidate, backslash: input.backslash },
      input.prompt
    )
    if (!planned.ok) {
      continue
    }
    result = await input.execute(candidate, planned)
  }
  return result
}
