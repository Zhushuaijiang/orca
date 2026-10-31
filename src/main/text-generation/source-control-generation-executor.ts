import {
  cleanGeneratedCommitMessage,
  stripPrefilledReasoningPreamble,
  type CommandTemplateBackslash
} from '../../shared/commit-message-prompt'
import { isCustomAgentId } from '../../shared/commit-message-agent-spec'
import type { CommitMessagePlan } from '../../shared/commit-message-plan'
import type { ResolvedSourceControlAiGenerationParams } from '../../shared/source-control-ai'
import { openCodeVariantRetryPlan } from '../../shared/opencode-generation-command'
import { runLocalPlanForAgent } from './source-control-local-generation'
import { runRemoteSourceControlPlan } from './source-control-remote-generation'
import {
  executeWithAuxiliaryFallback,
  CANCELED_AUXILIARY_RESULT
} from './auxiliary-generation-fallback'
import { prepareLocalCommitMessageAgentEnv } from './commit-message-agent-environment'
import type {
  CommitMessageGenerationTarget,
  InternalTextGenerationResult,
  SpawnSourceControlAgent,
  TextGenerationOperation
} from './source-control-text-generation-types'
import { AUXILIARY_GENERATION_TIMEOUT_MS } from '../../shared/auxiliary-generation-timing'

type GenerateParams = ResolvedSourceControlAiGenerationParams

export function commandBackslashMode(
  target: CommitMessageGenerationTarget,
  platform: NodeJS.Platform = process.platform
): CommandTemplateBackslash {
  return platform === 'win32' && target.kind === 'local' && !target.wslDistro ? 'literal' : 'escape'
}

export async function executeGenerationPlan(input: {
  signal?: AbortSignal
  onRouteSelected?: (params: ResolvedSourceControlAiGenerationParams) => void
  prompt?: string
  params: GenerateParams
  plan: CommitMessagePlan
  target: CommitMessageGenerationTarget
  emptyResultName: string
  operation: TextGenerationOperation
  spawnAgent: SpawnSourceControlAgent
}): Promise<InternalTextGenerationResult> {
  const deadline = input.operation.startsWith('auxiliary:')
    ? Date.now() + AUXILIARY_GENERATION_TIMEOUT_MS
    : undefined
  return executeWithAuxiliaryFallback({
    ...input,
    backslash: commandBackslashMode(input.target),
    execute: async (params, planned) => {
      let target = input.target
      if (planned?.ok && target.kind === 'local') {
        const env = target.prepareAgentEnv
          ? await target.prepareAgentEnv(params.agentId)
          : await prepareLocalCommitMessageAgentEnv(params.agentId, undefined, {
              runtime: target.wslDistro ? 'wsl' : 'host',
              wslDistro: target.wslDistro
            })
        if (!env.ok) {
          return { success: false, error: env.error }
        }
        target = { ...target, env: env.env }
      }
      if (input.signal?.aborted) {
        return CANCELED_AUXILIARY_RESULT
      }
      input.onRouteSelected?.(params)
      return executeSingleGenerationPlan({
        ...input,
        params,
        target,
        plan: planned?.ok ? planned.plan : input.plan,
        deadline
      })
    }
  })
}

async function executeSingleGenerationPlan(
  input: Parameters<typeof executeGenerationPlan>[0] & { deadline?: number }
): Promise<InternalTextGenerationResult> {
  const execute = (plan: CommitMessagePlan): Promise<InternalTextGenerationResult> => {
    const timeoutMs = input.deadline === undefined ? undefined : input.deadline - Date.now()
    if (timeoutMs !== undefined && timeoutMs <= 0) {
      return Promise.resolve({ success: false, error: `Generation timed out after ${AUXILIARY_GENERATION_TIMEOUT_MS / 1000}s.` })
    }
    return input.target.kind === 'remote'
      ? runRemoteSourceControlPlan({
          plan,
          target: input.target,
          operation: input.operation,
          timeoutMs
        })
      : runLocalPlanForAgent({
          agentId: input.params.agentId,
          plan,
          target: input.target,
          operation: input.operation,
          spawnAgent: input.spawnAgent,
          timeoutMs
        })
  }
  let result = await execute(input.plan)
  if (!result.success && input.params.agentId === 'opencode') {
    const retry = openCodeVariantRetryPlan(input.plan, result.failureOutput?.stderr ?? '')
    if (retry) {
      result = await execute(retry)
    }
  }
  // Why: only a custom command runs a raw model whose chat template can swallow
  // the opening think tag; a built-in agent's message may just mention the tag.
  // PR fields are JSON, so they strip only when parsing fails instead.
  if (
    !result.success ||
    !isCustomAgentId(input.params.agentId) ||
    input.operation === 'pull-request-fields'
  ) {
    return result
  }
  const answer = stripPrefilledReasoningPreamble(result.rawOutput)
  if (answer === result.rawOutput) {
    return result
  }
  const rawOutput = cleanGeneratedCommitMessage(answer)
  return rawOutput
    ? { ...result, rawOutput }
    : { success: false, error: `${input.plan.label} returned an empty ${input.emptyResultName}.` }
}
