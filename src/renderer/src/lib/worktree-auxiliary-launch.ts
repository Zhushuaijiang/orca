import { useAppStore } from '@/store'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { getSettingsForWorktreeRuntimeOwner } from './worktree-runtime-owner'
import type { AuxiliaryTaskLaunch } from '../../../shared/auxiliary-task-launch'
import type { AuxiliaryTaskId } from '../../../shared/auxiliary-model-types'
import type { TuiAgent } from '../../../shared/tui-agent'

export async function resolveWorktreeAuxiliaryLaunch(args: {
  worktreeId: string
  task: AuxiliaryTaskId
  primaryAgent: TuiAgent
  agentOverride?: TuiAgent
}): Promise<AuxiliaryTaskLaunch> {
  const target = getActiveRuntimeTarget(
    getSettingsForWorktreeRuntimeOwner(useAppStore.getState(), args.worktreeId)
  )
  return await callRuntimeRpc<AuxiliaryTaskLaunch>(target, 'auxiliary.resolveLaunch', {
    worktree: toRuntimeWorktreeSelector(args.worktreeId),
    task: args.task,
    primaryAgent: args.primaryAgent,
    agentOverride: args.agentOverride
  })
}
