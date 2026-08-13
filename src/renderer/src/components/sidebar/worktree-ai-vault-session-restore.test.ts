import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { Repo, Worktree } from '../../../../shared/types'

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  prepareSession: vi.fn(),
  buildStartup: vi.fn(),
  launchSession: vi.fn(),
  activateWorktree: vi.fn(),
  activateFolder: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('@/store', () => ({ useAppStore: { getState: mocks.getState } }))
vi.mock('@/lib/ai-vault-session-resume-preparation', () => ({
  prepareAiVaultSessionForResume: mocks.prepareSession
}))
vi.mock('@/lib/ai-vault-resume-command', () => ({
  buildAiVaultResumeStartupForWorktree: mocks.buildStartup
}))
vi.mock('@/lib/launch-ai-vault-session', () => ({
  launchAiVaultSessionInNewTab: mocks.launchSession
}))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: mocks.activateWorktree,
  activateAndRevealFolderWorkspace: mocks.activateFolder
}))
vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}))

import {
  findLatestRestorableVaultSession,
  restoreAiVaultSession,
  scanLatestRestorableVaultSession
} from './worktree-ai-vault-session-restore'

const WORKTREE_ID = 'repo-1::/repo/orca'

function session(overrides: Partial<AiVaultSession> = {}): AiVaultSession {
  return {
    id: 'local:kimi:session-1:/logs/session-1.jsonl',
    executionHostId: 'local',
    agent: 'kimi',
    sessionId: 'session-1',
    title: 'Fix the issue',
    cwd: '/repo/orca',
    branch: 'main',
    model: null,
    filePath: '/logs/session-1.jsonl',
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-08-07T00:00:00.000Z',
    messageCount: 2,
    totalTokens: 100,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: "kimi --session 'session-1'",
    subagent: null,
    ...overrides
  }
}

function worktree(): Worktree {
  return {
    id: WORKTREE_ID,
    repoId: 'repo-1',
    displayName: 'orca',
    path: '/repo/orca',
    head: 'abc123',
    branch: 'main',
    isBare: false,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    isMainWorktree: false
  }
}

function storeState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    worktreesByRepo: { 'repo-1': [worktree()] },
    repos: [{ id: 'repo-1', connectionId: null } as Repo],
    folderWorkspaces: [],
    tabsByWorktree: { [WORKTREE_ID]: [] },
    agentStatusByPaneKey: {},
    retainedAgentsByPaneKey: {},
    sleepingAgentSessionsByPaneKey: {},
    pendingStartupByTabId: {},
    settings: {},
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getState.mockReturnValue(storeState())
  mocks.prepareSession.mockImplementation(async (value) => value)
  mocks.buildStartup.mockReturnValue({ command: "kimi --session 'session-1'" })
  mocks.launchSession.mockReturnValue({ tabId: 'tab-restored' })
})

describe('findLatestRestorableVaultSession', () => {
  const workspace = {
    workspaceId: WORKTREE_ID,
    path: '/repo/orca',
    executionHostId: 'local' as const
  }

  it('selects the newest resumable top-level session in the workspace', () => {
    const older = session({ id: 'older', sessionId: 'older' })
    const newest = session({
      id: 'newest',
      sessionId: 'newest',
      cwd: '/repo/orca/packages/app',
      modifiedAt: '2026-08-08T00:00:00.000Z'
    })
    const empty = session({ id: 'empty', messageCount: 0 })
    const subagent = session({
      id: 'subagent',
      subagent: { parentSessionId: 'parent', agentType: 'kimi', status: 'completed' }
    })

    expect(
      findLatestRestorableVaultSession({
        sessions: [older, empty, subagent, newest],
        workspace
      })
    ).toBe(newest)
  })

  it('rejects another path, host, or an already-open provider session', () => {
    const open = session()
    expect(
      findLatestRestorableVaultSession({
        sessions: [
          session({ id: 'outside', cwd: '/repo/other' }),
          session({ id: 'remote', executionHostId: 'ssh:prod' }),
          open
        ],
        workspace,
        openSessions: [{ agent: 'kimi', sessionId: open.sessionId }]
      })
    ).toBeNull()
  })

  it('matches a Linux cwd to its WSL UNC workspace path', () => {
    const wslSession = session({ cwd: '/home/ada/orca' })
    expect(
      findLatestRestorableVaultSession({
        sessions: [wslSession],
        workspace: {
          workspaceId: WORKTREE_ID,
          path: '\\\\wsl.localhost\\Ubuntu\\home\\ada\\orca',
          executionHostId: 'local'
        }
      })
    ).toBe(wslSession)
  })
})

describe('scanLatestRestorableVaultSession', () => {
  it('uses the scoped cache and skips a forced scan when it finds a session', async () => {
    const found = session()
    const listSessions = vi.fn().mockResolvedValue({ sessions: [found], issues: [], scannedAt: '' })
    vi.stubGlobal('window', { api: { aiVault: { listSessions } } })

    await expect(scanLatestRestorableVaultSession(WORKTREE_ID)).resolves.toBe(found)
    expect(listSessions).toHaveBeenCalledOnce()
    expect(listSessions).toHaveBeenCalledWith({
      limit: 500,
      scopePaths: ['/repo/orca'],
      executionHostScope: 'local',
      force: false
    })
  })

  it('forces one refresh after an empty cached result', async () => {
    const found = session()
    const listSessions = vi
      .fn()
      .mockResolvedValueOnce({ sessions: [], issues: [], scannedAt: '' })
      .mockResolvedValueOnce({ sessions: [found], issues: [], scannedAt: '' })
    vi.stubGlobal('window', { api: { aiVault: { listSessions } } })

    await expect(scanLatestRestorableVaultSession(WORKTREE_ID)).resolves.toBe(found)
    expect(listSessions).toHaveBeenNthCalledWith(2, {
      limit: 500,
      scopePaths: ['/repo/orca'],
      executionHostScope: 'local',
      force: true
    })
  })
})

describe('restoreAiVaultSession', () => {
  it('queues the AI Vault resume command and reveals the workspace', async () => {
    const restored = session()

    await expect(restoreAiVaultSession(WORKTREE_ID, restored)).resolves.toBe(true)

    expect(mocks.prepareSession).toHaveBeenCalledWith(restored)
    expect(mocks.launchSession).toHaveBeenCalledWith({
      agent: 'kimi',
      worktreeId: WORKTREE_ID,
      command: "kimi --session 'session-1'"
    })
    expect(mocks.activateWorktree).toHaveBeenCalledWith(WORKTREE_ID)
    expect(mocks.toastSuccess).toHaveBeenCalledOnce()
  })
})
