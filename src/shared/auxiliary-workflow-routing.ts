import type { GlobalSettings } from './global-settings-types'
import type { AiActionId, SourceControlActionRecipe } from './source-control-ai-actions'
import { SOURCE_CONTROL_LAUNCH_ACTION_IDS } from './source-control-ai-actions'
import { resolveAuxiliaryModelRoute } from './auxiliary-model-settings'
import { LOCAL_COMMIT_MESSAGE_HOST_KEY } from './commit-message-host-key'
import { resolveAgentSessionOptionLaunch } from './agent-session-option-launch'
import { removeAuxiliaryRecipeModelArgs } from './auxiliary-recipe-model-args'
import { quotePosixShell } from './wsl-login-shell-command'

export function applyAuxiliaryWorkflowRoute(
  settings: Partial<GlobalSettings> | null | undefined,
  actionId: AiActionId,
  recipe: SourceControlActionRecipe,
  hostKey?: string
): SourceControlActionRecipe {
  if (!SOURCE_CONTROL_LAUNCH_ACTION_IDS.some((id) => id === actionId)) {
    return recipe
  }
  const route = resolveAuxiliaryModelRoute(
    settings?.auxiliaryModels,
    actionId,
    settings?.defaultTuiAgent === 'blank' ? null : settings?.defaultTuiAgent
  )
  if (!route) {
    return recipe
  }
  const agent = route.agentId ?? recipe.agentId ?? settings?.defaultTuiAgent
  if (
    !agent ||
    agent === 'blank' ||
    agent === 'custom' ||
    settings?.disabledTuiAgents?.includes(agent)
  ) {
    return recipe
  }
  const key = hostKey ?? LOCAL_COMMIT_MESSAGE_HOST_KEY
  const model = route.modelsByHost?.[key]
  if (!model) {
    return { ...recipe, agentId: agent }
  }
  const effort = route.thinkingByHost?.[key]
  const values = { model, ...(effort ? { effort, thinking: effort, reasoningEffort: effort } : {}) }
  const existing = agent === recipe.agentId ? recipe.agentArgs : undefined
  const kept = removeAuxiliaryRecipeModelArgs(existing)
  const launch = resolveAgentSessionOptionLaunch(agent, values, [], false)
  return {
    ...recipe,
    agentId: agent,
    agentArgs: [kept, ...launch.args.map(quotePosixShell)].filter(Boolean).join(' ')
  }
}
