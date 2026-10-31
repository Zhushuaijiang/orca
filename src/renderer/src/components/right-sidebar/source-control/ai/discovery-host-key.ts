import { useMemo } from 'react'
import { useActiveProjectSkillRuntime } from '@/hooks/useActiveProjectSkillRuntime'
import { getRuntimeGitScope } from '@/runtime/runtime-git-client-context'
import {
  getCommitMessageModelDiscoveryHostKeyForLocalRuntime,
  getCommitMessageModelDiscoveryHostKeyForScope
} from '../../../../../../shared/commit-message-host-key'
import type { SourceControlAiControllerParams } from './controller-types'

export function getSourceControlAiControllerDiscoveryHostKey(
  target: SourceControlAiControllerParams['target'],
  activeConnectionId: string | null | undefined,
  wslDistro?: string | null
): string {
  const scope = getRuntimeGitScope(target ?? { kind: 'local' }, activeConnectionId)
  // Why: local WSL agents route auxiliary models per distro, not as the plain local host.
  return !scope && wslDistro
    ? getCommitMessageModelDiscoveryHostKeyForLocalRuntime(wslDistro)
    : getCommitMessageModelDiscoveryHostKeyForScope(scope)
}

export function useSourceControlAiDiscoveryHostKey(
  target: SourceControlAiControllerParams['target'],
  activeConnectionId: string | null | undefined
): string {
  const { agentRuntime } = useActiveProjectSkillRuntime()
  const wslDistro = agentRuntime?.runtime === 'wsl' ? agentRuntime.wslDistro : undefined
  return useMemo(
    () => getSourceControlAiControllerDiscoveryHostKey(target, activeConnectionId, wslDistro),
    [activeConnectionId, target, wslDistro]
  )
}
