import type { GlobalSettings } from '../../shared/global-settings-types'
import type { TuiAgent } from '../../shared/tui-agent'
import { resolveAuxiliaryModelRoute } from '../../shared/auxiliary-model-settings'
import { LOCAL_COMMIT_MESSAGE_HOST_KEY } from '../../shared/commit-message-host-key'
import { resolveAgentSessionOptionLaunch } from '../../shared/agent-session-option-launch'
import type { ReviewAgentSpawnSpec } from './review-agent-command'

export function resolveAuxiliaryReviewRoute(
  settings: GlobalSettings | undefined,
  task: 'skillReview' | 'skillCurator',
  primary: TuiAgent
) {
  let route = resolveAuxiliaryModelRoute(settings?.auxiliaryModels, task, primary)
  const explicit =
    settings?.auxiliaryModels?.byPrimaryAgent?.[primary]?.[task] ??
    settings?.auxiliaryModels?.tasks?.[task]
  if (!explicit && route?.agentId && !['claude', 'openclaude', 'kimi'].includes(route.agentId)) {
    route = undefined
  }
  const agent = route?.agentId ?? primary
  if (
    (route && !['claude', 'openclaude', 'kimi'].includes(agent)) ||
    settings?.disabledTuiAgents?.includes(agent)
  ) {
    throw new Error(`Auxiliary ${task} requires a guarded Claude or Kimi agent.`)
  }
  return { agent, route }
}

export function applyAuxiliaryReviewModel(
  spec: ReviewAgentSpawnSpec,
  selection: ReturnType<typeof resolveAuxiliaryReviewRoute>
): ReviewAgentSpawnSpec {
  const model = selection.route?.modelsByHost?.[LOCAL_COMMIT_MESSAGE_HOST_KEY]
  const effort = selection.route?.thinkingByHost?.[LOCAL_COMMIT_MESSAGE_HOST_KEY]
  if (!model) {
    return spec
  }
  const args =
    selection.agent === 'kimi'
      ? ['--model', model]
      : resolveAgentSessionOptionLaunch(
          'claude',
          { model, ...(effort ? { effort } : {}) },
          [],
          false
        ).args
  return { ...spec, args: [...spec.args, ...args] }
}
