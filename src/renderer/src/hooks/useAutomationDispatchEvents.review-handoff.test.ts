import type * as ReactModule from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockLaunchAgentBackgroundSession = vi.fn()
const mockMaybeLaunchYunxiaoReviewHandoff = vi.fn()
const mockCreateWorktree = vi.fn()
const mockMarkDispatchResult = vi.fn()
const mockOnDispatchRequested = vi.fn()
const mockFinalizeTerminalOwnership = vi.fn()
const mockReleaseTerminalOwnership = vi.fn()

const createdWorktree = {
  id: 'wt-created',
  repoId: 'repo-1',
  displayName: 'Automation worktree',
  path: '/repo/worktree'
}

const state = {
  activeView: 'terminal' as const,
  activeWorktreeId: 'wt-active',
  activeTabId: 'tab-active',
  activeTabType: 'terminal' as const,
  repos: [{ id: 'repo-1', connectionId: null, executionHostId: null, path: '/repo' }],
  folderWorkspaces: [],
  projectGroups: [],
  worktreesByRepo: {},
  detectedWorktreesByRepo: {},
  agentStatusByPaneKey: {},
  allWorktrees: vi.fn(() => []),
  getKnownWorktreeById: vi.fn(() => undefined),
  createWorktree: mockCreateWorktree,
  subscribe: vi.fn(() => () => {}),
  setActiveView: vi.fn(),
  setActiveWorktree: vi.fn(),
  setActiveTab: vi.fn(),
  setActiveTabType: vi.fn()
}

vi.mock('@/lib/launch-agent-background-session', () => ({
  launchAgentBackgroundSession: mockLaunchAgentBackgroundSession
}))
vi.mock('@/lib/yunxiao-review-handoff-launch', () => ({
  maybeLaunchYunxiaoReviewHandoff: mockMaybeLaunchYunxiaoReviewHandoff
}))
vi.mock('@/lib/launch-worktree-background-terminals', () => ({
  launchWorktreeBackgroundTerminals: vi.fn()
}))
vi.mock('@/lib/agent-paste-draft', () => ({
  submitPromptToAgentPtyWhenReady: vi.fn()
}))
vi.mock('@/components/automations/automation-host-client', () => ({
  listAutomationRunsForTarget: vi.fn().mockResolvedValue([])
}))
vi.mock('@/lib/automation-session-reuse', () => ({
  findReusableAutomationSession: vi.fn()
}))
vi.mock('@/lib/automation-session-observer', () => ({
  observeExistingAutomationSession: vi.fn()
}))
vi.mock('@/components/automations/automation-run-output-snapshot', () => ({
  createAutomationRunOutputSnapshotBuffer: () => ({ append: vi.fn(), snapshot: () => null }),
  selectAutomationRunOutputSnapshot: () => null
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('@/lib/browser-uuid', () => ({
  createBrowserUuid: () => 'create-request-id'
}))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => state, subscribe: vi.fn(() => () => {}) }
}))

describe('useAutomationDispatchEvents Yunxiao review handoff', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    mockMaybeLaunchYunxiaoReviewHandoff.mockResolvedValue(undefined)
    mockCreateWorktree.mockResolvedValue({ worktree: createdWorktree })
    mockLaunchAgentBackgroundSession.mockResolvedValue({
      tabId: 'agent-tab',
      paneKey: 'agent-tab:7c6fb4e5-3bf1-4ff4-8259-03f7ae81c40d',
      ptyId: 'agent-pty',
      startupPlan: {},
      terminalOwnership: {
        finalize: mockFinalizeTerminalOwnership,
        release: mockReleaseTerminalOwnership
      }
    })
    mockOnDispatchRequested.mockReturnValue(() => {})
    mockMarkDispatchResult.mockResolvedValue(undefined)
    vi.stubGlobal('window', {
      api: {
        automations: {
          onDispatchRequested: mockOnDispatchRequested,
          rendererReady: vi.fn(),
          markDispatchResult: mockMarkDispatchResult,
          runPrecheck: vi.fn()
        },
        ssh: {
          needsPassphrasePrompt: vi.fn().mockResolvedValue(false),
          getState: vi.fn().mockResolvedValue({ status: 'connected' }),
          connect: vi.fn().mockResolvedValue({ status: 'connected' })
        }
      },
      dispatchEvent: vi.fn()
    })
  })

  it('starts a review handoff after the implementer session completes', async () => {
    let onAgentStatus: ((payload: { state: string; sessionBoundary?: boolean }) => void) | undefined
    mockLaunchAgentBackgroundSession.mockImplementation(
      async (args: { onAgentStatus?: typeof onAgentStatus }) => {
        onAgentStatus = args.onAgentStatus
        return {
          tabId: 'agent-tab',
          paneKey: 'agent-tab:7c6fb4e5-3bf1-4ff4-8259-03f7ae81c40d',
          ptyId: 'agent-pty',
          startupPlan: {},
          terminalOwnership: {
            finalize: mockFinalizeTerminalOwnership,
            release: mockReleaseTerminalOwnership
          }
        }
      }
    )

    vi.doMock('react', async () => {
      const actual = await vi.importActual<typeof ReactModule>('react')
      return {
        ...actual,
        useEffect: (effect: () => void | (() => void)) => {
          effect()
        }
      }
    })
    const { useAutomationDispatchEvents } = await import('./useAutomationDispatchEvents')
    useAutomationDispatchEvents()
    const handler = mockOnDispatchRequested.mock.calls[0]?.[0]
    await handler({
      automation: {
        id: 'automation-1',
        projectId: 'repo-1',
        prompt: 'run this',
        precheck: null,
        agentId: 'kimi',
        workspaceMode: 'new_per_run',
        workspaceId: null,
        baseBranch: null,
        setupDecision: 'run',
        reuseSession: false,
        yunxiaoTodoPool: {
          kind: 'yunxiao-todo-pool',
          statuses: ['queued'],
          batchSize: 1,
          reviewHandoff: { enabled: true, agentId: 'codex' }
        }
      },
      run: {
        id: 'run-1',
        automationId: 'automation-1',
        title: 'DFHIS-32345 HQMS 导出',
        scheduledFor: Date.parse('2026-06-24T03:00:00Z'),
        trigger: 'scheduled',
        workspaceId: null,
        workspaceDisplayName: null
      },
      dispatchToken: 'dispatch-token'
    })
    onAgentStatus?.({ state: 'done' })
    await vi.waitFor(() => expect(mockMaybeLaunchYunxiaoReviewHandoff).toHaveBeenCalled())
    expect(mockMaybeLaunchYunxiaoReviewHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeId: 'wt-created',
        implementerPaneKey: 'agent-tab:7c6fb4e5-3bf1-4ff4-8259-03f7ae81c40d',
        automation: expect.objectContaining({
          agentId: 'kimi',
          yunxiaoTodoPool: expect.objectContaining({
            reviewHandoff: { enabled: true, agentId: 'codex' }
          })
        })
      })
    )
  })
})
