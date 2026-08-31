import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { Repo, Worktree } from '../../../../shared/types'

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  prepareSession: vi.fn(),
  buildStartup: vi.fn(),
  launchSession: vi.fn(),
  activateWorktree: vi.fn(),
  activateFolder: vi.fn(),
  activateTabAndFocusPane: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  findLockHolders: vi.fn(),
  killLockHolder: vi.fn()
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
vi.mock('@/lib/activate-tab-and-focus-pane', () => ({
  activateTabAndFocusPane: mocks.activateTabAndFocusPane
}))
vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}))

import {
  findLatestRestorableVaultSession,
  restoreAiVaultSession,
  scanRestorableVaultSessions
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

function worktree(overrides: Partial<Worktree> = {}): Worktree {
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
    isMainWorktree: false,
    ...overrides
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

function stubWindowApi(
  listSessions: ReturnType<typeof vi.fn>,
  searchYunxiaoSessions = vi.fn().mockResolvedValue({ sessions: [] })
): void {
  vi.stubGlobal('window', {
    api: {
      aiVault: { listSessions, searchYunxiaoSessions },
      agentSession: {
        findLockHolders: mocks.findLockHolders,
        killLockHolder: mocks.killLockHolder
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getState.mockReturnValue(storeState())
  mocks.prepareSession.mockImplementation(async (value) => value)
  mocks.buildStartup.mockReturnValue({ command: "kimi --session 'session-1'" })
  mocks.launchSession.mockReturnValue({ tabId: 'tab-restored' })
  mocks.findLockHolders.mockResolvedValue([])
  mocks.killLockHolder.mockResolvedValue(true)
  stubWindowApi(vi.fn().mockResolvedValue({ sessions: [], issues: [], scannedAt: '' }))
})

afterEach(() => {
  vi.unstubAllGlobals()
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

describe('scanRestorableVaultSessions', () => {
  it('returns all cached sessions newest-first', async () => {
    const older = session({ id: 'older', sessionId: 'older' })
    const newest = session({
      id: 'newest',
      sessionId: 'newest',
      modifiedAt: '2026-08-08T00:00:00.000Z'
    })
    const listSessions = vi
      .fn()
      .mockResolvedValue({ sessions: [older, newest], issues: [], scannedAt: '' })
    stubWindowApi(listSessions)

    await expect(scanRestorableVaultSessions(WORKTREE_ID)).resolves.toEqual([newest, older])
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
    stubWindowApi(listSessions)

    await expect(scanRestorableVaultSessions(WORKTREE_ID)).resolves.toEqual([found])
    expect(listSessions).toHaveBeenNthCalledWith(2, {
      limit: 500,
      scopePaths: ['/repo/orca'],
      executionHostScope: 'local',
      force: true
    })
  })

  it('uses the linked requirement id instead of the shared workspace path', async () => {
    const found = session({ id: 'matched', sessionId: 'matched' })
    const linkedWorktree = worktree({
      linkedWorkItem: {
        provider: 'yunxiao',
        type: 'issue',
        number: 0,
        title: 'DFHIS-31889 requirement',
        url: 'https://devops.aliyun.com/projex/req/DFHIS-31889',
        yunxiaoIdentifier: 'DFHIS-31889'
      }
    })
    mocks.getState.mockReturnValue(storeState({ worktreesByRepo: { 'repo-1': [linkedWorktree] } }))
    const listSessions = vi.fn()
    const searchYunxiaoSessions = vi.fn().mockResolvedValue({ sessions: [found] })
    stubWindowApi(listSessions, searchYunxiaoSessions)

    await expect(scanRestorableVaultSessions(WORKTREE_ID)).resolves.toEqual([found])
    expect(searchYunxiaoSessions).toHaveBeenCalledOnce()
    expect(searchYunxiaoSessions).toHaveBeenCalledWith({ yunxiaoId: 'DFHIS-31889' })
    expect(listSessions).not.toHaveBeenCalled()
  })

  it('uses an automation workspace name instead of scanning its shared path', async () => {
    const found = session({ id: 'matched', sessionId: 'matched' })
    const automationWorkspace = worktree({
      displayName: 'DFHIS-32238 【新安人民】医院组套药房修复',
      automationProvenance: {
        kind: 'created-by-automation',
        automationId: 'automation-1',
        automationNameSnapshot: '云效待办池',
        automationRunId: 'run-1',
        automationRunTitleSnapshot: 'DFHIS-32238 【新安人民】医院组套药房修复',
        createdAt: 1,
        executionTargetType: 'local',
        executionTargetId: 'local',
        projectId: 'repo-1'
      }
    })
    mocks.getState.mockReturnValue(
      storeState({ worktreesByRepo: { 'repo-1': [automationWorkspace] } })
    )
    const listSessions = vi.fn()
    const searchYunxiaoSessions = vi.fn().mockResolvedValue({ sessions: [found] })
    stubWindowApi(listSessions, searchYunxiaoSessions)

    await expect(scanRestorableVaultSessions(WORKTREE_ID)).resolves.toEqual([found])
    expect(searchYunxiaoSessions).toHaveBeenCalledWith({ yunxiaoId: 'DFHIS-32238' })
    expect(listSessions).not.toHaveBeenCalled()
  })

  it('keeps the matching sleeping session in the restore menu', async () => {
    const found = session({ id: 'matched', sessionId: 'sleeping-session' })
    const linkedWorktree = worktree({
      linkedWorkItem: {
        provider: 'yunxiao',
        type: 'issue',
        number: 0,
        title: 'DFHIS-32238 requirement',
        url: 'https://devops.aliyun.com/projex/req/DFHIS-32238',
        yunxiaoIdentifier: 'DFHIS-32238'
      }
    })
    mocks.getState.mockReturnValue(
      storeState({
        worktreesByRepo: { 'repo-1': [linkedWorktree] },
        sleepingAgentSessionsByPaneKey: {
          'tab-existing:11111111-1111-4111-8111-111111111111': {
            paneKey: 'tab-existing:11111111-1111-4111-8111-111111111111',
            tabId: 'tab-existing',
            worktreeId: WORKTREE_ID,
            agent: 'kimi',
            providerSession: { key: 'session_id', id: found.sessionId },
            prompt: '',
            state: 'done',
            capturedAt: 1,
            updatedAt: 1,
            origin: 'live'
          }
        }
      })
    )
    const searchYunxiaoSessions = vi.fn().mockResolvedValue({ sessions: [found] })
    stubWindowApi(vi.fn(), searchYunxiaoSessions)

    await expect(scanRestorableVaultSessions(WORKTREE_ID)).resolves.toEqual([found])
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

  it('kills stale lock holders before resuming the session', async () => {
    const restored = session()
    mocks.findLockHolders.mockResolvedValue([
      { pid: 501, ppid: 1, command: `node codex --session ${restored.sessionId}` }
    ])

    await expect(restoreAiVaultSession(WORKTREE_ID, restored)).resolves.toBe(true)

    expect(mocks.findLockHolders).toHaveBeenCalledWith(restored.sessionId)
    expect(mocks.killLockHolder).toHaveBeenCalledWith(501)
    expect(mocks.prepareSession).toHaveBeenCalledWith(restored)
  })

  it('focuses the existing tab for a matching sleeping session', async () => {
    const restored = session({ sessionId: 'sleeping-session' })
    const paneKey = 'tab-existing:11111111-1111-4111-8111-111111111111'
    mocks.getState.mockReturnValue(
      storeState({
        tabsByWorktree: {
          [WORKTREE_ID]: [{ id: 'tab-existing', worktreeId: WORKTREE_ID }]
        },
        sleepingAgentSessionsByPaneKey: {
          [paneKey]: {
            paneKey,
            tabId: 'tab-existing',
            worktreeId: WORKTREE_ID,
            agent: 'kimi',
            providerSession: { key: 'session_id', id: restored.sessionId },
            prompt: '',
            state: 'done',
            capturedAt: 1,
            updatedAt: 1,
            origin: 'live'
          }
        }
      })
    )

    await expect(restoreAiVaultSession(WORKTREE_ID, restored)).resolves.toBe(true)

    expect(mocks.activateWorktree).toHaveBeenCalledWith(WORKTREE_ID)
    expect(mocks.activateTabAndFocusPane).toHaveBeenCalledWith(
      'tab-existing',
      '11111111-1111-4111-8111-111111111111',
      {
        ackPaneKeyOnSuccess: paneKey,
        flashFocusedPane: true,
        scrollToBottomIfOutputSinceLastView: true
      }
    )
    expect(mocks.findLockHolders).not.toHaveBeenCalled()
    expect(mocks.launchSession).not.toHaveBeenCalled()
  })
})
