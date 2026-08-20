/* eslint-disable max-lines -- Why: context-menu actions share pane refs, focus
 * recovery, inherited-cwd split behavior, and agent-fork state in one hook. */
import { useCallback, useRef } from 'react'
import type { ManagedPane, PaneManager } from '@/lib/pane-manager/pane-manager'
import type { PtyTransport } from './pty-transport'
import type { PaneCwdMap } from './resolve-split-cwd'
import type { TerminalQuickCommand } from '../../../../shared/terminal-quick-command-types'
import { isTerminalAgentQuickCommand } from '../../../../shared/terminal-quick-commands'
import { sendTerminalQuickCommandToPane } from './terminal-quick-command-dispatch'
import { getConnectionId } from '@/lib/connection-context'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { pasteTerminalText } from './terminal-bracketed-paste'
import { pasteTerminalClipboard } from './terminal-clipboard-paste'
import {
  executeTerminalPastePlan,
  planTerminalPasteWithYield,
  type TerminalPasteSource,
  type TerminalPasteTextOptions
} from './terminal-paste-coordinator'
import { formatTerminalPasteExecutionError } from './terminal-paste-errors'
import { resolveTerminalPasteRuntime } from './terminal-paste-runtime'
import { getTerminalPasteSshRemotePlatform } from './terminal-paste-ssh-platform'
import { isTerminalPanePasteTargetCurrent } from './terminal-paste-target-state'
import { writeTerminalPastePtyInput } from './terminal-pty-paste-writer'
import { scheduleImagePasteWebglAtlasRecovery } from './terminal-webgl-atlas-recovery'
import { runQuickCommandInNewTab } from '@/lib/run-quick-command-in-new-tab'
import type { PreparedAgentSessionFork } from './terminal-agent-session-fork'
import type { AgentSessionContinuationRequest } from '@/lib/agent-session-continuation'
import { useAppStore } from '@/store'
import { recordTerminalUserInputForLeaf } from './terminal-input-activity'
import { applyYunxiaoRequirementTerminalPasteGate } from './yunxiao-terminal-paste-gate'
import {
  copyTerminalPaneMenuPaneId,
  copyTerminalPaneMenuSelection,
  copyTerminalPaneMenuTerminalId
} from './terminal-pane-menu-copy-actions'
import {
  continueAgentSessionFromMenuPane,
  copyAgentSessionContextFromMenuPane,
  forkAgentSessionFromMenuPane
} from './terminal-pane-menu-agent-session-actions'
import { useTerminalPaneSplitActions } from './use-terminal-pane-split-actions'
import { useTerminalContextMenuTrigger } from './use-terminal-context-menu-trigger'

type UseTerminalPaneContextMenuDeps = {
  managerRef: React.RefObject<PaneManager | null>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  paneCwdRef: React.RefObject<PaneCwdMap>
  containerRef: React.RefObject<HTMLDivElement | null>
  tabId: string
  worktreeId: string
  groupId: string | null
  fallbackCwd: string
  toggleExpandPane: (paneId: number) => void
  onRequestClosePane: (paneId: number) => void
  onClearPaneScrollback: (pane: ManagedPane) => void
  onSetTitle: (paneId: number) => void
  onClearPaneTitle: (paneId: number) => void
  onPasteError: (message: string) => void
  onAgentSessionForkReady: (fork: PreparedAgentSessionFork) => void
  onAgentSessionContinuationReady: (request: AgentSessionContinuationRequest) => void
  forceBracketedMultilineTextPaste: boolean
  rightClickToPaste: boolean
}

type TerminalMenuState = {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  point: { x: number; y: number }
  menuOpenedAtRef: React.RefObject<number>
  paneCount: number
  menuPaneId: number | null
  onContextMenuCapture: (event: React.MouseEvent<HTMLDivElement>) => void
  onPaneTitleContextMenu: (event: React.MouseEvent<HTMLElement>, paneId: number) => void
  onCopy: () => Promise<void>
  onSelectAll: () => void
  onCopyTerminalId: () => Promise<void>
  onCopyPaneId: () => Promise<void>
  onPaste: () => Promise<void>
  onSplitRight: () => void
  onSplitDown: () => void
  onEqualizePaneSizes: () => void
  onClosePane: () => void
  onClearScreen: () => void
  onForkAgentSession: () => Promise<void>
  onContinueAgentSessionInNewSession: () => void
  onCopyAgentSessionContext: () => Promise<void>
  onQuickCommand: (command: TerminalQuickCommand, historyId: string) => void
  onToggleExpand: () => void
  onSetTitle: () => void
  onClearPaneTitle: () => void
  runForPane: <Result>(paneId: number, action: () => Result) => Result
}

