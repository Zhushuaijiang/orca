import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from './worktree-runtime-owner'
import type { AuxiliaryTaskLaunch } from '../../../shared/auxiliary-task-launch'
import type { AuxiliaryTaskId } from '../../../shared/auxiliary-model-types'
import type { TuiAgent } from '../../../shared/tui-agent'

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
