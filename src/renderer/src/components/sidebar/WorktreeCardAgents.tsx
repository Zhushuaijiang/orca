import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { activateTerminalTabOnOwner } from '@/lib/terminal-tab-owner-activation'
import DashboardAgentRow from '@/components/dashboard/DashboardAgentRow'
import { useNow } from '@/hooks/use-now'
import { useShallow } from 'zustand/react/shallow'
import { useWorktreeAgentSendTargets } from './worktree-card-send-targets'
import { useWorktreeAgentRows } from './useWorktreeAgentRows'
import { useWorktreeAgentDisplay } from './use-worktree-agent-display'
import { cn } from '@/lib/utils'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { dismissStaleAgentRowByKey } from '../terminal-pane/stale-agent-row'
import { requestBackgroundTerminalWorktreeMount } from '../terminal/background-terminal-worktree-mount'
import { useFocusedAgentPaneKey } from './focused-agent-row-highlight'
import {
  CompactAgentExpansion,
  CompactAgentRow,
  CompactAgentSummaryButton
} from './worktree-card-compact-agents'
import { buildAgentRowLineageTree } from '@/components/dashboard/agent-row-lineage-model'
import { revealCompactAgentCard } from './worktree-sidebar-reveal'
import { useWorktreeAgentExpansionState } from './worktree-card-agents-expansion-state'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { activateRetainedAgentRow } from './worktree-card-retained-agent-activation'
import { activateRetainedAgentRow as activateLiveRetainedAgentRow } from './activate-retained-agent-row'
import { shouldShowAgentSessionContextMenu } from './worktree-agent-session-resolution'
import { WorktreeAgentSessionContextMenu } from './worktree-agent-session-context-menu'
import { activateStructuredAgentSessionTab } from '@/lib/agent-session/structured-agent-session-tab-activation'
import { selectAgentRowsUnread } from './worktree-card-agent-ack-inputs'
import { opensClaudeParentConversation } from '@/lib/claude-agent-row-view'

export const SUPPRESS_WORKTREE_LIST_SCROLL_ADJUSTMENT_EVENT =
  'orca-suppress-worktree-list-scroll-adjustment'

const dispatchSuppressScrollAdjustment = () => {
  window.dispatchEvent(new CustomEvent(SUPPRESS_WORKTREE_LIST_SCROLL_ADJUSTMENT_EVENT))
}

type Props = {
  worktreeId: string
  agents?: DashboardAgentRowData[]
  className?: string
}

const WorktreeCardAgents = React.memo(function WorktreeCardAgents({
  worktreeId,
  agents: precomputedAgents,
  className
}: Props) {
  useUiLanguageRevision()
  const selectedAgents = useWorktreeAgentRows(worktreeId, precomputedAgents === undefined)
  const agents = precomputedAgents ?? selectedAgents
  if (agents.length === 0) {
    return null
  }
  // Only non-empty bodies mount the 30s clock, avoiding timer cost for idle worktrees.
  return <WorktreeCardAgentsBody worktreeId={worktreeId} agents={agents} className={className} />
})

type BodyProps = {
  worktreeId: string
  agents: DashboardAgentRowData[]
  className?: string
}

