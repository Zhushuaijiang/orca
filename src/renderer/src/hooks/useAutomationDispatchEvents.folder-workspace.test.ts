import type * as ReactModule from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDispatchEvent = vi.fn()

const mockLaunchAgentBackgroundSession = vi.fn()
const mockSubmitPromptToAgentPtyWhenReady = vi.fn()
const mockFindReusableAutomationSession = vi.fn()
const mockObserveExistingAutomationSession = vi.fn()
const mockSubmitPromptToAgentPty = vi.fn()
const mockCreateWorktree = vi.fn()
const mockMarkDispatchResult = vi.fn()
const mockOnDispatchRequested = vi.fn()
const mockRendererReady = vi.fn()
const mockFinalizeTerminalOwnership = vi.fn()
const mockReleaseTerminalOwnership = vi.fn()
const mockReleaseRuntimeObservers = vi.fn()
const mockSshNeedsPassphrasePrompt = vi.fn()
const mockSshGetState = vi.fn()
const mockSshConnect = vi.fn()
const mockStoreSubscribe = vi.fn((_listener: () => void) => () => {})

const createdWorktree = {
  id: 'wt-created',
  repoId: 'repo-1',
  displayName: 'Automation worktree',
  path: '/repo/worktree'
}
type TestWorktree = typeof createdWorktree
type TestRepo = {
  id: string
  connectionId: string | null
  executionHostId: string | null
  path: string
}

function noSelectedHost(): string | null {
  return null
}

const state = {
  activeView: 'terminal' as const,
  activeWorktreeId: 'wt-active',
  activeWorkspaceExecutionHostId: noSelectedHost(),
  activeTabId: 'tab-active',
  activeTabType: 'terminal' as const,
  repos: [{ id: 'repo-1', connectionId: null, executionHostId: null, path: '/repo' }] as TestRepo[],
  folderWorkspaces: [] as {
    id: string
    projectGroupId: string
    folderPath: string
    connectionId: string | null
  }[],
  projectGroups: [] as {
    id: string
    connectionId: string | null
    executionHostId?: string | null
  }[],
  worktreesByRepo: {} as Record<string, TestWorktree[]>,
  detectedWorktreesByRepo: {},
  agentStatusByPaneKey: {},
  allWorktrees: vi.fn<() => TestWorktree[]>(() => []),
  getKnownWorktreeById: vi.fn<(worktreeId: string) => TestWorktree | undefined>(() => undefined),
  createWorktree: mockCreateWorktree,
  subscribe: vi.fn(() => () => {}),
  setActiveView: vi.fn(),
  setActiveWorktree: vi.fn(),
  setActiveTab: vi.fn(),
  setActiveTabType: vi.fn()
}

function makeAutomation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'automation-1',
    projectId: 'repo-1',
    prompt: 'run this',
    precheck: null,
    agentId: 'claude',
    workspaceMode: 'new_per_run',
    workspaceId: null,
    baseBranch: null,
    setupDecision: 'run',
    reuseSession: false,
    ...overrides
  }
}

function makeRun() {
  return {
    id: 'run-1',
    automationId: 'automation-1',
    title: 'Nightly setup run',
    scheduledFor: Date.parse('2026-06-24T03:00:00Z'),
    trigger: 'scheduled',
    workspaceId: null,
    workspaceDisplayName: null
  }
}

async function registerAndDispatch(automation = makeAutomation()): Promise<void> {
  vi.doMock('react', async () => {
    const actual = await vi.importActual<typeof ReactModule>('react')
    return {
      ...actual,
      useEffect: (effect: () => void | (() => void)) => {
        effect()
      }
    }
  })
  const { useAutomationDispatchEvents: registerAutomationDispatchEvents } =
    await import('./useAutomationDispatchEvents')
  registerAutomationDispatchEvents()
  const handler = mockOnDispatchRequested.mock.calls[0]?.[0]
  if (!handler) {
    throw new Error('dispatch handler was not registered')
  }
  await handler({
    automation,
    run: makeRun(),
    dispatchToken: 'dispatch-token'
  })
}

