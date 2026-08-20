import { useCallback, useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmationDialogProvider } from './components/confirmation-dialog'
import { BrowserWebAuthnAccountDialog } from './components/browser-webauthn-account-dialog'
import { LinkRoutingPreferenceDialogProvider } from './components/link-routing-preference-dialog'
import RecentTabSwitcher from './components/tab-bar/RecentTabSwitcher'
import { useGitStatusPolling } from './components/right-sidebar/useGitStatusPolling'
import { useEditorExternalWatch } from './hooks/useEditorExternalWatch'
import { useAutoAckViewedAgent } from './hooks/useAutoAckViewedAgent'
import { useUnreadDockBadge } from './hooks/useUnreadDockBadge'
import {
  resolvePrimarySelectionMiddleClickPaste,
  usePrimarySelectionPaste
} from './hooks/usePrimarySelectionPaste'
import { useAppMenuPaste } from './hooks/useAppMenuPaste'
import { useAppMenuSelectionActions } from './hooks/useAppMenuSelectionActions'
import { useLargeTextControlPaste } from './hooks/useLargeTextControlPaste'
import {
  canSkipRuntimeMobileSessionSyncKeyBuild,
  getRuntimeMobileSessionSyncKey,
  runtimeMobileSessionSyncKeysEqual,
  scheduleRuntimeGraphSync,
  setRuntimeGraphStoreStateGetter,
  setRuntimeGraphSyncEnabled
} from './runtime/sync-runtime-graph'
import { useWebSessionTabsSync } from './runtime/web-session-tabs-sync'
import { useGlobalFileDrop } from './hooks/useGlobalFileDrop'
import { MacosTccPromptNoticeHost } from './hooks/MacosTccPromptNoticeHost'
import { useRadixBodyPointerEventsRecovery } from './hooks/useRadixBodyPointerEventsRecovery'
import { registerUpdaterBeforeUnloadBypass } from './lib/updater-beforeunload'
import {
  ORCA_APP_RESTART_ABORTED_EVENT,
  ORCA_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT
} from '../../shared/updater-renderer-events'
import { ORCA_RENDERER_UNLOAD_PREVENTED_EVENT } from '../../shared/renderer-shutdown-events'
import {
  buildWorkspaceSessionPayload,
  shouldPersistWorkspaceSession
} from './lib/workspace-session'
import { createSessionWriteSubscriber } from './lib/session-write-subscriber'
import { sweepRestoredCodexPanesForStaleAccounts } from './lib/codex-stale-pane-sweep'
import { installCodexDetachedPaneRestartExecutor } from '@/components/terminal-pane/codex-detached-pane-restart-scheduler'
import { buildActiveViewUnloadPatch } from './lib/active-view-persist'
import {
  buildWorkspaceSessionHostSnapshots,
  fetchWorkspaceSessionWithRuntimeHostOwners,
  patchWorkspaceSessionByHost
} from './lib/workspace-session-host-persistence'
import {
  createShutdownCheckpointBeforeUnloadHandler,
  createShutdownCheckpointGuard
} from './lib/shutdown-checkpoint-guard'
import {
  collectFolderWorkspaceKeysFromSession,
  collectWorktreeHydrationRepoIdsFromSession
} from './lib/workspace-session-hydration-keys'
import {
  getStartupErrorFallbackUI,
  hydratePersistedUIAfterStartupRead
} from './lib/startup-ui-hydration'
import {
  logRendererStartupDiagnostic,
  timeRendererStartupStep,
  timeRendererStartupSyncStep
} from './startup/startup-diagnostics'
import { reconnectSshTargetForRendererStartup } from './startup/ssh-startup-reconnect'
import { shouldRenderPetOverlay } from './components/pet/pet-overlay-visibility'
import { applyDocumentTheme } from './lib/document-theme'
import { getSystemPrefersDark } from './lib/terminal-theme'
import { publishTerminalViewAttributesAtAppStart } from './components/terminal-pane/terminal-appearance'
import { isEditableTarget } from './lib/editable-target'
import { getSelectedTextForFileSearch } from './lib/file-search-selection'
import { useShortcutLabel } from './hooks/useShortcutLabel'
import {
  folderRelativePathToIncludeGlob,
  selectedExplorerFolderRelativePath
} from './components/right-sidebar/file-search-include-pattern'
import { shouldShowWorktreeHistoryControls } from './lib/titlebar-worktree-history-controls'
import {
  canGoBackWorktreeHistory,
  canGoForwardWorktreeHistory
} from '@/store/slices/worktree-nav-history'
import { selectFloatingVisibleTabCount } from './store/selectors'
import { selectActiveTerminalChromeState } from './store/active-terminal-chrome-selector'
import type { VirtualizedScrollAnchor } from './hooks/useVirtualizedScrollAnchor'
import type { RemoteWorkspacePatchResult } from '../../shared/remote-workspace-types'
import type { OnboardingState, UpdateStatus } from '../../shared/types'
import {
  getFeatureTipsAppOpenDecision,
  isCliFeatureTipCompleted
} from './components/feature-tips/feature-tip-startup-gate'
import {
  trackCmdJPaletteFeatureTipShown,
  trackOrcaCliFeatureTipShown
} from './components/feature-tips/feature-tip-telemetry'
import {
  keybindingMatchesAction,
  type KeybindingActionId,
  type KeybindingContext,
  type KeybindingMatchOptions,
  type PhysicalModifierToken
} from '../../shared/keybindings'
import { PLUGIN_COMMAND_ALIAS_ACTION_IDS } from '../../shared/plugins/plugin-command-actions'
import { registerAppCommandDispatcher } from '@/lib/app-command-dispatch'
import { executePluginCommand } from '@/lib/plugin-command-execution'
import { findPluginCommandForKeybinding } from '@/lib/plugin-command-keybindings'
import { usePluginCommands } from '@/store/plugin-panels'
import {
  getRepoExecutionHostId,
  isRuntimeOwnedSshTargetId,
  parseExecutionHostId,
  toRuntimeExecutionHostId,
  type ExecutionHostId
} from '../../shared/execution-host'
import { mapWithConcurrency } from '../../shared/map-with-concurrency'
import {
  ModifierDoubleTapDetector,
  toModifierDoubleTapEvent
} from '../../shared/modifier-double-tap-detector'
import { showTerminalShortcutCaptureNotification } from '@/lib/terminal-shortcut-capture-notification'
import { resolveMountedLazyModalIds, type LazyModalId } from './lazy-modal-mount-state'
import { translate } from '@/i18n/i18n'
import PinnedTabCloseDialog from './components/terminal-pane/PinnedTabCloseDialog'
import RunningTerminalCloseDialog from './components/terminal-pane/RunningTerminalCloseDialog'
import WorktreeBaseFallbackDialog from './components/WorktreeBaseFallbackDialog'
import { useUnreadDockBadge } from './hooks/useUnreadDockBadge'
import { AppBackgroundServices } from './app-shell/AppBackgroundServices'
import { AppRootSurfaces } from './app-shell/AppRootSurfaces'
import { AppWorkspaceShell } from './app-shell/AppWorkspaceShell'
import { WindowControls } from './app-shell/WindowControls'
import {
  MAC_TRAFFIC_LIGHTS_WIDTH,
  WINDOW_CONTROLS_HEIGHT,
  WINDOW_CONTROLS_WIDTH,
  hasCustomTitleBar
} from './app-shell/app-window-chrome'
import { useAppChromeLayout } from './app-shell/use-app-chrome-layout'
import { useAppSessionPersistence } from './app-shell/use-app-session-persistence'
import { useAppShellServices } from './app-shell/use-app-shell-services'
import { useAppStartupHydration } from './app-shell/use-app-startup-hydration'
import { useDocumentAppearance } from './app-shell/use-document-appearance'
import { useFloatingWorkspacePanel } from './app-shell/use-floating-workspace-panel'
import { useGlobalKeybindings } from './app-shell/use-global-keybindings'
import { useOnboardingAndFeatureTips } from './app-shell/use-onboarding-and-feature-tips'
import { usePersistedUIWriter } from './app-shell/use-persisted-ui-writer'
import { useRuntimeGraphSync } from './app-shell/use-runtime-graph-sync'
import { useWindowVisibilityEffects } from './app-shell/use-window-visibility-effects'

