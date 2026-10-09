import { AUXILIARY_TASKS, type AuxiliaryTaskId } from './auxiliary-model-types'
import type { ResolvedSourceControlAiGenerationParams } from './source-control-ai'
import { quotePosixShell } from './wsl-login-shell-command'

export function buildAuxiliaryTaskPrompt(
  task: AuxiliaryTaskId,
  prompt: string,
  images: readonly string[] = []
): string {
  const definition = AUXILIARY_TASKS.find((entry) => entry.id === task)
  return [
    `Auxiliary task: ${definition?.title ?? task}.`,
    definition?.description ?? '',
    'Return the requested answer directly. Do not execute actions or modify files.',
    'This is an auxiliary execution. Do not invoke automatic task routing or start other agents.',
    ...(images.length
      ? ['Read and analyze these image files:', ...images.map((file) => JSON.stringify(file))]
      : []),
    '',
    'Task input:',
    prompt
  ].join('\n')
}

export function attachAuxiliaryImages(
  params: ResolvedSourceControlAiGenerationParams,
  images: readonly string[]
): ResolvedSourceControlAiGenerationParams {
  if (!images.length) {
    return params
  }
  if (
    params.agentId !== 'claude' &&
    params.agentId !== 'codex' &&
    params.agentId !== 'openclaude'
  ) {
    throw new Error('Auxiliary image requests currently require Claude or Codex.')
  }
  const fallbackCandidates = params.fallbackCandidates
    ?.filter((candidate) => ['claude', 'openclaude', 'codex'].includes(candidate.agentId))
    .map((candidate) =>
      attachAuxiliaryImages({ ...candidate, fallbackCandidates: undefined }, images)
    )
  const agentArgs =
    params.agentId === 'codex'
      ? [
          params.agentArgs ?? '',
          ...images.flatMap((file) => ['--image', quotePosixShell(file)])
        ].join(' ')
      : params.agentArgs
  return { ...params, agentArgs, fallbackCandidates }
}