export function useTerminalPaneContextMenu({
  managerRef,
  paneTransportsRef,
  paneCwdRef,
  containerRef,
  tabId,
  worktreeId,
  groupId,
  fallbackCwd,
  toggleExpandPane,
  onRequestClosePane,
  onClearPaneScrollback,
  onSetTitle,
  onClearPaneTitle,
  onPasteError,
  onAgentSessionForkReady,
  onAgentSessionContinuationReady,
  forceBracketedMultilineTextPaste,
  rightClickToPaste
}: UseTerminalPaneContextMenuDeps): TerminalMenuState {
  const contextPaneIdRef = useRef<number | null>(null)

  const resolveMenuPane = useCallback((): ManagedPane | null => {
    const manager = managerRef.current
    if (!manager) {
      return null
    }
    const panes = manager.getPanes()
    if (contextPaneIdRef.current !== null) {
      const clickedPane = panes.find((pane) => pane.id === contextPaneIdRef.current) ?? null
      return clickedPane
    }
    return manager.getActivePane() ?? panes[0] ?? null
  }, [managerRef])

  const getShortcutPlatform = (): NodeJS.Platform => {
    if (navigator.userAgent.includes('Mac')) {
      return 'darwin'
    }
    return navigator.userAgent.includes('Windows') ? 'win32' : 'linux'
  }

  const isPanePasteTargetMounted = (
    pane: ManagedPane,
    transport: PtyTransport | undefined,
    ptyId: string | null
  ): boolean => {
    return isTerminalPanePasteTargetCurrent({
      manager: managerRef.current,
      paneTransports: paneTransportsRef.current,
      paneId: pane.id,
      leafId: pane.leafId,
      transport,
      ptyId
    })
  }

  const executeMenuPasteText = async (
    pane: ManagedPane,
    source: TerminalPasteSource,
    text: string,
    options?: TerminalPasteTextOptions
  ): Promise<boolean> => {
    const connectionId = getConnectionId(worktreeId) ?? null
    const transport = paneTransportsRef.current.get(pane.id)
    const ptyId = transport?.getPtyId() ?? null
    const shortcutPlatform = getShortcutPlatform()
    const gatedText = applyYunxiaoRequirementTerminalPasteGate(text, {
      tabId,
      leafId: pane.leafId,
      agentStatusByPaneKey: useAppStore.getState().agentStatusByPaneKey
    })
    const plan = await planTerminalPasteWithYield({
      text: gatedText,
      source,
      target: {
        kind: 'terminal',
        paneId: pane.id,
        leafId: pane.leafId,
        ptyId,
        runtime: resolveTerminalPasteRuntime({
          platform: shortcutPlatform,
          ptyId,
          connectionId,
          remotePlatform: getTerminalPasteSshRemotePlatform(connectionId),
          transport,
          isWindowsConpty: forceBracketedMultilineTextPaste
        })
      },
      forceBracketedPaste: options?.forceBracketedPaste,
      forceBracketedPasteForMultiline: options?.forceBracketedPasteForMultiline,
      terminalBracketedPasteMode: pane.terminal.modes.bracketedPasteMode
    })
    const execution = await executeTerminalPastePlan(plan, {
      pasteText: (pasteText, pasteOptions) =>
        pasteTerminalText(pane.terminal, pasteText, pasteOptions),
      writePty: (data) => writeTerminalPastePtyInput(transport, data),
      isTargetCurrent: () => isPanePasteTargetMounted(pane, transport, ptyId),
      canContinue: () => isPanePasteTargetMounted(pane, transport, ptyId)
    })
    if (execution.status !== 'pasted') {
      onPasteError(formatTerminalPasteExecutionError(execution.reason))
      return false
    }
    if (gatedText) {
      recordTerminalUserInputForLeaf(tabId, pane.leafId)
    }
    if (options?.recoverImagePasteWebglAtlas) {
      scheduleImagePasteWebglAtlasRecovery()
    }
    return true
  }

  const pasteResolvedPane = async (
    source: Extract<TerminalPasteSource, 'context-menu' | 'right-click'>
  ): Promise<void> => {
    const pane = resolveMenuPane()
    if (!pane) {
      return
    }
    const connectionId = getConnectionId(worktreeId) ?? null
    const runtimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(
      useAppStore.getState(),
      worktreeId
    )
    const result = await pasteTerminalClipboard({
      readClipboardText: window.api.ui.readClipboardText,
      saveClipboardImageAsTempFile: window.api.ui.saveClipboardImageAsTempFile,
      connectionId,
      runtimeEnvironmentId,
      forceBracketedMultilineTextPaste,
      pasteText: (text, options) => executeMenuPasteText(pane, source, text, options),
      onTextPasteError: () =>
        onPasteError('Paste failed: clipboard text is too large for a safe terminal paste.'),
      onImagePasteError: (error) => {
        const detail = error instanceof Error ? error.message : String(error)
        onPasteError(`Image paste failed: ${detail}`)
      }
    })
    if (result.status !== 'pasted') {
      return
    }
    // Why: Radix returns focus to the menu trigger (the pane container) on
    // close. Refocus only after a completed paste so rejected async targets
    // do not steal focus from the user's new control.
    pane.terminal.focus()
  }

  const { open, setOpen, point, menuOpenedAtRef, onContextMenuCapture, onPaneTitleContextMenu } =
    useTerminalContextMenuTrigger({
      managerRef,
      containerRef,
      contextPaneIdRef,
      rightClickToPaste,
      pasteResolvedPane
    })

  const { onSplitRight, onSplitDown } = useTerminalPaneSplitActions({
    managerRef,
    paneTransportsRef,
    paneCwdRef,
    contextPaneIdRef,
    tabId,
    fallbackCwd,
    resolveMenuPane
  })

  const agentSessionContext = {
    paneCwdRef,
    tabId,
    worktreeId,
    groupId,
    fallbackCwd,
    onAgentSessionForkReady,
    onAgentSessionContinuationReady
  }

  const onCopy = async (): Promise<void> => copyTerminalPaneMenuSelection(resolveMenuPane())

  const onSelectAll = (): void => {
    const pane = resolveMenuPane()
    if (pane) {
      pane.terminal.selectAll()
      pane.terminal.focus()
    }
  }

  const onCopyPaneId = async (): Promise<void> =>
    copyTerminalPaneMenuPaneId(resolveMenuPane(), tabId)

  const onCopyTerminalId = async (): Promise<void> =>
    copyTerminalPaneMenuTerminalId(resolveMenuPane(), tabId)

  const onPaste = async (): Promise<void> => pasteResolvedPane('context-menu')

  const onEqualizePaneSizes = (): void => {
    const pane = resolveMenuPane()
    const manager = managerRef.current
    if (!pane || !manager) {
      return
    }
    manager.equalizePaneSizes()
    pane.terminal.focus()
  }

  const onClosePane = (): void => {
    const pane = resolveMenuPane()
    if (pane && (managerRef.current?.getPanes().length ?? 0) > 1) {
      onRequestClosePane(pane.id)
    }
  }

  const onClearScreen = (): void => {
    const pane = resolveMenuPane()
    if (pane) {
      onClearPaneScrollback(pane)
    }
  }

  const onForkAgentSession = async (): Promise<void> =>
    forkAgentSessionFromMenuPane(agentSessionContext, resolveMenuPane())

  const onContinueAgentSessionInNewSession = (): void =>
    continueAgentSessionFromMenuPane(agentSessionContext, resolveMenuPane())

  const onCopyAgentSessionContext = async (): Promise<void> =>
    copyAgentSessionContextFromMenuPane(resolveMenuPane())

  const onQuickCommand = (command: TerminalQuickCommand, historyId: string): void => {
    if (isTerminalAgentQuickCommand(command)) {
      runQuickCommandInNewTab({ command, worktreeId, groupId, historyId })
      return
    }

    const pane = resolveMenuPane()
    if (!pane) {
      return
    }
    sendTerminalQuickCommandToPane({
      command,
      pane,
      tabId,
      transport: paneTransportsRef.current.get(pane.id)
    })
  }

  const onToggleExpand = (): void => {
    const pane = resolveMenuPane()
    if (pane) {
      toggleExpandPane(pane.id)
    }
  }

  /** Routes title edits through the resolved menu pane instead of active pane. */
  const handleSetTitle = (): void => {
    const pane = resolveMenuPane()
    if (pane) {
      onSetTitle(pane.id)
    }
  }

  /** Clears the title for the pane that opened the context menu. */
  const handleClearPaneTitle = (): void => {
    const pane = resolveMenuPane()
    if (pane) {
      onClearPaneTitle(pane.id)
    }
  }

  const runForPane = <Result>(paneId: number, action: () => Result): Result => {
    const previousPaneId = contextPaneIdRef.current
    contextPaneIdRef.current = paneId
    try {
      return action()
    } finally {
      contextPaneIdRef.current = previousPaneId
    }
  }

  // Why: PaneManager.getPanes() allocates public pane wrappers. Closed menus
  // do not need pane counts or target identity, so avoid that work on every
  // render across hundreds of mounted terminal tabs.
  const paneCount = open ? (managerRef.current?.getPanes().length ?? 1) : 1
  const menuPaneId = open ? (resolveMenuPane()?.id ?? null) : null

  return {
    open,
    setOpen,
    point,
    menuOpenedAtRef,
    paneCount,
    menuPaneId,
    onContextMenuCapture,
    onPaneTitleContextMenu,
    onCopy,
    onSelectAll,
    onCopyTerminalId,
    onCopyPaneId,
    onPaste,
    onSplitRight,
    onSplitDown,
    onEqualizePaneSizes,
    onClosePane,
    onClearScreen,
    onForkAgentSession,
    onContinueAgentSessionInNewSession,
    onCopyAgentSessionContext,
    onQuickCommand,
    onToggleExpand,
    onSetTitle: handleSetTitle,
    onClearPaneTitle: handleClearPaneTitle,
    runForPane
  }
}
