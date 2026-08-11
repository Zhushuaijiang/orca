import React, { useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle, LocateFixed } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import type { AiVaultAgent, AiVaultSession } from '../../../../shared/ai-vault-types'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { translate } from '@/i18n/i18n'
import { SessionActionMenuItems } from '../right-sidebar/AiVaultSessionActionMenuItems'
import {
  aiVaultSessionResumeLabel,
  aiVaultSessionRowResumeGating,
  resolveAiVaultSessionResumeState,
  type AiVaultSessionResumeState,
  type AiVaultSessionResumeTargetState
} from '../right-sidebar/ai-vault-session-resume'
import { useAiVaultSessionLaunchActions } from '../right-sidebar/ai-vault-session-launch-actions'
import { canContinueAiVaultSessionInNewSession } from '../right-sidebar/ai-vault-session-continuation'
import {
  canOpenAiVaultSessionLogInOrca,
  canUseLocalAiVaultSessionPathActions
} from '../right-sidebar/ai-vault-session-path-actions'
import { openAiVaultSessionLogInOrca } from '../right-sidebar/ai-vault-session-log-open'
import { AgentSessionContinuationDialog } from '@/components/agent-session-continuation/AgentSessionContinuationDialog'
import {
  CLOSE_ALL_CONTEXT_MENUS_EVENT,
  shouldSuppressContextMenuFollowUpClick,
  WORKTREE_CONTEXT_MENU_SCOPE_ATTR
} from './WorktreeContextMenu'
import { isEventTargetInsideCurrentTarget } from './worktree-card-dom-events'
import {
  EMPTY_AGENT_ROW_RESUME_TARGET_STATE,
  resolveAgentRowWorkspaceTarget,
  scanVaultForAgentRow,
  snapshotAgentRowResumeTargetState,
  type AgentRowWorkspaceTarget
} from './worktree-agent-session-resolution'

type SessionResolution =
  | { status: 'loading' }
  | {
      status: 'ready'
      session: AiVaultSession
      resumeState: AiVaultSessionResumeState
      workspace: AgentRowWorkspaceTarget
    }
  | { status: 'unavailable' }

type Props = {
  agent: DashboardAgentRowData
  worktreeId: string
  onActivate: (tabId: string, paneKey: string) => void
  children: React.ReactNode
}

