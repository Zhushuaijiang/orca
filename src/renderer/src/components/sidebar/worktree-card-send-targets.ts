import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { deriveRunningAgentSendTargets } from '@/lib/running-agent-targets'
import {
  selectSendTargetControlInputs,
  selectSendTargetInputs
} from './worktree-card-send-target-inputs'

export type WorktreeAgentSendTarget = {
  status: 'eligible' | 'disabled' | 'sending'
  disabledReason?: string
}

/** Send-popover target state for the sidebar agent rows of one worktree. */
export function useWorktreeAgentSendTargets(worktreeId: string): {
  isAgentSendTargetModeActive: boolean
  sendTargetsByPaneKey: Map<string, WorktreeAgentSendTarget>
  handleSendTargetClick: (paneKey: string) => void
} {
  const { targetMode: agentSendPopoverTargetMode, agentStatusEpoch } = useAppStore(
    useShallow((s) => selectSendTargetControlInputs(s, worktreeId))
  )
  // Why: return a stable empty constant unless the send-target popover is ours, so churny pane-title/agent-status maps don't re-render idle bodies.
  const sendTargetInputs = useAppStore(useShallow((s) => selectSendTargetInputs(s, worktreeId)))
  const sendPromptToSidebarAgentTarget = useAppStore((s) => s.sendPromptToSidebarAgentTarget)

  const isAgentSendTargetModeActive = agentSendPopoverTargetMode !== null
  const sendTargetsByPaneKey = useMemo(() => {
    void agentStatusEpoch
    if (!isAgentSendTargetModeActive) {
      return new Map<string, WorktreeAgentSendTarget>()
    }

    return new Map(
      deriveRunningAgentSendTargets(sendTargetInputs, worktreeId).map((target) => [
        target.paneKey,
        agentSendPopoverTargetMode?.status === 'sending' &&
        agentSendPopoverTargetMode.sendingPaneKey === target.paneKey
          ? { status: 'sending' as const, disabledReason: 'Sending...' }
          : target.disabledReason
            ? { status: target.status, disabledReason: target.disabledReason }
            : { status: target.status }
      ])
    )
  }, [
    // Why: stale-boundary timers bump this epoch without replacing the status map, so re-derive when freshness flips.
    agentStatusEpoch,
    agentSendPopoverTargetMode?.sendingPaneKey,
    agentSendPopoverTargetMode?.status,
    isAgentSendTargetModeActive,
    // sendTargetInputs: stable empty when inactive, shallow bundle of the five maps when active — one ref covers all five deps.
    sendTargetInputs,
    worktreeId
  ])

  const handleSendTargetClick = useCallback(
    (paneKey: string) => {
      void sendPromptToSidebarAgentTarget(paneKey)
    },
    [sendPromptToSidebarAgentTarget]
  )

  return { isAgentSendTargetModeActive, sendTargetsByPaneKey, handleSendTargetClick }
}