vi.mock('@/lib/launch-agent-background-session', () => ({
  launchAgentBackgroundSession: mockLaunchAgentBackgroundSession
}))

vi.mock('@/lib/agent-paste-draft', () => ({
  submitPromptToAgentPtyWhenReady: mockSubmitPromptToAgentPtyWhenReady
}))

// The reuse path reads run history over the local runtime target, not IPC.
vi.mock('@/components/automations/automation-host-client', () => ({
  listAutomationRunsForTarget: vi.fn().mockResolvedValue([])
}))

vi.mock('@/lib/automation-session-reuse', () => ({
  findReusableAutomationSession: mockFindReusableAutomationSession
}))

vi.mock('@/lib/automation-session-observer', () => ({
  observeExistingAutomationSession: mockObserveExistingAutomationSession
}))

vi.mock('@/components/automations/automation-run-output-snapshot', () => ({
  createAutomationRunOutputSnapshotBuffer: () => ({
    append: vi.fn(),
    snapshot: () => null
  }),
  selectAutomationRunOutputSnapshot: (
    assistantMessage: string | null | undefined,
    terminalSnapshot: unknown
  ) =>
    assistantMessage
      ? {
          format: 'plain_text',
          content: assistantMessage,
          capturedAt: 1,
          truncated: false
        }
      : terminalSnapshot
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('@/lib/browser-uuid', () => ({
  createBrowserUuid: () => 'create-request-id'
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => state,
    subscribe: mockStoreSubscribe
  }
}))

describe('useAutomationDispatchEvents folder workspace launch', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    state.activeView = 'terminal'
    state.activeWorktreeId = 'wt-active'
    state.activeWorkspaceExecutionHostId = null
    state.activeTabId = 'tab-active'
    state.activeTabType = 'terminal'
    state.repos = [{ id: 'repo-1', connectionId: null, executionHostId: null, path: '/repo' }]
    state.folderWorkspaces = []
    state.projectGroups = []
    state.worktreesByRepo = {}
    state.agentStatusByPaneKey = {}
    state.allWorktrees.mockReturnValue([])
    state.getKnownWorktreeById.mockReturnValue(undefined)
    mockCreateWorktree.mockResolvedValue({ worktree: createdWorktree })
    mockSubmitPromptToAgentPtyWhenReady.mockResolvedValue(true)
    mockLaunchAgentBackgroundSession.mockResolvedValue({
      tabId: 'agent-tab',
      paneKey: 'agent-tab:7c6fb4e5-3bf1-4ff4-8259-03f7ae81c40d',
      ptyId: 'agent-pty',
      startupPlan: {},
      releaseRuntimeObservers: mockReleaseRuntimeObservers,
      terminalOwnership: {
        finalize: mockFinalizeTerminalOwnership,
        release: mockReleaseTerminalOwnership
      }
    })
    mockOnDispatchRequested.mockReturnValue(() => {})
    mockSshNeedsPassphrasePrompt.mockResolvedValue(false)
    mockSshGetState.mockResolvedValue({ status: 'connected' })
    mockSshConnect.mockResolvedValue({ status: 'connected' })
    mockSubmitPromptToAgentPty.mockResolvedValue(true)
    vi.stubGlobal('window', {
      api: {
        automations: {
          onDispatchRequested: mockOnDispatchRequested,
          rendererReady: mockRendererReady,
          markDispatchResult: mockMarkDispatchResult,
          runPrecheck: vi.fn()
        },
        ssh: {
          needsPassphrasePrompt: mockSshNeedsPassphrasePrompt,
          getState: mockSshGetState,
          connect: mockSshConnect
        }
      },
      dispatchEvent: mockDispatchEvent
    })
  })

  it('dispatches an existing SSH folder workspace on its resolved host', async () => {
    const folderWorkspace = {
      id: 'folder:fw-1',
      repoId: 'folder-workspace:group-1',
      displayName: 'SSH folder',
      path: '/srv/project'
    }
    state.repos = [
      {
        id: 'repo-1',
        connectionId: 'ssh-folder',
        executionHostId: null,
        path: '/srv/project/repo'
      }
    ]
    state.folderWorkspaces = [
      {
        id: 'fw-1',
        projectGroupId: 'group-1',
        folderPath: '/srv/project',
        connectionId: 'ssh-folder'
      }
    ]
    state.projectGroups = [{ id: 'group-1', connectionId: 'ssh-folder' }]
    state.getKnownWorktreeById.mockReturnValue(folderWorkspace)
    mockSshGetState.mockResolvedValue({ status: 'disconnected' })

    await registerAndDispatch(
      makeAutomation({
        workspaceMode: 'existing',
        workspaceId: folderWorkspace.id,
        setupDecision: 'skip',
        runContext: { repoId: 'repo-1', hostId: 'ssh:ssh-folder' }
      })
    )

    expect(state.allWorktrees).not.toHaveBeenCalled()
    expect(mockSshConnect).toHaveBeenCalledWith({ targetId: 'ssh-folder', automatic: true })
    expect(mockLaunchAgentBackgroundSession).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeId: folderWorkspace.id,
        prompt: 'run this'
      })
    )
    expect(mockMarkDispatchResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'dispatched',
        workspaceId: folderWorkspace.id,
        workspaceDisplayName: folderWorkspace.displayName
      })
    )
  })

  it('dispatches a local folder workspace without SSH', async () => {
    const folderWorkspace = {
      id: 'folder:fw-local',
      repoId: 'folder-workspace:group-local',
      displayName: 'Local folder',
      path: '/project'
    }
    state.folderWorkspaces = [
      {
        id: 'fw-local',
        projectGroupId: 'group-local',
        folderPath: '/project',
        connectionId: null
      }
    ]
    state.projectGroups = [{ id: 'group-local', connectionId: null }]
    state.getKnownWorktreeById.mockReturnValue(folderWorkspace)

    await registerAndDispatch(
      makeAutomation({
        workspaceMode: 'existing',
        workspaceId: folderWorkspace.id,
        runContext: { repoId: 'repo-1', hostId: 'local' }
      })
    )

    expect(mockSshNeedsPassphrasePrompt).not.toHaveBeenCalled()
    expect(mockLaunchAgentBackgroundSession).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: folderWorkspace.id })
    )
  })

  it('skips a folder workspace owned by a different host', async () => {
    const folderWorkspace = {
      id: 'folder:fw-other',
      repoId: 'folder-workspace:group-other',
      displayName: 'Other host',
      path: '/srv/other'
    }
    state.folderWorkspaces = [
      {
        id: 'fw-other',
        projectGroupId: 'group-other',
        folderPath: '/srv/other',
        connectionId: 'ssh-other'
      }
    ]
    state.projectGroups = [{ id: 'group-other', connectionId: 'ssh-other' }]
    state.getKnownWorktreeById.mockReturnValue(folderWorkspace)

    await registerAndDispatch(
      makeAutomation({
        workspaceMode: 'existing',
        workspaceId: folderWorkspace.id,
        runContext: { repoId: 'repo-1', hostId: 'local' }
      })
    )

    expect(mockLaunchAgentBackgroundSession).not.toHaveBeenCalled()
    expect(mockMarkDispatchResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'skipped_unavailable' })
    )
  })

  it('keeps detected-only non-folder workspaces unavailable', async () => {
    state.getKnownWorktreeById.mockReturnValue({
      id: 'wt-detected',
      repoId: 'repo-1',
      displayName: 'Detected',
      path: '/repo/detected'
    })

    await registerAndDispatch(
      makeAutomation({
        workspaceMode: 'existing',
        workspaceId: 'wt-detected'
      })
    )

    expect(state.getKnownWorktreeById).not.toHaveBeenCalled()
    expect(mockLaunchAgentBackgroundSession).not.toHaveBeenCalled()
    expect(mockMarkDispatchResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'skipped_unavailable' })
    )
  })
})
