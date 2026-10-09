import { resolveAuxiliaryGenerationParams } from './auxiliary-generation-routing'
import { resolveAuxiliaryModelRoute } from './auxiliary-model-settings'
import { normalizeSourceControlAiSettings as normalizeSettings } from './source-control-ai-settings'
import { normalizeRepoSourceControlAiOverrides as normalizeRepoOverrides } from './source-control-ai-repo-settings'
import type { ResolveSourceControlAiInput, ResolveSourceControlAiResult } from './source-control-ai'

export function resolveAuxiliarySourceControlOperation(
  input: ResolveSourceControlAiInput,
  resolveLegacySourceControlAiForOperation: (
    input: ResolveSourceControlAiInput
  ) => ResolveSourceControlAiResult
): ResolveSourceControlAiResult {
  let baseline = resolveLegacySourceControlAiForOperation(input)
  if (!baseline.ok) {
    const primary =
      input.primaryAgent ??
      (input.settings.defaultTuiAgent === 'blank' ? null : input.settings.defaultTuiAgent)
    const route = resolveAuxiliaryModelRoute(
      input.settings.auxiliaryModels,
      input.operation,
      primary
    )
    if (route?.agentId) {
      const source = normalizeSettings(
        input.settings.sourceControlAi,
        input.settings.commitMessageAi
      )
      baseline = resolveLegacySourceControlAiForOperation({
        ...input,
        settings: {
          ...input.settings,
          sourceControlAi: {
            ...source,
            agentId: route.agentId,
            actions: {
              ...source.actions,
              [input.operation]: { ...source.actions?.[input.operation], agentId: route.agentId }
            }
          }
        }
      })
    }
  }
  if (!baseline.ok) {
    return baseline
  }
  const repoOverrides =
    input.operation === 'conversationName'
      ? null
      : normalizeRepoOverrides(input.repo?.sourceControlAi)
  if (
    repoOverrides?.actionOverrides?.[input.operation]?.agentId !== undefined ||
    repoOverrides?.actionOverrides?.[input.operation]?.agentArgs !== undefined ||
    repoOverrides?.modelOverridesByOperation?.[input.operation]
  ) {
    return baseline
  }
  const resolved = resolveAuxiliaryGenerationParams(
    input.settings,
    input.operation,
    baseline.value.params,
    input.discoveryHostKey,
    input.primaryAgent
  )
  return resolved.ok
    ? { ok: true, value: { ...baseline.value, params: resolved.params } }
    : resolved
}