const WorktreeCardAgentsBody = React.memo(function WorktreeCardAgentsBody({
  worktreeId,
  agents,
  className
}: BodyProps) {
  useUiLanguageRevision()
  const { agentActivityDisplayMode, showAgentModels } = useWorktreeAgentDisplay()
  const dropAgentStatus = useAppStore((s) => s.dropAgentStatus)
  const dismissRetainedAgent = useAppStore((s) => s.dismissRetainedAgent)
  const { isAgentSendTargetModeActive, sendTargetsByPaneKey, handleSendTargetClick } =
    useWorktreeAgentSendTargets(worktreeId)
  const focusedAgentPaneKey = useFocusedAgentPaneKey(worktreeId)
  const compactAgentListRootRef = useRef<HTMLDivElement | null>(null)

  // Project global acknowledgement state onto this card’s rows to avoid rerenders from other worktrees.
  const agentRowsUnread = useAppStore(useShallow((s) => selectAgentRowsUnread(s, agents)))
  const unvisitedByPaneKey = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const [index, agent] of agents.entries()) {
      out[agent.paneKey] = agentRowsUnread[index] ?? false
    }
    return out
  }, [agents, agentRowsUnread])

  const handleDismissAgent = useCallback(
    (paneKey: string) => {
      dropAgentStatus(paneKey)
      dismissRetainedAgent(paneKey)
    },
    [dropAgentStatus, dismissRetainedAgent]
  )

  const handleActivateAgentTab = useCallback(
    (tabId: string, paneKey: string) => {
      const parsed = parsePaneKey(paneKey)
      if (!parsed) {
        // Why: malformed/legacy numeric keys can't be resolved after pane replay/remount, so drop the stale row instead of guessing.
        console.warn('[WorktreeCardAgents] malformed paneKey, skipping pane focus', paneKey)
        dismissStaleAgentRowByKey(paneKey)
        return
      }
      if (parsed.tabId !== tabId) {
        console.warn('[WorktreeCardAgents] paneKey tabId mismatch, dismissing row', {
          tabId,
          paneKey
        })
        dismissStaleAgentRowByKey(paneKey)
        return
      }
      // Why: design-doc rule — every user-initiated worktree switch must route through activateAndRevealWorktree (cross-repo activation + nav history).
      activateAndRevealWorktree(worktreeId)
      const tabs = useAppStore.getState().tabsByWorktree[worktreeId] ?? []
      if (tabs.some((t) => t.id === tabId)) {
        activateTabAndFocusPane(tabId, parsed.leafId, {
          ackPaneKeyOnSuccess: paneKey,
          flashFocusedPane: true,
          scrollToBottomIfOutputSinceLastView: true
        })
        activateTerminalTabOnOwner(worktreeId, tabId, parsed.leafId)
      } else if (!activateStructuredAgentSessionTab({ worktreeId, tabId })) {
        const liveEntry = useAppStore.getState().agentStatusByPaneKey[paneKey]
        if (liveEntry?.worktreeId === worktreeId) {
          // Why: orchestration worker status can be worktree-attributed before the renderer knows its tab; keep the live row and mount its terminal in the background instead of dismissing as stale.
          requestBackgroundTerminalWorktreeMount({ worktreeId, tabIds: [tabId] })
          // Why: a paired web owner still needs to know which tab this client revealed.
          activateTerminalTabOnOwner(worktreeId, tabId, parsed.leafId)
          return
        }
        dismissStaleAgentRowByKey(paneKey)
      }
    },
    [worktreeId]
  )
  const handleActivateRetainedAgent = useCallback(
    (tabId: string, paneKey: string) => {
      const state = useAppStore.getState()
      const hasTab = (state.tabsByWorktree[worktreeId] ?? []).some((tab) => tab.id === tabId)
      const hasStructuredTab = (state.unifiedTabsByWorktree[worktreeId] ?? []).some(
        (tab) => tab.id === tabId && tab.contentType === 'agent-session'
      )
      const retained = state.retainedAgentsByPaneKey[paneKey]
      if (!hasTab && !hasStructuredTab && retained?.entry.providerSession) {
        activateRetainedAgentRow({
          worktreeId,
          tabId,
          paneKey,
          activateLiveTab: handleActivateAgentTab
        })
        return
      }
      activateLiveRetainedAgentRow(worktreeId, tabId, paneKey)
    },
    [handleActivateAgentTab, worktreeId]
  )

  const now = useNow(30_000)
  const { rootRows: rootAgents, childrenByParentPaneKey } = useMemo(
    () => buildAgentRowLineageTree(agents),
    [agents]
  )
  const hasLineage = childrenByParentPaneKey.size > 0
  // Persist disclosure outside component state so virtualizer/sibling-triggered remounts cannot reset it.
  const {
    collapsedLineageParents,
    compactRootListExpanded,
    toggleLineageParent: toggleLineageParentState,
    toggleCompactRootList
  } = useWorktreeAgentExpansionState(worktreeId)

  // Reveal only user expansion; restoring cached expansion on remount must not scroll again.
  const previousCompactExpandedRef = useRef(compactRootListExpanded)
  useLayoutEffect(() => {
    const wasExpanded = previousCompactExpandedRef.current
    previousCompactExpandedRef.current = compactRootListExpanded
    if (!wasExpanded && compactRootListExpanded && agentActivityDisplayMode === 'compact') {
      dispatchSuppressScrollAdjustment()
      // Defer reveal one frame to avoid synchronous sidebar layout during the opening animation.
      const handle = requestAnimationFrame(() => {
        revealCompactAgentCard(compactAgentListRootRef.current)
      })
      return () => cancelAnimationFrame(handle)
    }
    return undefined
  }, [agentActivityDisplayMode, compactRootListExpanded])
  const toggleLineageParent = useCallback(
    (paneKey: string) => {
      dispatchSuppressScrollAdjustment()
      toggleLineageParentState(paneKey)
    },
    [toggleLineageParentState]
  )

  const stopBubble = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  const renderAgentBranch = (
    agent: DashboardAgentRowData,
    ancestorPaneKeys: ReadonlySet<string> = new Set()
  ): React.ReactNode => {
    if (ancestorPaneKeys.has(agent.paneKey)) {
      // External lineage metadata may cycle; reject repeated ancestors before recursion.
      return null
    }
    const childAgents = childrenByParentPaneKey.get(agent.paneKey) ?? []
    const hasChildAgents = childAgents.length > 0
    const expanded = !collapsedLineageParents.has(agent.paneKey)
    const sendTarget = isAgentSendTargetModeActive
      ? (sendTargetsByPaneKey.get(agent.paneKey) ?? {
          status: 'disabled' as const,
          disabledReason: translate(
            'auto.components.sidebar.WorktreeCardAgents.agentUnavailable',
            'Agent is not available'
          )
        })
      : undefined
    const descendantAncestorPaneKeys = new Set(ancestorPaneKeys)
    descendantAncestorPaneKeys.add(agent.paneKey)
    const onRowActivate =
      agent.rowSource === 'retained' ? handleActivateRetainedAgent : handleActivateAgentTab
    const agentRow = (
      <DashboardAgentRow
        agent={agent}
        showModel={showAgentModels}
        onDismiss={handleDismissAgent}
        onActivate={onRowActivate}
        now={now}
        // Why: bold the row until the user visits its tab (useAutoAckViewedAgent auto-acks on focus, muting it).
        isUnvisited={unvisitedByPaneKey[agent.paneKey] ?? false}
        // Why: inline rows are tight; 'md' reads as a second glyph users confuse with the adjacent identity icon, so use 'sm'.
        stateDotSize="sm"
        // Why: clicking the row jumps straight to the agent, so the expand chevron is redundant (keep the identity glyph).
        hideExpand
        // Why: fold children under the parent row's leading chevron so a parent reads as a tree node (Variant B in the mockups).
        childAgentCount={hasChildAgents ? childAgents.length : undefined}
        childAgentsExpanded={expanded}
        onToggleChildAgents={hasChildAgents ? () => toggleLineageParent(agent.paneKey) : undefined}
        isFocusedPane={agent.paneKey === focusedAgentPaneKey}
        sendTargetStatus={sendTarget?.status}
        sendTargetDisabledReason={sendTarget?.disabledReason}
        onSendTargetClick={isAgentSendTargetModeActive ? handleSendTargetClick : undefined}
        // Why: hierarchy shows via chevron + indent; legacy L-connectors use a fixed offset that mismatches the column and reads as floating fragments.
        hideLineageConnectors
      />
    )
    return (
      <React.Fragment key={agent.paneKey}>
        {shouldShowAgentSessionContextMenu(agent) ? (
          <WorktreeAgentSessionContextMenu
            agent={agent}
            worktreeId={worktreeId}
            onActivate={onRowActivate}
          >
            {agentRow}
          </WorktreeAgentSessionContextMenu>
        ) : (
          agentRow
        )}
        {hasChildAgents && expanded ? (
          <div className="worktree-agent-lineage-children">
            {childAgents.map((childAgent) =>
              renderAgentBranch(childAgent, descendantAncestorPaneKeys)
            )}
          </div>
        ) : null}
      </React.Fragment>
    )
  }

  const renderCompactAgentBranch = (
    agent: DashboardAgentRowData,
    ancestorPaneKeys: ReadonlySet<string> = new Set(),
    cacheTimerActive = true
  ): React.ReactNode => {
    if (ancestorPaneKeys.has(agent.paneKey)) {
      return null
    }
    const childAgents = childrenByParentPaneKey.get(agent.paneKey) ?? []
    const hasChildAgents = childAgents.length > 0
    const expanded = !collapsedLineageParents.has(agent.paneKey)
    const sendTarget = isAgentSendTargetModeActive
      ? (sendTargetsByPaneKey.get(agent.paneKey) ?? {
          status: 'disabled' as const,
          disabledReason: translate(
            'auto.components.sidebar.WorktreeCardAgents.agentUnavailable',
            'Agent is not available'
          )
        })
      : undefined
    const descendantAncestorPaneKeys = new Set(ancestorPaneKeys)
    descendantAncestorPaneKeys.add(agent.paneKey)
    const onRowActivate =
      agent.rowSource === 'retained' ? handleActivateRetainedAgent : handleActivateAgentTab
    const agentRow = (
      <CompactAgentRow
        agent={agent}
        showModel={showAgentModels}
        now={now}
        parentConversationDescription={
          opensClaudeParentConversation(agent)
            ? translate(
                'auto.lib.claudeAgentRowView.openParentConversation',
                'Open parent conversation'
              )
            : undefined
        }
        isUnvisited={unvisitedByPaneKey[agent.paneKey] ?? false}
        onActivate={onRowActivate}
        sendTargetStatus={sendTarget?.status}
        sendTargetDisabledReason={sendTarget?.disabledReason}
        onSendTargetClick={isAgentSendTargetModeActive ? handleSendTargetClick : undefined}
        childAgentCount={hasChildAgents ? childAgents.length : undefined}
        childAgentsExpanded={expanded}
        onToggleChildAgents={hasChildAgents ? () => toggleLineageParent(agent.paneKey) : undefined}
        isFocusedPane={agent.paneKey === focusedAgentPaneKey}
        cacheTimerActive={cacheTimerActive}
      />
    )
    // Keep collapsed children from occupying a separate flex-gap slot.
    return (
      <div key={agent.paneKey} className="min-w-0">
        {shouldShowAgentSessionContextMenu(agent) ? (
          <WorktreeAgentSessionContextMenu
            agent={agent}
            worktreeId={worktreeId}
            onActivate={onRowActivate}
          >
            {agentRow}
          </WorktreeAgentSessionContextMenu>
        ) : (
          agentRow
        )}
        {hasChildAgents ? (
          <CompactAgentExpansion expanded={expanded}>
            <div className="worktree-agent-lineage-children flex flex-col gap-0.5">
              {childAgents.map((childAgent) =>
                renderCompactAgentBranch(
                  childAgent,
                  descendantAncestorPaneKeys,
                  cacheTimerActive && expanded
                )
              )}
            </div>
          </CompactAgentExpansion>
        ) : null}
      </div>
    )
  }

  if (agentActivityDisplayMode === 'compact') {
    const summaryAgents = hasLineage ? rootAgents : agents
    // Collapse compact multi-agent lists except when their rows are the send-target picker.
    const shouldUseSummaryRow = summaryAgents.length > 1 && !isAgentSendTargetModeActive
    const subjectLabel = translate('sidebar.agentSummary.agentCount', '{{count}} agents', {
      count: hasLineage ? rootAgents.length : agents.length,
      defaultValue_one: '{{count}} agent'
    })

    return (
      <div
        ref={compactAgentListRootRef}
        className={cn('flex flex-col mt-1 gap-0.5', className)}
        onClick={stopBubble}
        onDoubleClick={stopBubble}
        onMouseDown={stopBubble}
        onPointerDown={stopBubble}
        role={hasLineage ? 'tree' : 'group'}
        aria-label={translate('auto.components.sidebar.WorktreeCardAgents.1b0a156717', 'Agents')}
        data-compact-agent-list="true"
      >
        {agents.length === 0 ? null : shouldUseSummaryRow ? (
          <div
            className={cn(
              'compact-agent-summary-panel',
              compactRootListExpanded && 'compact-agent-summary-panel-expanded'
            )}
          >
            <CompactAgentSummaryButton
              agents={summaryAgents}
              subjectLabel={subjectLabel}
              expanded={compactRootListExpanded}
              onToggle={() => {
                dispatchSuppressScrollAdjustment()
                toggleCompactRootList()
              }}
            />
            <CompactAgentExpansion expanded={compactRootListExpanded}>
              {rootAgents.map((rootAgent) =>
                renderCompactAgentBranch(rootAgent, new Set(), compactRootListExpanded)
              )}
            </CompactAgentExpansion>
          </div>
        ) : (
          rootAgents.map((rootAgent) => renderCompactAgentBranch(rootAgent))
        )}
      </div>
    )
  }

  return (
    // Gutter clicks must not bubble into card activation or metadata editing.
    <div
      className={cn('flex flex-col mt-1', className)}
      onClick={stopBubble}
      onDoubleClick={stopBubble}
      onMouseDown={stopBubble}
      onPointerDown={stopBubble}
      role={hasLineage ? 'tree' : 'group'}
      aria-label={translate('auto.components.sidebar.WorktreeCardAgents.1b0a156717', 'Agents')}
    >
      {rootAgents.map((rootAgent) => renderAgentBranch(rootAgent))}
    </div>
  )
})

export default WorktreeCardAgents
