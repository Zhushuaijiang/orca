import {
  getCommitMessageAgentSpec,
  getCommitMessageModel,
  resolveCommitMessageAgentChoice
} from './commit-message-agent-spec'
import { LOCAL_COMMIT_MESSAGE_HOST_KEY } from './commit-message-host-key'
import { resolveAuxiliaryModelRoute } from './auxiliary-model-settings'
import type { AuxiliaryTaskId } from './auxiliary-model-types'
import type { GlobalSettings } from './global-settings-types'
import type { ResolvedSourceControlAiGenerationParams } from './source-control-ai'
import { removeAuxiliaryRecipeModelArgs } from './auxiliary-recipe-model-args'
import type { TuiAgent } from './tui-agent'

export function getAuxiliaryBaselineAgentSpec(
  settings: Partial<
    Pick<GlobalSettings, 'defaultTuiAgent' | 'disabledTuiAgents' | 'auxiliaryModels'>
  >,
  task: AuxiliaryTaskId,
  primaryAgent?: TuiAgent | null
) {
  const primary =
    primaryAgent ?? (settings.defaultTuiAgent && settings.defaultTuiAgent !== 'blank'
      ? settings.defaultTuiAgent
      : null)
  const agent = resolveCommitMessageAgentChoice(null, primary, settings.disabledTuiAgents)
  const configured = resolveAuxiliaryModelRoute(settings.auxiliaryModels, task, primary)?.agentId
  return (
    (agent && agent !== 'custom' ? getCommitMessageAgentSpec(agent) : undefined) ??
    (configured ? getCommitMessageAgentSpec(configured) : undefined)
  )
}

export function resolveAuxiliaryGenerationParams(
  settings: Partial<
    Pick<GlobalSettings, 'defaultTuiAgent' | 'agentCmdOverrides' | 'disabledTuiAgents' | 'auxiliaryModels'>
  >,
  task: AuxiliaryTaskId,
  baseline: ResolvedSourceControlAiGenerationParams,
  hostKey = LOCAL_COMMIT_MESSAGE_HOST_KEY,
  primaryAgent?: TuiAgent | null
): { ok: true; params: ResolvedSourceControlAiGenerationParams } | { ok: false; error: string } {
  const route = resolveAuxiliaryModelRoute(
    settings.auxiliaryModels,
    task,
    primaryAgent ?? (settings.defaultTuiAgent && settings.defaultTuiAgent !== 'blank'
      ? settings.defaultTuiAgent
      : null)
  )
  if (!route) {
    return { ok: true, params: baseline }
  }
  const agentId = route.agentId ?? baseline.agentId
  const spec = agentId === 'custom' ? undefined : getCommitMessageAgentSpec(agentId)
  if (!spec || settings.disabledTuiAgents?.includes(spec.id)) {
    return { ok: false, error: `Auxiliary agent "${agentId}" is unavailable for ${task}.` }
  }
  const modelId =
    route.modelsByHost?.[hostKey] ??
    (agentId === baseline.agentId ? baseline.model : spec.defaultModelId)
  const model = getCommitMessageModel(spec.id, modelId)
  if (!model) {
    return { ok: false, error: `Auxiliary model "${modelId}" is unavailable for ${spec.label}.` }
  }
  const thinkingLevel =
    route.thinkingByHost?.[hostKey] ??
    (agentId === baseline.agentId && modelId === baseline.model
      ? baseline.thinkingLevel
      : model.defaultThinkingLevel)
  if (
    thinkingLevel &&
    model.thinkingLevels &&
    !model.thinkingLevels.some((level) => level.id === thinkingLevel)
  ) {
    return {
      ok: false,
      error: `Thinking level "${thinkingLevel}" is unavailable for ${model.label}.`
    }
  }
  const overridesModel = Boolean(route.modelsByHost?.[hostKey] || route.thinkingByHost?.[hostKey])
  const fallback = route.fallbackToDefault
    ? resolveAuxiliaryGenerationParams(
        {
          ...settings,
          auxiliaryModels: {
            defaults: { ...settings.auxiliaryModels?.defaults, fallbackToDefault: false }
          }
        },
        task,
        { ...baseline, fallbackCandidates: undefined },
        hostKey,
        primaryAgent
      )
    : undefined
  const params: ResolvedSourceControlAiGenerationParams = {
    ...baseline,
    agentId: spec.id,
    model: modelId,
    thinkingLevel,
    agentArgs:
      agentId === baseline.agentId
        ? overridesModel
          ? removeAuxiliaryRecipeModelArgs(baseline.agentArgs)
          : baseline.agentArgs
        : undefined,
    agentCommandOverride:
      (overridesModel
        ? removeAuxiliaryRecipeModelArgs(settings.agentCmdOverrides?.[spec.id])
        : settings.agentCmdOverrides?.[spec.id]
      )?.trim() || undefined,
    fallbackCandidates: fallback?.ok
      ? [{ ...fallback.params, fallbackCandidates: undefined }]
      : undefined
  }
  return { ok: true, params }
}