/** Right-click session actions (AI Vault parity) for a sidebar agent row. */
export function WorktreeAgentSessionContextMenu({
  agent,
  worktreeId,
  onActivate,
  children
}: Props): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPoint, setMenuPoint] = useState({ x: 0, y: 0 })
  const [resolution, setResolution] = useState<SessionResolution>({ status: 'loading' })
  // Why: launch-action inputs are point-in-time snapshots taken when the menu
  // opens, so closed rows carry no store subscriptions.
  const [resumeTargetState, setResumeTargetState] = useState<AiVaultSessionResumeTargetState>(
    EMPTY_AGENT_ROW_RESUME_TARGET_STATE
  )
  const [agentCmdOverrides, setAgentCmdOverrides] = useState<
    Partial<Record<AiVaultAgent, string | null>> | undefined
  >(undefined)
  const scopeRef = useRef<HTMLDivElement | null>(null)
  const contextMenuOpenedAtRef = useRef<number | null>(null)

  const launchActions = useAiVaultSessionLaunchActions({
    activeWorktree: null,
    activeWorktreeId: null,
    targetState: resumeTargetState,
    agentCmdOverrides
  })

  const providerSessionId = agent.entry.providerSession?.id ?? ''
  const agentType = agent.agentType

  // Why: opening any sibling menu (worktree card, tab bar, …) closes this one.
  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const closeMenu = (): void => setMenuOpen(false)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    let cancelled = false
    setResolution({ status: 'loading' })
    const state = useAppStore.getState()
    const workspace = resolveAgentRowWorkspaceTarget(state, worktreeId)
    if (!workspace || !providerSessionId) {
      setResolution({ status: 'unavailable' })
      return
    }
    void scanVaultForAgentRow({ workspace, agentType, providerSessionId })
      .then((session) => {
        if (cancelled) {
          return
        }
        if (!session) {
          setResolution({ status: 'unavailable' })
          return
        }
        const resumeState = resolveAiVaultSessionResumeState({
          sessionFilePath: session.filePath,
          sessionExecutionHostId: session.executionHostId,
          worktreeInfo: {
            status: 'active',
            label: workspace.path,
            path: workspace.path,
            worktreeId: workspace.workspaceId
          },
          // Why: the resume target is always this row's workspace — never
          // whatever happens to be active.
          activeWorktreeId: null,
          worktrees: [],
          repos: [],
          targetState: snapshotAgentRowResumeTargetState(state)
        })
        setResolution({ status: 'ready', session, resumeState, workspace })
      })
      .catch(() => {
        if (!cancelled) {
          setResolution({ status: 'unavailable' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [menuOpen, worktreeId, agentType, providerSessionId])

  const handleJumpToOriginalPane = useCallback(() => {
    onActivate(agent.tab.id, agent.activationPaneKey ?? agent.paneKey)
  }, [agent.activationPaneKey, agent.paneKey, agent.tab.id, onActivate])

  const copyText = useCallback(async (text: string, label: string): Promise<void> => {
    await window.api.ui.writeClipboardText(text)
    toast.success(
      translate('auto.components.right.sidebar.AiVaultPanel.valueCopied', '{{value0}} copied', {
        value0: label
      })
    )
  }, [])

  const handleCopySessionId = useCallback(() => {
    void copyText(
      providerSessionId,
      translate('auto.components.right.sidebar.AiVaultPanel.sessionId', 'Session ID')
    )
  }, [copyText, providerSessionId])

  const suppressOpeningPointerEvent = useCallback((event: React.SyntheticEvent) => {
    const openedAt = contextMenuOpenedAtRef.current
    if (openedAt == null || !shouldSuppressContextMenuFollowUpClick(openedAt, Date.now())) {
      if (openedAt != null) {
        contextMenuOpenedAtRef.current = null
      }
      return
    }
    // Why: macOS ctrl-click can release over the just-opened menu, selecting
    // the item under the cursor unless the opening pointer sequence is ignored.
    event.preventDefault()
    event.stopPropagation()
    if (event.type === 'click') {
      contextMenuOpenedAtRef.current = null
    }
  }, [])

  const handleCloseAutoFocus = useCallback((event: Event) => {
    // Why: Radix otherwise restores focus to the hidden context-menu trigger.
    event.preventDefault()
    const sidebar = scopeRef.current?.closest('[data-worktree-sidebar]')
    if (sidebar instanceof HTMLElement) {
      sidebar.focus({ preventScroll: true })
    }
  }, [])

  return (
    <div
      ref={scopeRef}
      className="relative"
      {...{ [WORKTREE_CONTEXT_MENU_SCOPE_ATTR]: 'agent-session' }}
      onContextMenuCapture={(event) => {
        if (!isEventTargetInsideCurrentTarget(event.currentTarget, event.target)) {
          return
        }
        event.preventDefault()
        contextMenuOpenedAtRef.current = Date.now()
        window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
        const state = useAppStore.getState()
        setResumeTargetState(snapshotAgentRowResumeTargetState(state))
        setAgentCmdOverrides(state.settings?.agentCmdOverrides)
        const bounds = event.currentTarget.getBoundingClientRect()
        setMenuPoint({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
        setMenuOpen(true)
      }}
      onClickCapture={suppressOpeningPointerEvent}
    >
      {children}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            aria-hidden
            tabIndex={-1}
            className="pointer-events-none absolute size-px opacity-0"
            style={{ left: menuPoint.x, top: menuPoint.y }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-52"
          sideOffset={0}
          align="start"
          onPointerUpCapture={suppressOpeningPointerEvent}
          onPointerDownCapture={(event) => {
            if (event.button === 0) {
              contextMenuOpenedAtRef.current = null
            }
          }}
          onMouseUpCapture={suppressOpeningPointerEvent}
          onClickCapture={suppressOpeningPointerEvent}
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          {resolution.status === 'ready' ? (
            <ReadySessionMenuItems
              resolution={resolution}
              onJumpToOriginalPane={handleJumpToOriginalPane}
              onResume={launchActions.handleResume}
              onContinueInNewSession={launchActions.handleContinueInNewSession}
              onCopyResume={(session, targetWorktreeId) =>
                void launchActions.copyResumeCommand(session, targetWorktreeId)
              }
              onCopyId={(session) =>
                void copyText(
                  session.sessionId,
                  translate('auto.components.right.sidebar.AiVaultPanel.sessionId', 'Session ID')
                )
              }
              onCopyPath={(session) =>
                void copyText(
                  session.filePath,
                  translate('auto.components.right.sidebar.AiVaultPanel.logPath', 'Log path')
                )
              }
            />
          ) : (
            <>
              <DropdownMenuItem onSelect={handleJumpToOriginalPane}>
                <LocateFixed className="size-3.5" />
                {translate(
                  'auto.components.right.sidebar.AiVaultSessionRow.jumpToOriginalPane',
                  'Jump to Original Pane'
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {resolution.status === 'loading' ? (
                <DropdownMenuItem disabled>
                  <LoaderCircle className="size-3.5 animate-spin" />
                  {translate(
                    'auto.components.right.sidebar.AiVaultPanelControls.scanningSessions',
                    'Scanning sessions'
                  )}
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem disabled>
                    {translate(
                      'auto.components.right.sidebar.AiVaultPanel.noAgentSessionsFound',
                      'No agent sessions found'
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleCopySessionId}>
                    {translate(
                      'auto.components.right.sidebar.AiVaultSessionRow.copySessionId',
                      'Copy Session ID'
                    )}
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {launchActions.continuationRequest && (
        <AgentSessionContinuationDialog
          open
          request={launchActions.continuationRequest}
          onOpenChange={launchActions.handleContinuationDialogOpenChange}
        />
      )}
    </div>
  )
}

function ReadySessionMenuItems({
  resolution,
  onJumpToOriginalPane,
  onResume,
  onContinueInNewSession,
  onCopyResume,
  onCopyId,
  onCopyPath
}: {
  resolution: Extract<SessionResolution, { status: 'ready' }>
  onJumpToOriginalPane: () => void
  onResume: (session: AiVaultSession, worktreeId: string) => void
  onContinueInNewSession: (session: AiVaultSession, worktreeId: string) => void
  onCopyResume: (session: AiVaultSession, worktreeId?: string | null) => void
  onCopyId: (session: AiVaultSession) => void
  onCopyPath: (session: AiVaultSession) => void
}): React.JSX.Element {
  const { session, resumeState } = resolution
  const resumeGating = aiVaultSessionRowResumeGating(session, resumeState)
  const resumeWorktreeId = resumeState.worktreeId
  const canOpenLocalSessionPaths = canUseLocalAiVaultSessionPathActions(session.executionHostId)
  const sessionCwd = session.cwd
  return (
    <SessionActionMenuItems
      menuKind="dropdown"
      resumeDisabled={resumeGating.resumeDisabled}
      resumeLabel={aiVaultSessionResumeLabel(resumeState)}
      onResume={() => {
        if (resumeWorktreeId) {
          onResume(session, resumeWorktreeId)
        }
      }}
      onContinueInNewSession={
        resumeWorktreeId && canContinueAiVaultSessionInNewSession(session, resumeWorktreeId)
          ? () => onContinueInNewSession(session, resumeWorktreeId)
          : undefined
      }
      onJumpToOriginalPane={onJumpToOriginalPane}
      showJumpToWorktree={false}
      onCopyResume={
        resumeGating.canCopyResumeCommand
          ? () => onCopyResume(session, resumeWorktreeId)
          : undefined
      }
      onCopyId={() => onCopyId(session)}
      onCopyPath={() => onCopyPath(session)}
      onOpenLog={
        canOpenAiVaultSessionLogInOrca(session)
          ? () => void openAiVaultSessionLogInOrca(session)
          : undefined
      }
      onRevealLog={
        canOpenLocalSessionPaths
          ? () => void window.api.shell.openPath(session.filePath)
          : undefined
      }
      onOpenCwd={
        canOpenLocalSessionPaths && sessionCwd
          ? () => void window.api.shell.openPath(sessionCwd)
          : undefined
      }
      deleteBlockedReason={null}
      onDelete={() => {}}
    />
  )
}
