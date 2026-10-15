import type { AuxiliaryTaskId } from './auxiliary-model-types'
import { resolveAuxiliaryModelRoute } from './auxiliary-model-settings'
import type { GlobalSettings } from './global-settings-types'
import type { TuiAgent } from './tui-agent'

export type AuxiliaryTaskLaunch = {
  agentId: TuiAgent
  modelId?: string
  thinkingLevel?: string
  hostKey: string
}

export function resolveAuxiliaryTaskLaunch(args: {
  settings: Pick<GlobalSettings, 'auxiliaryModels' | 'defaultTuiAgent' | 'disabledTuiAgents'>
  task: AuxiliaryTaskId
  hostKey: string
  primaryAgent?: TuiAgent
  agentOverride?: TuiAgent
}): AuxiliaryTaskLaunch {
  const primary = args.primaryAgent ?? args.settings.defaultTuiAgent
  const route = resolveAuxiliaryModelRoute(
    args.settings.auxiliaryModels,
    args.task,
    primary === 'blank' ? null : primary
  )
  const agentId = args.agentOverride ?? route?.agentId ?? primary
  if (!agentId || agentId === 'blank' || args.settings.disabledTuiAgents?.includes(agentId)) {
    throw new Error(`Choose an enabled auxiliary agent for ${args.task}.`)
  }
  // A per-run reviewer choice cannot inherit another provider's model or effort.
  const sameAgent = !route?.agentId || route.agentId === agentId
  return {
    agentId,
    hostKey: args.hostKey,
    ...(sameAgent && route?.modelsByHost?.[args.hostKey]
      ? { modelId: route.modelsByHost[args.hostKey] }
      : {}),
    ...(sameAgent && route?.thinkingByHost?.[args.hostKey]
      ? { thinkingLevel: route.thinkingByHost[args.hostKey] }
      : {})
  }
}
