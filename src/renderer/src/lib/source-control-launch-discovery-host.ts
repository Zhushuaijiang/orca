import type { AppState } from '@/store/types'
import { getConnectionId } from '@/lib/connection-context'
import { getLocalProjectExecutionRuntimeContext } from '@/lib/local-preflight-context'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'

export function resolveSourceControlDiscoveryHostKey(
  store: AppState,
  worktreeId: string,
  repoConnectionId: string | null
): string {
  // Why: auxiliary model routing keys on the host that runs the agent; a local WSL distro is its own host.
  const targetConnectionId = getConnectionId(worktreeId) ?? repoConnectionId
  const projectRuntime = targetConnectionId
    ? undefined
    : getLocalProjectExecutionRuntimeContext(store, worktreeId, CLIENT_PLATFORM)
  const executionHost = getResolvedExecutionHostIdForWorktree(store, worktreeId) ?? 'unknown'
  return executionHost === 'local' &&
    projectRuntime &&
    projectRuntime.status !== 'repair-required' &&
    projectRuntime.runtime.kind === 'wsl'
    ? `wsl:${projectRuntime.runtime.distro}`
    : executionHost
}
