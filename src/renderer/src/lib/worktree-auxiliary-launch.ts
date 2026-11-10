import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { runtimeTargetForOwnerEnvironment } from '../runtime/rpc/targets/runtime-client-target'
import { toRuntimeWorktreeSelector } from '../runtime/rpc/targets/runtime-worktree-selector'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from './workspace/ownership/worktree-runtime-owner'
import type { AuxiliaryTaskLaunch } from '../../../shared/auxiliary-task-launch'
import type { AuxiliaryTaskId } from '../../../shared/auxiliary-model-types'
import type { TuiAgent } from '../../../shared/agent-launch/catalog/tui-agent'

export async function resolveWorktreeAuxiliaryLaunch(args: {
  worktreeId: string
  task: AuxiliaryTaskId
  primaryAgent: TuiAgent
  agentOverride?: TuiAgent
}): Promise<AuxiliaryTaskLaunch> {
  const target = runtimeTargetForOwnerEnvironment(
    runtimeEnvironmentIdOrLocalUnlessTwin(useAppStore.getState(), args.worktreeId)
  )
  return await callRuntimeRpc<AuxiliaryTaskLaunch>(target, 'auxiliary.resolveLaunch', {
    worktree: toRuntimeWorktreeSelector(args.worktreeId),
    task: args.task,
    primaryAgent: args.primaryAgent,
    agentOverride: args.agentOverride
  })
}
