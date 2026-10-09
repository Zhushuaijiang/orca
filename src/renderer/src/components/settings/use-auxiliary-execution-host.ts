import { useAppStore } from '../../store'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { useActiveProjectSkillRuntime } from '@/hooks/useActiveProjectSkillRuntime'
import type { GlobalSettings } from '../../../../shared/global-settings-types'

export function useAuxiliaryExecutionHost(settings: GlobalSettings): string {
  const worktree = useAppStore((state) => state.activeWorktreeId)
  const host = useAppStore((state) =>
    getResolvedExecutionHostIdForWorktree(state, state.activeWorktreeId)
  )
  const { agentRuntime } = useActiveProjectSkillRuntime()
  if (!worktree) {
    const target = getActiveRuntimeTarget(settings)
    return target.kind === 'environment' ? `runtime:${target.environmentId}` : 'local'
  }
  if (!host) {
    return 'unknown'
  }
  return host === 'local' && agentRuntime?.runtime === 'wsl' && agentRuntime.wslDistro
    ? `wsl:${agentRuntime.wslDistro}`
    : host
}