function App(): React.JSX.Element {
  const layout = useAppChromeLayout()
  const floatingWorkspace = useFloatingWorkspacePanel()
  const onboardingGate = useOnboardingAndFeatureTips()
  const clearUnreadDockBadge = useUnreadDockBadge()

  useAppShellServices()
  useAppStartupHydration(onboardingGate.applyStartupOnboardingState)
  useAppSessionPersistence()
  useRuntimeGraphSync()
  usePersistedUIWriter()
  useDocumentAppearance()
  useWindowVisibilityEffects()
  useGlobalKeybindings({ layout, floatingWorkspace })

  // Why: the same vars are set inline on .app-layout below, but portaled surfaces
  // (sheets, dialogs) mount outside it and would otherwise fall back to 0px and
  // render their controls under the Windows/Linux window-controls overlay.
  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--window-controls-width', WINDOW_CONTROLS_WIDTH)
    root.setProperty('--window-controls-height', WINDOW_CONTROLS_HEIGHT)
    root.setProperty('--mac-traffic-lights-width', MAC_TRAFFIC_LIGHTS_WIDTH)
  }, [])

  const { cancelReturnFocusFrame } = floatingWorkspace
  const setAppRootNode = useCallback(
    (node: HTMLDivElement | null): void => {
      // Why: these best-effort App chrome cleanups share the App root lifetime.
      if (!node) {
        cancelReturnFocusFrame()
        clearUnreadDockBadge()
      }
    },
    [cancelReturnFocusFrame, clearUnreadDockBadge]
  )

  const rememberFloatingTerminalReturnFocus = useCallback((): void => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) {
      floatingTerminalReturnFocusRef.current = null
      return
    }
    if (
      active.closest('[data-floating-terminal-panel]') ||
      active.closest('[data-floating-terminal-toggle]')
    ) {
      return
    }
    floatingTerminalReturnFocusRef.current = active
  }, [])

  const restoreFloatingTerminalReturnFocus = useCallback((): void => {
    const target = floatingTerminalReturnFocusRef.current
    floatingTerminalReturnFocusRef.current = null
    if (!target || !document.contains(target)) {
      return
    }
    cancelFloatingTerminalReturnFocusFrame()
    floatingTerminalReturnFocusFrameRef.current = requestAnimationFrame(() => {
      floatingTerminalReturnFocusFrameRef.current = null
      if (!document.contains(target)) {
        return
      }
      target.focus({ preventScroll: true })
    })
  }, [cancelFloatingTerminalReturnFocusFrame])

  const setFloatingTerminalOpenWithFocus = useCallback(
    (nextOpen: SetStateAction<boolean>): void => {
      const resolvedOpen =
        typeof nextOpen === 'function' ? nextOpen(floatingTerminalOpen) : nextOpen
      // Why: recordFeatureInteraction updates Zustand subscribers; running it inside the state updater logs a render-phase update warning.
      if (resolvedOpen && !floatingTerminalOpen) {
        const state = useAppStore.getState()
        floatingWorkspaceTourInteractionSnapshotRef.current =
          createFloatingWorkspaceTourInteractionSnapshot(state)
        rememberFloatingTerminalReturnFocus()
      } else if (!resolvedOpen && floatingTerminalOpen) {
        restoreFloatingTerminalReturnFocus()
      }
      setFloatingTerminalOpen(resolvedOpen)
      // Why gated on the flag: `settings` is undefined until it hydrates, so the
      // feature-off effect force-closes the panel on every boot. Persisting there would
      // overwrite the user's restored `open` with a value they never chose.
      if (floatingTerminalEnabled) {
        persistFloatingTerminalPanelOpen(resolvedOpen)
      }
    },
    [
      floatingTerminalEnabled,
      floatingTerminalOpen,
      rememberFloatingTerminalReturnFocus,
      restoreFloatingTerminalReturnFocus
    ]
  )

  useEffect(() => {
    const toggleFloatingTerminal = (): void => {
      if (floatingTerminalEnabled) {
        setFloatingTerminalOpenWithFocus((open) => !open)
      }
    }
    window.addEventListener(TOGGLE_FLOATING_TERMINAL_EVENT, toggleFloatingTerminal)
    return () => window.removeEventListener(TOGGLE_FLOATING_TERMINAL_EVENT, toggleFloatingTerminal)
  }, [floatingTerminalEnabled, setFloatingTerminalOpenWithFocus])

  useEffect(() => {
    // Why the hydration gate: this effect fires on every boot while settings are still
    // undefined, and closing there discards the restored open state before the real flag
    // value arrives. Only a hydrated flag-off is an actual disable.
    if (floatingTerminalSettingsHydrated && !floatingTerminalEnabled) {
      setFloatingTerminalOpenWithFocus(false)
    }
  }, [floatingTerminalSettingsHydrated, floatingTerminalEnabled, setFloatingTerminalOpenWithFocus])

  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const groupBy = useAppStore((s) => s.groupBy)
  const sortBy = useAppStore((s) => s.sortBy)
  const projectOrderBy = useAppStore((s) => s.projectOrderBy)
  const showSleepingWorkspaces = useAppStore((s) => s.showSleepingWorkspaces)
  const hideDefaultBranchWorkspace = useAppStore((s) => s.hideDefaultBranchWorkspace)
  const hideAutomationGeneratedWorkspaces = useAppStore((s) => s.hideAutomationGeneratedWorkspaces)
  const hideWorkspacesFromOtherDevices = useAppStore((s) => s.hideWorkspacesFromOtherDevices)
  const hideCliCreatedWorkspaces = useAppStore((s) => s.hideCliCreatedWorkspaces)
  const hideDetachedHeadWorkspaces = useAppStore((s) => s.hideDetachedHeadWorkspaces)
  const alwaysShowDefaultBranchWorkspace = useAppStore((s) => s.alwaysShowDefaultBranchWorkspace)
  const showDotfilesByWorktree = useAppStore((s) => s.showDotfilesByWorktree)
  const filterRepoIds = useAppStore((s) => s.filterRepoIds)
  const acknowledgedAgentsByPaneKey = useAppStore((s) => s.acknowledgedAgentsByPaneKey)
  const persistedUIReady = useAppStore((s) => s.persistedUIReady)
  const shouldMountContextualTourOverlay = activeContextualTourId !== null
  useOsc52ClipboardDefaultOnNotice(persistedUIReady)
  const shouldMountSetupGuideTelemetryObserver = persistedUIReady
  const shouldMountUpdateCard = shouldMountUpdateCardForStatus(updateStatus)
  const rightSidebarWidth = useAppStore((s) => s.rightSidebarWidth)
  const markdownTocPanelWidth = useAppStore((s) => s.markdownTocPanelWidth)
  const combinedDiffFileTreeWidth = useAppStore((s) => s.combinedDiffFileTreeWidth)
  const rightSidebarOpen = useAppStore((s) => s.rightSidebarOpen)
  const rightSidebarTab = useAppStore((s) => s.rightSidebarTab)
  const rightSidebarExplorerView = useAppStore((s) => s.rightSidebarExplorerView)
  const isFullScreen = useAppStore((s) => s.isFullScreen)
  const settings = useAppStore((s) => s.settings)
  const systemPrefersDark = useSystemPrefersDark()
  const leftSidebarStyle = useMemo(
    () => resolveLeftSidebarStyleVariables(settings, systemPrefersDark),
    [settings, systemPrefersDark]
  ) as React.CSSProperties | undefined
  const dictationState = useAppStore((s) => s.dictationState)
  const hasSshCredentialRequest = useAppStore((s) => s.sshCredentialQueue.length > 0)
  const shouldMountDictationController =
    settings?.voice?.enabled === true || dictationState !== 'idle'
  const primarySelectionMiddleClickPaste = resolvePrimarySelectionMiddleClickPaste(
    settings?.primarySelectionMiddleClickPaste
  )
  usePrimarySelectionPaste(primarySelectionMiddleClickPaste)

  useAppMenuPaste()
  useAppMenuSelectionActions()
  useLargeTextControlPaste()
  const petEnabled = useAppStore((s) => s.settings?.experimentalPet === true)
  const petVisible = useAppStore((s) => s.petVisible)
  const renderPetOverlay = shouldRenderPetOverlay({
    persistedUIReady,
    petEnabled,
    petVisible
  })
  const canGoBackWorktree = useAppStore(canGoBackWorktreeHistory)
  const canGoForwardWorktree = useAppStore(canGoForwardWorktreeHistory)
  const titlebarLeftControlsRef = useRef<HTMLDivElement | null>(null)
  const [collapsedSidebarHeaderWidth, setCollapsedSidebarHeaderWidth] = useState(0)
  const [mountedLazyModalIds, setMountedLazyModalIds] = useState<Set<LazyModalId>>(() => new Set())
  const [shouldMountAddRepoDialog, setShouldMountAddRepoDialog] = useState(false)
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null)
  const [onboardingLoaded, setOnboardingLoaded] = useState(false)
  const featureTipsPromptedThisSessionRef = useRef(false)
  const featureTipsSuppressedByOnboardingThisSessionRef = useRef(false)
  const unmountAddRepoDialogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [featureTipCliInstalled, setFeatureTipCliInstalled] = useState<boolean | null>(null)
  const shouldRenderOnboarding = onboarding !== null && shouldShowOnboarding(onboarding)

  useEffect(() => {
    if (activeModal === 'add-repo') {
      if (unmountAddRepoDialogTimerRef.current) {
        clearTimeout(unmountAddRepoDialogTimerRef.current)
        unmountAddRepoDialogTimerRef.current = null
      }
      setShouldMountAddRepoDialog(true)
      return
    }
    if (shouldMountAddRepoDialog && !unmountAddRepoDialogTimerRef.current) {
      // Why: AddRepoDialog's close effect aborts in-flight clone work; keep one closed render before unmounting hidden SSH/remote subscriptions.
      unmountAddRepoDialogTimerRef.current = setTimeout(() => {
        setShouldMountAddRepoDialog(false)
        unmountAddRepoDialogTimerRef.current = null
      }, 0)
    }
    return () => {
      if (unmountAddRepoDialogTimerRef.current) {
        clearTimeout(unmountAddRepoDialogTimerRef.current)
        unmountAddRepoDialogTimerRef.current = null
      }
    }
  }, [activeModal, shouldMountAddRepoDialog])

  // Subscribe to IPC push events
  useIpcEvents()
  useRemoteRuntimeRecoveryTriggers()
  useAutomationDispatchEvents()
  // Why: retention runs at App level (in <RetainedAgentsSyncGate />, a null leaf) so "done" agents survive card collapse and its high-churn subscriptions don't re-render App.
  // Why: git polling lives at App level (RightSidebar unmounts when closed, stranding stale Rebasing/Merging badges); gate on workspaceSessionReady so it doesn't compete with first paint.
  useGitStatusPolling({ enabled: workspaceSessionReady })
  // Why: wire file-change watching at App level so the editor keeps hearing FS changes when Explorer unmounts (right-sidebar switches to Source Control/Checks).
  useEditorExternalWatch()
  useGlobalFileDrop()
  useAutoAckViewedAgent()
  useEffect(() => {
    return onOnboardingReopened(setOnboarding)
  }, [])

  useEffect(() => {
    // Why: suppress tours until onboarding state is known (null = loading) so a first-run user can't mark a tour seen before onboarding appears.
    const suppressTours = !onboardingLoaded || shouldShowOnboarding(onboarding)
    actions.setContextualToursOnboardingVisible(suppressTours)
  }, [actions, onboarding, onboardingLoaded])

  useEffect(() => {
    if (!persistedUIReady || !onboardingLoaded || contextualToursAutoEligible !== null) {
      return
    }
    // Why: rollout targets first-run onboarding users; existing profiles are classified once and never auto-toured.
    actions.setContextualToursAutoEligible(shouldShowOnboarding(onboarding))
  }, [actions, contextualToursAutoEligible, onboarding, onboardingLoaded, persistedUIReady])

  useEffect(() => {
    if (!persistedUIReady) {
      return
    }

    let cancelled = false
    void window.api.cli
      .getInstallStatus()
      .then((status) => {
        if (cancelled) {
          return
        }
        setFeatureTipCliInstalled(isCliFeatureTipCompleted(status))
      })
      .catch(() => {
        if (!cancelled) {
          setFeatureTipCliInstalled(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [persistedUIReady])

  useEffect(() => {
    const featureTipsDecision = getFeatureTipsAppOpenDecision({
      activeModal,
      cliInstalled: featureTipCliInstalled,
      featureTipsSeenIds,
      featureInteractions,
      onboarding,
      persistedUIReady,
      promptedThisSession: featureTipsPromptedThisSessionRef.current,
      settings,
      suppressedByOnboardingThisSession: featureTipsSuppressedByOnboardingThisSessionRef.current
    })

    if (featureTipsDecision.kind === 'suppress-for-onboarding') {
      // Why: first-run users should finish onboarding without a second education modal in the same session.
      featureTipsSuppressedByOnboardingThisSessionRef.current = true
      return
    }

    if (featureTipsDecision.kind !== 'open') {
      return
    }

    featureTipsPromptedThisSessionRef.current = true
    if (featureTipsDecision.tipId === 'orca-cli') {
      trackOrcaCliFeatureTipShown('app_open')
    } else if (featureTipsDecision.tipId === 'cmd-j-palette') {
      trackCmdJPaletteFeatureTipShown('app_open')
    }
    // Why: mark seen on show so a quit/crash before dismiss doesn't reappear it next launch.
    actions.markFeatureTipsSeen([featureTipsDecision.tipId])
    actions.openModal('feature-tips', { source: 'app_open', tipId: featureTipsDecision.tipId })
  }, [
    activeModal,
    actions,
    featureTipCliInstalled,
    featureInteractions,
    featureTipsSeenIds,
    onboarding,
    persistedUIReady,
    settings
  ])

  // Why: useLayoutEffect fires before paint, so dispatching SYNC_FIT_PANES_EVENT reflows the terminal in the same frame as the width change — no wrongly-sized transient.
  useLayoutEffect(() => {
    window.dispatchEvent(new CustomEvent(SYNC_FIT_PANES_EVENT))
  }, [sidebarOpen, rightSidebarOpen])

  // Fetch initial data + hydrate GitHub cache from disk
  useEffect(() => {
    let cancelled = false
    // Why: declared outside the async block so cleanup can abort it — under StrictMode the first (unmounted) pass would otherwise keep spawning PTYs.
    const abortController = new AbortController()

    // Why (issue #1158): hydrate persisted UI right after ui.get() succeeds; the UI writer is gated only on persistedUIReady, so later default fallback would serialize defaults to disk.
    let uiHydrated = false
    // Why (issue #1158): track whether success-path reconnect started so the catch doesn't re-run it — re-entering on partially-mutated state would double-set ptyIds and drain pending* twice.
    let reconnectStarted = false
    void (async () => {
      const startupStartedAt = performance.now()
      logRendererStartupDiagnostic('startup-chain-start')
      try {
        // Why: nothing in the hydration chain reads profile state synchronously, so don't let it add a serial IPC round-trip before fetchSettings.
        void actions.fetchOrcaProfiles()
        // Why: repo/worktree hydration routes through settings.activeRuntimeEnvironmentId; load settings first so a persisted remote runtime doesn't hydrate stale local state.
        await timeRendererStartupStep('fetch-settings', () => actions.fetchSettings())
        // Why: hidden-at-launch PTYs can query OSC 10/11 before any pane mounts; publish view attributes as soon as settings exist so main's silent-until-push responder has data.
        publishTerminalViewAttributesAtAppStart(
          useAppStore.getState().settings,
          getSystemPrefersDark()
        )
        // Why: start keybindings + onboarding now so their IPC overlaps the local catalog scans; await them at their original spots. The .catch marks rejections handled if an earlier await throws first.
        // Why: browser session profiles are NOT started early — on a remote runtime the RPC may be unconnected and a failed fetch clears the list.
        const keybindingsPromise = timeRendererStartupStep('fetch-keybindings', () =>
          actions.fetchKeybindings()
        )
        keybindingsPromise.catch(() => {})
        const onboardingPromise = timeRendererStartupStep('onboarding-get', () =>
          window.api.onboarding.get()
        )
        onboardingPromise.catch(() => {})
        // Why: await ui.get() (not overlap) so persisted view settings hydrate before the local catalog/session steps and first paint reflects them.
        const persistedUI = await timeRendererStartupStep('ui-get', () => window.api.ui.get())
        uiHydrated = timeRendererStartupSyncStep('hydrate-persisted-ui', () =>
          hydratePersistedUIAfterStartupRead({
            persistedUI,
            cancelled,
            hydratePersistedUI: actions.hydratePersistedUI
          })
        )
        // Why: list-runtime-session-hosts reads no repo state, so overlap it with the repo scan
        // instead of paying its IPC round-trip serially before repos. .catch marks rejections handled
        // if an earlier await throws first; the value is awaited below and surfaces any error there.
        const runtimeHostsPromise = timeRendererStartupStep(
          'list-runtime-session-hosts',
          listRuntimeSessionHostIdsForStartup
        )
        runtimeHostsPromise.catch(() => {})
        // Why: saved remote runtimes can spend the full connect timeout; load only the local catalog for first paint and refresh remotes after hydration.
        await timeRendererStartupStep('fetch-repos-local', () =>
          actions.fetchReposForAllHosts({ remoteHosts: 'skip' })
        )
        await timeRendererStartupStep('repo-catalog-settlement', () =>
          actions.awaitLocalRepoCatalogSettlement()
        )
        // Why: folder workspaces merge against projectGroups (repos.ts fetchFolderWorkspacesForAllHosts),
        // so keep this chain ordered while overlapping it with session-scoped hydration.
        const localCatalogChain = (async () => {
          await timeRendererStartupStep('fetch-project-groups-local', () =>
            actions.fetchProjectGroupsForAllHosts({ remoteHosts: 'skip' })
          )
          await timeRendererStartupStep('fetch-folder-workspaces-local', () =>
            actions.fetchFolderWorkspacesForAllHosts({ remoteHosts: 'skip' })
          )
        })()
        const sessionReadPromise = runtimeHostsPromise.then((startupRuntimeHostIds) =>
          // Why: include saved runtime host ids so per-host worktree session slices restore from local settings without waiting on network reachability; unreadable partitions skip.
          timeRendererStartupStep('session-get', () =>
            fetchWorkspaceSessionWithRuntimeHostOwners(
              window.api.session,
              useAppStore.getState().repos,
              startupRuntimeHostIds
            )
          )
        )
        const hydrationSessionChain = sessionReadPromise.then(async (sessionRead) => {
          const hydrationRepoIds = collectWorktreeHydrationRepoIdsFromSession(
            sessionRead.session,
            sessionRead.runtimeHostIdByWorkspaceSessionKey
          )
          const hydrationRepoIdSet = new Set(hydrationRepoIds)
          const hydrationRepos = useAppStore.getState().repos.filter(
            (repo) =>
              hydrationRepoIdSet.has(repo.id) &&
              // Why: disconnected SSH repos hydrate from local metadata; only runtime-owned repos use placeholders.
              parseExecutionHostId(getRepoExecutionHostId(repo))?.kind !== 'runtime'
          )
          await timeRendererStartupStep('fetch-hydration-worktrees', () =>
            mapWithConcurrency(hydrationRepos, WORKTREE_REFRESH_CONCURRENCY, (repo) =>
              actions.fetchWorktrees(repo.id, { executionHostId: getRepoExecutionHostId(repo) })
            )
          )
          return sessionRead
        })
        // Why: wait for both writers to settle before recovery so neither can mutate hydrated state afterward.
        const [sessionOutcome, catalogOutcome] = await Promise.allSettled([
          hydrationSessionChain,
          localCatalogChain
        ])
        if (sessionOutcome.status === 'rejected') {
          throw sessionOutcome.reason
        }
        if (catalogOutcome.status === 'rejected') {
          throw catalogOutcome.reason
        }
        const sessionRead = sessionOutcome.value
        await keybindingsPromise
        await timeRendererStartupStep('repo-catalog-final-settlement', () =>
          actions.awaitLocalRepoCatalogSettlement()
        )
        if (!cancelled) {
          const sessionHydrationOptions = {
            additionalValidWorkspaceKeys: collectFolderWorkspaceKeysFromSession(sessionRead.session)
          }
          timeRendererStartupSyncStep('hydrate-session-stores', () => {
            actions.hydrateWorkspaceSession(sessionRead.session, {
              ...sessionHydrationOptions,
              runtimeHostIdByWorkspaceSessionKey: sessionRead.runtimeHostIdByWorkspaceSessionKey
            })
            actions.hydrateTabsSession(sessionRead.session, sessionHydrationOptions)
            actions.hydrateEditorSession(sessionRead.session, sessionHydrationOptions)
            actions.hydrateBrowserSession(sessionRead.session, sessionHydrationOptions)
          })
          // Why: prune visit timestamps AFTER hydration (earlier, worktreesByRepo may be empty and prune would drop entries for worktrees about to appear); seed the active worktree if missing.
          // See docs/cmd-j-empty-query-ordering.md.
          timeRendererStartupSyncStep('visit-timestamp-prune', () => {
            actions.pruneLastVisitedTimestamps()
            actions.seedActiveWorktreeLastVisitedIfMissing()
          })
          await timeRendererStartupStep('fetch-browser-session-profiles', () =>
            actions.fetchBrowserSessionProfiles()
          )
          const onboardingState = await onboardingPromise
          if (!cancelled) {
            setOnboarding(onboardingState)
            setOnboardingLoaded(true)
          }

          // Why: re-establish SSH before terminal reconnect so SSH-backed tabs route through pty.attach; passphrase targets defer to tab focus to avoid stacked credential dialogs.
          // Why: never dial runtime-owned (ephemeral-VM) targets from the renderer — ssh.connect would dispose the runtime layer's live relay session; filter them out here too.
          const connectionIds = (sessionRead.session.activeConnectionIdsAtShutdown ?? []).filter(
            (targetId) => !isRuntimeOwnedSshTargetId(targetId)
          )
          if (connectionIds.length > 0) {
            try {
              const SSH_RECONNECT_TIMEOUT_MS = 15_000
              const allTargets = await timeRendererStartupStep('ssh-list-targets', () =>
                window.api.ssh.listTargets()
              )
              const targetMap = new Map(allTargets.map((t) => [t.id, t]))
              const targets = connectionIds.map((targetId) => ({
                targetId,
                needsPassphrase: targetMap.get(targetId)?.lastRequiredPassphrase ?? false
              }))

              const eagerTargets = targets.filter((t) => !t.needsPassphrase)
              const deferredTargets = targets.filter((t) => t.needsPassphrase)

              if (deferredTargets.length > 0) {
                actions.setDeferredSshReconnectTargets(deferredTargets.map((t) => t.targetId))
              }

              // Why: treat timed-out eager targets as deferred so their PTYs reattach on tab focus (ssh.connect keeps running in main and likely finishes by then).
              const timedOutTargets: string[] = []
              await timeRendererStartupStep(
                'ssh-reconnect',
                () =>
                  Promise.all(
                    eagerTargets.map(async ({ targetId }) => {
                      const result = await reconnectSshTargetForRendererStartup({
                        targetId,
                        timeoutMs: SSH_RECONNECT_TIMEOUT_MS,
                        connect: (id) => window.api.ssh.connect({ targetId: id }),
                        publishState: actions.setSshConnectionState,
                        onFailure: (id, error) => {
                          console.warn(`SSH auto-reconnect failed for ${id}:`, error)
                        }
                      })
                      if (result.timedOut) {
                        timedOutTargets.push(targetId)
                      }
                    })
                  ),
                {
                  eagerTargets: eagerTargets.length,
                  deferredTargets: deferredTargets.length
                }
              )
              if (timedOutTargets.length > 0) {
                actions.setDeferredSshReconnectTargets([
                  ...deferredTargets.map((t) => t.targetId),
                  ...timedOutTargets
                ])
              }

              // Why: older/wrapped providers may return no state from connect; poll main once as a compatibility fallback before terminal restoration.
              for (const { targetId } of eagerTargets) {
                if (timedOutTargets.includes(targetId)) {
                  continue
                }
                try {
                  const state = await window.api.ssh.getState({ targetId })
                  console.warn(
                    `[ssh-restore] Polled state for ${targetId}: status=${state?.status}`
                  )
                  if (state?.status === 'connected') {
                    actions.setSshConnectionState(targetId, state)
                  }
                } catch {
                  /* best-effort */
                }
              }
            } catch (err) {
              console.warn('SSH startup reconnect failed:', err)
            }
          } else {
            logRendererStartupDiagnostic('ssh-reconnect-skipped', { connectionIds: 0 })
          }

          // Why: main overlaps daemon/hook startup with hydration, but restored terminals need those services ready before they spawn/reconnect PTYs.
          await timeRendererStartupStep('first-window-services-await', () =>
            window.api.app.awaitFirstWindowStartupServices()
          )
          await timeRendererStartupStep('recover-legacy-worker-terminals-pre-reconnect', () =>
            window.api.app.recoverLegacyWorkerTerminalsForRendererStartup()
          )
          await timeRendererStartupStep('terminal-provider-snapshot-capabilities', () => {
            return refreshTerminalProviderSnapshotCapabilities(
              collectTerminalProviderSnapshotPtyIds(useAppStore.getState())
            )
          })
          reconnectStarted = true
          await timeRendererStartupStep('reconnect-terminals', () =>
            actions.reconnectPersistedTerminals(abortController.signal)
          )
          await timeRendererStartupStep('recover-legacy-worker-terminals-post-reconnect', () =>
            window.api.app.recoverLegacyWorkerTerminalsForRendererStartup()
          )
          // Why here: reconnect just published restored PTY ids; sweeping them now
          // re-offers stale Codex panes whose tabs never mount this session.
          sweepRestoredCodexPanesForStaleAccounts(useAppStore.getState())
          syncZoomCSSVar()
          // Why (issue #1158): unlock the session writer only after hydration and all dependent steps succeeded, so a mid-startup throw can't serialize partially-mutated state to disk.
          actions.setHydrationSucceeded(true)
          logRendererStartupDiagnostic('startup-hydration-done', {
            durationMs: Math.round(performance.now() - startupStartedAt)
          })
          void (async () => {
            try {
              try {
                await timeRendererStartupStep('remote-catalog-refresh', async () => {
                  await actions.fetchReposForAllHosts()
                  await actions.fetchProjectGroupsForAllHosts()
                  await actions.fetchFolderWorkspacesForAllHosts()
                })
              } catch (err) {
                console.warn('Remote startup catalog refresh failed:', err)
              }
              if (!cancelled) {
                try {
                  await timeRendererStartupStep('remote-worktree-refresh', async () => {
                    // Why: the full scan is not required for session recovery, so keep it off the startup-critical path.
                    await actions.fetchAllWorktrees()
                    // Why: the startup prune only saw session-referenced repos; use the deferred scan's
                    // authoritative results to drop deleted-worktree visit timestamps that would
                    // otherwise accumulate unbounded (disconnected SSH stays non-authoritative and is kept).
                    actions.pruneLastVisitedTimestamps()
                    await actions.fetchWorktreeLineage()
                  })
                } catch (err) {
                  console.warn('Deferred startup worktree refresh failed:', err)
                }
              }
            } finally {
              if (!cancelled) {
                useAppStore.setState({ startupWorktreeRefreshCompleted: true })
              }
            }
          })()
        }
      } catch (error) {
        // Why (issue #1158): leave in-memory state untouched and keep hydrationSucceeded false (default-hydrating here once erased saved tabs); still flip the ready flags so the UI mounts.
        const stepLabel = error instanceof Error && error.message ? error.message : String(error)
        console.error(
          '[startup] Workspace session hydration failed; leaving disk state untouched:',
          stepLabel,
          error
        )
        if (!cancelled) {
          // Why: degraded mode stays interactive; later repo/runtime changes must not remain gated forever.
          useAppStore.setState({ startupWorktreeRefreshCompleted: true })
          // Why (issue #1158): only apply default UI if ui.get() never hydrated; otherwise defaults would clobber ui.json via the debounced writer.
          const fallbackUI = getStartupErrorFallbackUI(uiHydrated)
          if (fallbackUI) {
            actions.hydratePersistedUI(fallbackUI, 'startup')
          }
          // Why (issue #1158): sticky toast so the user knows they're in degraded "no-save" mode (hydrationSucceeded stays false); "Restart now" calls app.relaunch to recover.
          toast.error(translate('auto.App.12e77cf12b', 'Session restore failed'), {
            description: translate(
              'auto.App.0a9e810705',
              "Changes won't be saved until restart. Your previous tabs are safe on disk."
            ),
            duration: Infinity,
            dismissible: true,
            action: {
              label: translate('auto.App.caea5b51b9', 'Restart now'),
              onClick: () => {
                void window.api.app.relaunch()
              }
            }
          })
          // Why: reconnect flips workspaceSessionReady so the UI mounts, but hydrationSucceeded stays false so the session writer can't overwrite the file we failed to load.
          if (!reconnectStarted) {
            try {
              await window.api.app.awaitFirstWindowStartupServices()
              await window.api.app.recoverLegacyWorkerTerminalsForRendererStartup()
              await refreshTerminalProviderSnapshotCapabilities(
                collectTerminalProviderSnapshotPtyIds(useAppStore.getState())
              )
              await actions.reconnectPersistedTerminals(abortController.signal)
              await window.api.app.recoverLegacyWorkerTerminalsForRendererStartup()
            } catch (reconnectErr) {
              console.error(
                '[startup] reconnectPersistedTerminals failed in error path:',
                reconnectErr
              )
              // Why (issue #1158): the await may have run during StrictMode teardown; re-check !cancelled so a cancelled pass 1 doesn't stomp pass 2's hydration.
              if (!cancelled) {
                // Why (issue #1158): recovery threw too; force the flag so the shell still mounts, and clear pending* maps (normally drained by reconnect) to avoid phantom reconnects on dead PTYs.
                useAppStore.setState({
                  workspaceSessionReady: true,
                  pendingReconnectWorktreeIds: [],
                  pendingReconnectTabByWorktree: {},
                  pendingReconnectPtyIdByTabId: {}
                })
              }
            }
          } else {
            // Why (issue #1158): reconnect already started; re-running over its partially-mutated state would double-set ptyIds and drain pending* twice — force the flag, clear pending*.
            useAppStore.setState({
              workspaceSessionReady: true,
              pendingReconnectWorktreeIds: [],
              pendingReconnectTabByWorktree: {},
              pendingReconnectPtyIdByTabId: {}
            })
          }
        }
      }
      void actions.initGitHubCache()
    })()

    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [actions])

  useEffect(() => {
    setRuntimeGraphStoreStateGetter(useAppStore.getState)
    return () => {
      setRuntimeGraphStoreStateGetter(null)
    }
  }, [])

  useEffect(() => installCodexDetachedPaneRestartExecutor(), [])

  useEffect(() => {
    let previousKey = getRuntimeMobileSessionSyncKey(useAppStore.getState())
    return useAppStore.subscribe((state, previousState) => {
      // Why: this fires on every store mutation; read the cached prefers-dark snapshot instead of allocating a throwaway MediaQueryList via matchMedia each tick.
      const systemPrefersDark = getSystemPrefersDarkSnapshot()
      // Why: skip the key build when every input is reference-unchanged; the gate mirrors every field getRuntimeMobileSessionSyncKey uses.
      if (
        canSkipRuntimeMobileSessionSyncKeyBuild(
          state,
          previousState,
          systemPrefersDark,
          previousKey.systemPrefersDark
        )
      ) {
        return
      }
      const nextKey = getRuntimeMobileSessionSyncKey(
        state,
        previousState,
        previousKey,
        systemPrefersDark
      )
      if (runtimeMobileSessionSyncKeysEqual(nextKey, previousKey)) {
        return
      }
      previousKey = nextKey
      scheduleRuntimeGraphSync()
    })
  }, [])

  useEffect(() => registerUpdaterBeforeUnloadBypass(), [])

  useEffect(() => {
    setRuntimeGraphSyncEnabled(workspaceSessionReady)
    return () => {
      setRuntimeGraphSyncEnabled(false)
    }
  }, [workspaceSessionReady])

  // Why: session persistence only writes to disk; a Zustand subscribe() outside React drops ~15 render-cycle subscriptions and their re-renders on every tab/file/browser change.
  useEffect(() => {
    return createSessionWriteSubscriber({
      store: useAppStore,
      shouldSchedulePersist: () => !isRemoteWorkspaceSnapshotApplyInProgress(),
      persist: ({ patch }) => {
        const state = useAppStore.getState()
        // Why: route each host's worktree-scoped slice to its own partition; return the local write so the remote-workspace upload chain below keeps its ordering.
        const localWrite = patchWorkspaceSessionByHost(window.api.session, patch, state)
        void localWrite
        const hydratedTargetIds = Array.from(state.remoteWorkspaceHydratedTargetIds).filter(
          (targetId) => state.remoteWorkspaceSyncStatusByTargetId[targetId]?.phase !== 'conflict'
        )
        if (hydratedTargetIds.length > 0) {
          void localWrite
            .then(() => window.api.remoteWorkspace?.setForConnectedTargets({ hydratedTargetIds }))
            .then((results) => {
              for (const { targetId, result } of results ?? []) {
                applyRemoteWorkspacePatchStatus(targetId, result)
              }
            })
            .catch((err) => {
              for (const targetId of hydratedTargetIds) {
                useAppStore.getState().setRemoteWorkspaceSyncStatus(targetId, {
                  phase: 'error',
                  direction: 'push',
                  message: err instanceof Error ? err.message : 'Workspace upload failed'
                })
              }
            })
        }
      }
    })
  }, [])

  // On shutdown, capture terminal scrollback buffers and flush all durable
  // renderer state through one synchronous main-process checkpoint.
  useEffect(() => {
    // Why: beforeunload fires twice during a manual quit — once from the
    // synthetic dispatch in the onWindowCloseRequested handler (captures
    // good data while TerminalPanes are still mounted), and again from the
    // native window close triggered by confirmWindowClose(). Between these
    // two firings, PTY exit events can arrive and unmount TerminalPanes,
    // emptying shutdownBufferCaptures. The guard prevents the second call
    // from overwriting the good session data with an empty snapshot.
    const shutdownCheckpoint = createShutdownCheckpointGuard(() => {
      const shouldCaptureSession = shouldPersistWorkspaceSession(useAppStore.getState())
      if (shouldCaptureSession) {
        for (const capture of shutdownBufferCaptures.values()) {
          try {
            capture({ includeLocalBuffers: false })
          } catch {
            // Don't let one pane's failure block the rest.
          }
        }
        // Why: agent provider session ids live only in agentStatusByPaneKey,
        // which is in-memory. Capture them into the persisted sleeping-session
        // map so a daemon/session death while the app is closed can still
        // cold-restore via the agent's resume command (#5232).
        useAppStore.getState().captureAllSleepingAgentSessions('quit')
      }
      // Why: re-read state after capture() calls populated scrollback buffers
      // into the store via Zustand setters. The earlier read is only for the
      // gating flags and would miss those updates.
      const freshState = useAppStore.getState()
      const sessionSnapshots = shouldCaptureSession
        ? buildWorkspaceSessionHostSnapshots(buildWorkspaceSessionPayload(freshState), freshState)
        : []
      window.api.app.stageBeforeUnloadSync({
        sessions: sessionSnapshots,
        ui: buildActiveViewUnloadPatch(freshState)
      })
    })
    const persistBeforeUnload = createShutdownCheckpointBeforeUnloadHandler(shutdownCheckpoint)
    window.addEventListener('beforeunload', persistBeforeUnload)
    window.addEventListener(ORCA_APP_RESTART_ABORTED_EVENT, shutdownCheckpoint.reset)
    window.addEventListener(ORCA_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT, shutdownCheckpoint.reset)
    window.addEventListener(ORCA_RENDERER_UNLOAD_PREVENTED_EVENT, shutdownCheckpoint.reset)
    return () => {
      window.removeEventListener('beforeunload', persistBeforeUnload)
      window.removeEventListener(ORCA_APP_RESTART_ABORTED_EVENT, shutdownCheckpoint.reset)
      window.removeEventListener(
        ORCA_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT,
        shutdownCheckpoint.reset
      )
      window.removeEventListener(ORCA_RENDERER_UNLOAD_PREVENTED_EVENT, shutdownCheckpoint.reset)
    }
  }, [])

  // Why: beforeunload never fires on a hard kill (crash, forced update, TerminateProcess), so periodically capture agent session ids (not scrollback) so live agents keep a resume record.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!shouldPersistWorkspaceSession(useAppStore.getState())) {
        return
      }
      useAppStore.getState().captureAllSleepingAgentSessions('periodic')
    }, SLEEPING_AGENT_RESUME_CAPTURE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [])

  // Why: subscribe at the always-mounted App root — Terminal owns the confirm flow but isn't mounted on the landing page, so subscribing there left File→Exit / Ctrl+Q with no listener (#5144).
  useEffect(() => {
    return window.api.ui.onWindowCloseRequested(dispatchWindowCloseRequest)
  }, [])

  // Why no periodic scrollback save: the old 3-min re-serialize (#461) stalled the main thread for seconds; the out-of-process daemon (#729) is the durable replacement, non-daemon users lose in-session scrollback on unexpected exit.

  useEffect(() => {
    if (!persistedUIReady) {
      return
    }

    const timer = window.setTimeout(() => {
      void window.api.ui.set({
        sidebarWidth,
        rightSidebarOpen,
        rightSidebarTab,
        rightSidebarExplorerView,
        rightSidebarWidth,
        markdownTocPanelWidth,
        combinedDiffFileTreeWidth,
        groupBy,
        sortBy,
        projectOrderBy,
        showActiveOnly: false,
        hideSleepingWorkspaces: !showSleepingWorkspaces,
        showSleepingWorkspaces,
        hideDefaultBranchWorkspace,
        hideAutomationGeneratedWorkspaces,
        hideCliCreatedWorkspaces,
        hideDetachedHeadWorkspaces,
        hideWorkspacesFromOtherDevices,
        alwaysShowDefaultBranchWorkspace,
        showDotfilesByWorktree,
        filterRepoIds,
        // Why (#9002): activeView is deliberately NOT included here. It used to
        // ride this same 150ms writer (#8265), which meant every top-level view
        // switch scheduled a full durable-state save. The narrow preference
        // effect below persists it without touching the recovery snapshot.
        // Why: rides the same debounced save so dashboard auto-acks (which fire
        // on focus/visibility) and the in-memory ack cleanup paths in
        // agent-status.ts (close/dismiss) both flow to disk through map
        // identity changes. Without persisting, agent rows that survive
        // restart come back bold even when the user had already visited them.
        acknowledgedAgentsByPaneKey
      })
    }, 150)

    return () => window.clearTimeout(timer)
  }, [
    persistedUIReady,
    sidebarWidth,
    rightSidebarOpen,
    rightSidebarTab,
    rightSidebarExplorerView,
    rightSidebarWidth,
    markdownTocPanelWidth,
    combinedDiffFileTreeWidth,
    groupBy,
    sortBy,
    projectOrderBy,
    showSleepingWorkspaces,
    hideDefaultBranchWorkspace,
    hideAutomationGeneratedWorkspaces,
    hideCliCreatedWorkspaces,
    hideDetachedHeadWorkspaces,
    hideWorkspacesFromOtherDevices,
    alwaysShowDefaultBranchWorkspace,
    showDotfilesByWorktree,
    filterRepoIds,
    acknowledgedAgentsByPaneKey
  ])

  // Why (#9002): activeView has its own tiny profile preference, so it can track
  // every switch without scheduling the multi-MB durable-state writer.
  useEffect(() => {
    if (!persistedUIReady) {
      return
    }
    void window.api.ui.set({ activeView })
  }, [activeView, persistedUIReady])

  // Apply theme to document
  useEffect(() => {
    if (!settings) {
      return
    }

    if (settings.theme === 'dark') {
      applyDocumentTheme('dark')
      return undefined
    } else if (settings.theme === 'light') {
      applyDocumentTheme('light')
      return undefined
    } else {
      // system
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyDocumentTheme('system')
      const handler = (): void => {
        applyDocumentTheme('system')
        // System theme changes don't mutate the store, so mobile terminal colors need an explicit graph republish.
        scheduleRuntimeGraphSync()
      }
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [settings])

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--app-font-family',
      buildAppFontFamily(settings?.appFontFamily)
    )
  }, [settings?.appFontFamily])

  // Refresh GitHub data (PR/issue status) when window regains focus
  useEffect(() => {
    const handler = (): void => {
      if (document.visibilityState === 'visible') {
        actions.refreshAllGitHub()
        actions.bumpGitHubPRVisibleRefreshGeneration()
      } else {
        actions.reportVisibleGitHubPRRefreshCandidates([], Date.now())
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [actions])

  // Why (STA-2383): macOS throttles the backgrounded window; on occlusion-uncover only `focus`
  // fires (invalidate-only), so the app-shell's dvh height stays stale and the bottom status bar
  // is clipped off-screen until a manual resize. Relay the genuine hidden→visible reveal so main
  // runs the same full repaint (size jiggle) that show/restore/resume get, recomputing the layout.
  useEffect(() => {
    if (!isMac || isPairedWebClientWindow()) {
      return
    }
    const handler = (): void => {
      if (document.visibilityState !== 'visible') {
        return
      }
      window.api?.ui?.notifyWindowRevealed?.()
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  const hasTabBar = tabCount >= 2
  const showTitlebarExpandButton = workspaceChromeActive && !hasTabBar && effectiveActiveTabExpanded
  // Activity/Space are full-page navigation surfaces (like Settings), so the worktree sidebar is hidden there.
  const showSidebar =
    activeView !== 'settings' &&
    activeView !== 'activity' &&
    activeView !== 'space' &&
    activeView !== 'skills'
  // Tasks/Landing show the full titlebar only when the sidebar is collapsed; open, they mirror workspace view (creation suppresses it).
  const stackedSidebarOpen =
    !workspaceChromeActive && !creationLayoutActive && showSidebar && sidebarOpen
  // Visible creation keeps only the top-left window chrome; tabs and right-sidebar chrome stay gated by workspaceChromeActive.
  const leftTitlebarChromeLayout = resolveLeftTitlebarChromeLayout({
    workspaceChromeActive,
    stackedSidebarOpen,
    creationLayoutActive,
    sidebarOpen
  })
  // Full-page navigation surfaces own the whole content area, so suppress right-sidebar controls.
  const showRightSidebarControls = !creationLayoutActive && canShowRightSidebarForView(activeView)
  const handleToggleExpand = (): void => {
    if (!effectiveActiveTabId) {
      return
    }
    window.dispatchEvent(
      new CustomEvent(TOGGLE_TERMINAL_PANE_EXPAND_EVENT, {
        detail: { tabId: effectiveActiveTabId }
      })
    )
  }

  const globalShortcutStateRef = useRef({
    activeView,
    activeWorktreeId,
    actions,
    floatingTerminalEnabled,
    floatingTerminalOpen,
    floatingVisibleTabCount,
    keybindings,
    pluginCommands,
    terminalShortcutPolicy: settings?.terminalShortcutPolicy,
    setFloatingTerminalOpenWithFocus,
    workspaceChromeActive,
    creationLayoutActive
  })
  // Window key listeners are global and long-lived: one registration, but the handler reads current shortcut state each key event.
  globalShortcutStateRef.current = {
    activeView,
    activeWorktreeId,
    actions,
    floatingTerminalEnabled,
    floatingTerminalOpen,
    floatingVisibleTabCount,
    keybindings,
    pluginCommands,
    terminalShortcutPolicy: settings?.terminalShortcutPolicy,
    setFloatingTerminalOpenWithFocus,
    workspaceChromeActive,
    creationLayoutActive
  }

  useEffect(() => {
    const doubleTapDetector = new ModifierDoubleTapDetector()

    const createRegisteredCommandHandlers = (
      input?: ShortcutDispatchInput,
      keybindingContext: KeybindingContext = 'app'
    ): Map<KeybindingActionId, () => boolean> => {
      const {
        activeView,
        activeWorktreeId,
        actions,
        floatingTerminalEnabled,
        floatingTerminalOpen,
        terminalShortcutPolicy,
        keybindings,
        setFloatingTerminalOpenWithFocus,
        workspaceChromeActive,
        creationLayoutActive
      } = globalShortcutStateRef.current
      const floatingWorkspaceFocused = isFloatingWorkspacePanelFocused()
      const canRevealRightSidebar = !creationLayoutActive && canShowRightSidebarForView(activeView)
      const claim = (actionId: KeybindingActionId, run: () => void): boolean => {
        input?.preventDefault()
        if (
          input &&
          keybindingContext === 'terminal' &&
          (terminalShortcutPolicy ?? 'orca-first') === 'orca-first'
        ) {
          showTerminalShortcutCaptureNotification({
            actionId,
            platform: shortcutPlatform,
            keybindings
          })
        }
        run()
        return true
      }

      return new Map<KeybindingActionId, () => boolean>([
        [
          'worktree.history.back',
          () => {
            if (creationLayoutActive || !shouldShowWorktreeHistoryControls(activeView)) {
              return false
            }
            return claim('worktree.history.back', () => useAppStore.getState().goBackWorktree())
          }
        ],
        [
          'worktree.history.forward',
          () => {
            if (creationLayoutActive || !shouldShowWorktreeHistoryControls(activeView)) {
              return false
            }
            return claim('worktree.history.forward', () =>
              useAppStore.getState().goForwardWorktree()
            )
          }
        ],
        ['sidebar.left.toggle', () => claim('sidebar.left.toggle', () => actions.toggleSidebar())],
        [
          'sidebar.sleepingWorkspaces.toggle',
          () =>
            claim('sidebar.sleepingWorkspaces.toggle', () => {
              const store = useAppStore.getState()
              const nextShowSleeping = !store.showSleepingWorkspaces
              store.setShowSleepingWorkspaces(nextShowSleeping)
              if (nextShowSleeping) {
                store.setSidebarOpen(true)
              }
            })
        ],
        [
          'floatingWorkspace.maximize',
          () => {
            if (floatingTerminalOpen || !floatingTerminalEnabled) {
              return false
            }
            return claim('floatingWorkspace.maximize', () => {
              requestFloatingTerminalOpenMaximized()
              setFloatingTerminalOpenWithFocus(true)
            })
          }
        ],
        [
          'tab.rename',
          () => {
            const store = useAppStore.getState()
            if (
              !workspaceChromeActive ||
              floatingWorkspaceFocused ||
              store.activeTabType !== 'terminal' ||
              !store.activeTabId
            ) {
              return false
            }
            return claim('tab.rename', () => store.setRenamingTabId(store.activeTabId!))
          }
        ],
        [
          'workspace.rename',
          () => {
            if (!workspaceChromeActive || floatingWorkspaceFocused || !activeWorktreeId) {
              return false
            }
            return claim('workspace.rename', () => {
              useAppStore.getState().setSidebarOpen(true)
              requestScrollToCurrentWorkspaceRevealAndRename()
            })
          }
        ],
        [
          'workspace.openBoard',
          () => {
            if (activeView === 'settings') {
              return false
            }
            return claim('workspace.openBoard', () => {
              useAppStore.getState().setSidebarOpen(true)
              window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_BOARD_EVENT))
            })
          }
        ],
        [
          'view.tasks',
          () => {
            const store = useAppStore.getState()
            if (activeView === 'settings') {
              return false
            }
            return claim('view.tasks', () => store.openTaskPage())
          }
        ],
        [
          'sidebar.right.toggle',
          () =>
            canRevealRightSidebar
              ? claim('sidebar.right.toggle', () => actions.toggleRightSidebar())
              : false
        ],
        [
          'sidebar.explorer.toggle',
          () =>
            canRevealRightSidebar
              ? claim('sidebar.explorer.toggle', () => actions.showRightSidebarFiles())
              : false
        ],
        [
          'sidebar.search.toggle',
          () =>
            canRevealRightSidebar
              ? claim('sidebar.search.toggle', () => actions.showRightSidebarSearch())
              : false
        ],
        [
          'sidebar.sourceControl.toggle',
          () => {
            if (!canRevealRightSidebar || document.querySelector('[data-terminal-search-root]')) {
              return false
            }
            return claim('sidebar.sourceControl.toggle', () => {
              actions.setRightSidebarTab('source-control')
              actions.setRightSidebarOpen(true)
            })
          }
        ],
        [
          'sidebar.checks.toggle',
          () =>
            canRevealRightSidebar
              ? claim('sidebar.checks.toggle', () => {
                  actions.setRightSidebarTab('checks')
                  actions.setRightSidebarOpen(true)
                })
              : false
        ],
        [
          'sidebar.ports.toggle',
          () =>
            canRevealRightSidebar
              ? claim('sidebar.ports.toggle', () => {
                  actions.setRightSidebarTab('ports')
                  actions.setRightSidebarOpen(true)
                })
              : false
        ]
      ])
    }

    const unregisterAppCommandDispatcher = registerAppCommandDispatcher((actionId) =>
      (createRegisteredCommandHandlers().get(actionId) ?? (() => false))()
    )

    const dispatchShortcutInput = (input: ShortcutDispatchInput): void => {
      const {
        activeView,
        activeWorktreeId,
        actions,
        floatingTerminalEnabled,
        floatingTerminalOpen,
        floatingVisibleTabCount,
        keybindings,
        pluginCommands,
        terminalShortcutPolicy,
        setFloatingTerminalOpenWithFocus,
        creationLayoutActive
      } = globalShortcutStateRef.current

      // Child handlers (e.g. terminal search) share this window capture phase and fire first; bail if they already preventDefault'd so both don't act.
      if (input.defaultPrevented) {
        return
      }
      // The Settings shortcut recorder captures existing shortcuts, so global handlers must not fire while its button has focus.
      if (
        input.target instanceof Element &&
        input.target.closest('[data-shortcut-recorder-active]') !== null
      ) {
        return
      }
      const context = getKeybindingContext(input.target)

      // Note: some shortcuts are also intercepted in createMainWindow.ts before-input-event (for browser-guest focus); the renderer keeps handlers for local focus.

      const matchShortcut = (actionId: KeybindingActionId): boolean =>
        keybindingMatchesAction(actionId, input, shortcutPlatform, keybindings, {
          context,
          terminalShortcutPolicy
        })
      const notifyTerminalCapture = (actionId: KeybindingActionId): void => {
        if (context !== 'terminal' || (terminalShortcutPolicy ?? 'orca-first') !== 'orca-first') {
          return
        }
        showTerminalShortcutCaptureNotification({
          actionId,
          platform: shortcutPlatform,
          keybindings
        })
      }

      const canRevealRightSidebar = !creationLayoutActive && canShowRightSidebarForView(activeView)

      const openSearchSidebar = (query: string | null): void => {
        actions.showRightSidebarSearch(query ? { query } : undefined)
      }

      if (matchShortcut('sidebar.search.toggle') && canRevealRightSidebar) {
        // With a folder selected in the explorer, Cmd/Ctrl+Shift+F means "Find in Folder" — seed the include pattern with it, not a text search.
        const selectedFolderRelativePath =
          document.activeElement instanceof Element
            ? selectedExplorerFolderRelativePath(document.activeElement)
            : null
        if (selectedFolderRelativePath !== null && activeWorktreeId) {
          input.preventDefault()
          notifyTerminalCapture('sidebar.search.toggle')
          actions.showRightSidebarSearch({
            includePattern: folderRelativePathToIncludeGlob(selectedFolderRelativePath)
          })
          return
        }

        const selectedText = getSelectedTextForFileSearch()
        if (selectedText) {
          input.preventDefault()
          notifyTerminalCapture('sidebar.search.toggle')
          openSearchSidebar(selectedText)
          return
        }
      }

      // An empty floating workspace has no tab to close, so Cmd/Ctrl+W hides the overlay before other surfaces act.
      if (
        keybindingMatchesAction('tab.close', input, shortcutPlatform, keybindings, {
          context: 'app'
        }) &&
        shouldMinimizeFloatingWorkspacePanelOnCloseShortcut({
          floatingTerminalOpen,
          floatingVisibleTabCount
        })
      ) {
        input.preventDefault()
        setFloatingTerminalOpenWithFocus(false)
        return
      }

      // Floating panel closed → its keydown handler is gone, so honor the maximize chord here by opening it pre-maximized (no-op while it's open).
      if (
        !floatingTerminalOpen &&
        matchShortcut('floatingWorkspace.maximize') &&
        floatingTerminalEnabled
      ) {
        input.preventDefault()
        requestFloatingTerminalOpenMaximized()
        setFloatingTerminalOpenWithFocus(true)
        return
      }

      // Skip editable surfaces so TipTap's Cmd+B bold works; this renderer-side fallback covers the blur→press IPC race (docs/markdown-cmd-b-bold-design.md).
      if (isEditableTarget(input.target)) {
        return
      }

      // Let floating-terminal SSH/tmux control chords reach the terminal (xterm's helper textarea isn't a generic editable target).
      if (isFloatingWorkspaceTerminalInputTarget(input.target)) {
        return
      }

      // Only short-circuit chords the floating panel itself claims; suppressing others here would silently no-op them when focus is in the panel.
      const floatingWorkspaceFocused = isFloatingWorkspacePanelFocused()
      if (floatingWorkspaceFocused) {
        const floatingMatchOptions: KeybindingMatchOptions = { context, terminalShortcutPolicy }
        if (
          matchFloatingWorkspacePanelChord(
            input,
            shortcutPlatform,
            null,
            keybindings,
            floatingMatchOptions
          ) !== null
        ) {
          return
        }
      }

      // Plugin chords are user-reviewed instructional content. They win over
      // built-in defaults only in app focus; terminal/editor/browser handlers
      // retain their own shortcut authority.
      if (context === 'app') {
        const pluginCommand = findPluginCommandForKeybinding(
          pluginCommands,
          input,
          shortcutPlatform,
          keybindings,
          Boolean(activeWorktreeId)
        )
        if (pluginCommand) {
          input.preventDefault()
          void executePluginCommand(pluginCommand, 'plugin-keybinding').catch(() => {
            toast.error(
              translate('auto.App.pluginCommandFailed', 'Could not run the plugin command.')
            )
          })
          return
        }
      }

      const handlers = createRegisteredCommandHandlers(input, context)
      for (const actionId of PLUGIN_COMMAND_ALIAS_ACTION_IDS) {
        if (matchShortcut(actionId) && handlers.get(actionId)?.()) {
          return
        }
      }

      // Unbound by default, so it runs after the built-in alias handlers above; only consumes the chord when the active worktree has unsent notes.
      if (canRevealRightSidebar && matchShortcut('sourceControl.sendReviewNotes')) {
        if (actions.openDiffNotesSendMenuForActiveWorktree()) {
          input.preventDefault()
          notifyTerminalCapture('sourceControl.sendReviewNotes')
        }
      }
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      const detected = doubleTapDetector.process(
        toModifierDoubleTapEvent({
          type: 'keyDown',
          code: e.code,
          key: e.key,
          shift: e.shiftKey,
          control: e.ctrlKey,
          alt: e.altKey,
          meta: e.metaKey,
          isAutoRepeat: e.repeat
        }),
        Date.now()
      )
      if (e.repeat) {
        return
      }
      if (detected) {
        // Synthetic input: no key/modifier flags, so only DoubleTap bindings match.
        dispatchShortcutInput({
          doubleTapModifier: detected.modifier,
          target: e.target,
          defaultPrevented: e.defaultPrevented,
          preventDefault: () => e.preventDefault()
        })
        return
      }
      dispatchShortcutInput({
        key: e.key,
        code: e.code,
        altKey: e.altKey,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        target: e.target,
        defaultPrevented: e.defaultPrevented,
        preventDefault: () => e.preventDefault()
      })
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      doubleTapDetector.process(
        toModifierDoubleTapEvent({
          type: 'keyUp',
          code: e.code,
          key: e.key,
          shift: e.shiftKey,
          control: e.ctrlKey,
          alt: e.altKey,
          meta: e.metaKey
        }),
        Date.now()
      )
    }

    // Why: a window blur mid-gesture must not leave the detector armed.
    const onBlur = (): void => doubleTapDetector.reset()

    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('keyup', onKeyUp, { capture: true })
    window.addEventListener('blur', onBlur)
    return () => {
      unregisterAppCommandDispatcher()
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('keyup', onKeyUp, { capture: true })
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useLayoutEffect(() => {
    const controls = titlebarLeftControlsRef.current
    if (!controls) {
      return
    }

    const updateWidth = (): void => {
      setCollapsedSidebarHeaderWidth(controls.getBoundingClientRect().width)
    }

    updateWidth()
    const observer = new ResizeObserver(() => {
      updateWidth()
    })
    observer.observe(controls)
    return () => observer.disconnect()
  }, [
    isFullScreen,
    settings?.showTitlebarAppName,
    showSidebar,
    leftTitlebarChromeLayout.isFloating,
    sidebarOpen
  ])

  const resolvedMountedLazyModalIds = resolveMountedLazyModalIds(activeModal, mountedLazyModalIds)
  if (resolvedMountedLazyModalIds !== mountedLazyModalIds) {
    // Why: lazy-load modals on first use, then keep them mounted so repeat opens preserve state and avoid re-fetch flashes.
    setMountedLazyModalIds(new Set(resolvedMountedLazyModalIds))
  }

  // Why: extracted so the full-width titlebar and the sidebar-width left header share these controls without duplicating the agent badge popover.
  const titlebarLeftControls = (
    // Why: measure the ENTIRE row so TabGroupPanel's collapse spacer reserves enough width; measuring only the inner cluster left back/forward over the first tab.
    // Why: collapsed mode floats in a w-0 wrapper; w-max stops Windows Chromium from shrinking the app name to one glyph.
    <div
      ref={titlebarLeftControlsRef}
      className={`flex h-full shrink-0 items-center${
        leftTitlebarChromeLayout.isFloating ? ' w-max' : ' w-full'
      }`}
    >
      <div className="flex h-full items-center">
        {isMac && !isFullScreen ? (
          <div className="titlebar-traffic-light-pad" />
        ) : hasCustomTitleBar ? (
          /* Why: Windows/Linux remove the native title bar, so render the logo plus a ··· button that pops the application menu (as Alt does). */
          <>
            <img src={logo} alt="" aria-hidden className="titlebar-logo" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="titlebar-icon-button"
                  aria-label={translate('auto.App.8b0b8eb54f', 'Application menu')}
                  onClick={() => window.api.ui.popupMenu()}
                >
                  <MoreHorizontal size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {translate('auto.App.8b0b8eb54f', 'Application menu')}
              </TooltipContent>
            </Tooltip>
          </>
        ) : (
          <div className="pl-2" />
        )}
        {showSidebar && !hasCustomTitleBar && (
          <>
            {settings?.showTitlebarAppName !== false && (
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
                    className="titlebar-app-name"
                    aria-label={translate('auto.App.5096cbbc86', 'Orca')}
                  >
                    <span className="titlebar-app-name-main">
                      {translate('auto.App.5096cbbc86', 'Orca')}
                    </span>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    onSelect={() => {
                      void actions.updateSettings({ showTitlebarAppName: false })
                    }}
                  >
                    {translate('auto.App.e81217c1b7', 'Hide App Name')}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )}
          </>
        )}
        {showSidebar && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="sidebar-toggle"
                onClick={actions.toggleSidebar}
                aria-label={translate('auto.App.e4b9e7dff7', 'Toggle sidebar')}
              >
                <PanelLeft size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {translate('auto.App.ce37cf5279', 'Toggle sidebar ({{value0}})', {
                value0: leftSidebarShortcutLabel
              })}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {/* Why: Back/Forward span worktree + page history, so show the cluster wherever the shortcut is live (hidden in Settings/non-stack views). */}
      {shouldShowWorktreeHistoryControls(activeView) && (
        // With the sidebar collapsed the header shrink-wraps and ml-auto has no spare width, so keep a fixed gutter before Back.
        <div className="ml-auto mr-3 flex items-center pl-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="sidebar-toggle sidebar-toggle-compact"
                onClick={() => useAppStore.getState().goBackWorktree()}
                disabled={!canGoBackWorktree}
                aria-label={translate('auto.App.064bd07810', 'Go back')}
              >
                <ArrowLeft size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {translate('auto.App.fe21e8f6f5', 'Go back ({{value0}})', {
                value0: historyBackShortcutLabel
              })}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="sidebar-toggle sidebar-toggle-compact"
                onClick={() => useAppStore.getState().goForwardWorktree()}
                disabled={!canGoForwardWorktree}
                aria-label={translate('auto.App.cf9099fe98', 'Go forward')}
              >
                <ArrowRight size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {translate('auto.App.f7aa73e785', 'Go forward ({{value0}})', {
                value0: historyForwardShortcutLabel
              })}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  )

  const rightSidebarToggle = showRightSidebarControls ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="sidebar-toggle mr-2"
          onClick={actions.toggleRightSidebar}
          aria-label={translate('auto.App.9e0b441a91', 'Toggle right sidebar')}
        >
          <PanelRight size={16} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {translate('auto.App.c184e056de', 'Toggle right sidebar ({{value0}})', {
          value0: rightSidebarShortcutLabel
        })}
      </TooltipContent>
    </Tooltip>
  ) : null

  const titlebarMainStrip = (
    <>
      {activeView === 'activity' ? (
        <ActivityTitlebarControls />
      ) : creationLayoutActive ? null : (
        <div
          id="titlebar-tabs"
          className={`flex flex-1 min-w-0 self-stretch${!workspaceChromeActive ? ' invisible pointer-events-none' : ''}`}
        />
      )}
      {showTitlebarExpandButton && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="titlebar-icon-button"
              onClick={handleToggleExpand}
              aria-label={translate('auto.App.c1cf0b0e4a', 'Collapse pane')}
              disabled={!activeTabCanExpand}
            >
              <Minimize2 size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.App.c1cf0b0e4a', 'Collapse pane')}
          </TooltipContent>
        </Tooltip>
      )}
      {/* Why: the open right sidebar's header renders its own close button, so hide this duplicate. */}
      {!rightSidebarOpen && rightSidebarToggle}
      {/* Why: reserve space so the Windows/Linux window-controls overlay doesn't obscure content. */}
      {hasCustomTitleBar && <div className="window-controls-titlebar-spacer" />}
    </>
  )
  return (
    <div
      ref={setAppRootNode}
      className="app-layout"
      style={
        {
          '--collapsed-sidebar-header-width': `${layout.collapsedSidebarHeaderWidth}px`,
          // Shared so surfaces can avoid the Windows/Linux window-controls overlay without hardcoding 138px everywhere.
          '--window-controls-width': WINDOW_CONTROLS_WIDTH,
          // Side-position activity bar uses this to push icons below the Windows/Linux window-controls overlay.
          '--window-controls-height': WINDOW_CONTROLS_HEIGHT,
          // Full-bleed surfaces use this to keep the macOS traffic lights uncovered.
          '--mac-traffic-lights-width': MAC_TRAFFIC_LIGHTS_WIDTH
        } as React.CSSProperties
      }
    >
      <TooltipProvider delayDuration={400}>
        <ConfirmationDialogProvider>
          <LinkRoutingPreferenceDialogProvider>
            <AppBackgroundServices />
            <AppWorkspaceShell layout={layout} floatingWorkspace={floatingWorkspace} />
            <AppRootSurfaces
              floatingWorkspace={floatingWorkspace}
              onboardingGate={onboardingGate}
            />
            <BrowserWebAuthnAccountDialog />
          </LinkRoutingPreferenceDialogProvider>
        </ConfirmationDialogProvider>
      </TooltipProvider>
      <Toaster closeButton toastOptions={{ className: 'font-sans text-sm' }} />
      <SkillFreshnessNudge />
      <WorktreeBaseFallbackDialog />
      <PinnedTabCloseDialog />
      <RunningTerminalCloseDialog />
      {/* Why: Electron's drag-region hit-test is DOM-order-based (ignores z-index); render last so WindowControls stay clickable. */}
      {hasCustomTitleBar && <WindowControls />}
    </div>
  )
}

export default App
