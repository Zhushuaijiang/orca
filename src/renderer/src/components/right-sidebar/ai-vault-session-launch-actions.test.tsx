// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { AiVaultSessionResumeTargetState } from './ai-vault-session-resume'

const mocks = vi.hoisted(() => ({
  activateTabAndFocusPane: vi.fn(),
  activateWorktree: vi.fn(),
  buildCopyCommand: vi.fn(),
  buildStartup: vi.fn(),
  getState: vi.fn(),
  launchSession: vi.fn(),
  launchSleepingSession: vi.fn(),
  prepareSession: vi.fn(),
  toastSuccess: vi.fn()
}))

vi.mock('@/store', () => ({ useAppStore: { getState: mocks.getState } }))
vi.mock('@/lib/activate-tab-and-focus-pane', () => ({
  activateTabAndFocusPane: mocks.activateTabAndFocusPane
}))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealFolderWorkspace: vi.fn(),
  activateAndRevealWorktree: mocks.activateWorktree
}))
vi.mock('@/lib/sleeping-agent-session-launch', () => ({
  launchSleepingAgentSession: mocks.launchSleepingSession
}))
vi.mock('@/lib/ai-vault-resume-command', () => ({
  buildAiVaultResumeCopyCommandForWorktree: mocks.buildCopyCommand,
  buildAiVaultResumeStartupForWorktree: mocks.buildStartup
}))
vi.mock('@/lib/ai-vault-session-resume-preparation', () => ({
  prepareAiVaultSessionForResume: mocks.prepareSession
}))
vi.mock('@/lib/launch-ai-vault-session', () => ({
  launchAiVaultSessionInNewTab: mocks.launchSession
}))
vi.mock('@/lib/activate-ai-vault-structured-session', () => ({
  activateAiVaultStructuredSession: vi.fn()
}))
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: mocks.toastSuccess }
}))

import { useAiVaultSessionLaunchActions } from './ai-vault-session-launch-actions'

const ROOT_WORKSPACE_ID = 'repo-1::workspace-root'
const REQUIREMENT_WORKSPACE_ID = 'repo-1::workspace-dfhis-32238'
const PANE_KEY = 'tab-existing:11111111-1111-4111-8111-111111111111'

function makeWorktree(id: string, displayName: string): Worktree {
  return {
    id,
    repoId: 'repo-1',
    displayName,
    path: '/workspace/yunxiao',
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

function makeSession(): AiVaultSession {
  return {
    id: 'local:kimi:session-1:/logs/session-1.jsonl',
    executionHostId: 'local',
    agent: 'kimi',
    sessionId: 'session-1',
    title: 'DFHIS-32238 requirement',
    cwd: '/workspace/yunxiao',
    branch: 'main',
    model: null,
    filePath: '/logs/session-1.jsonl',
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-08-31T00:00:00.000Z',
    messageCount: 2,
    totalTokens: 100,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: "kimi --session 'session-1'",
    subagent: null
  }
}

describe('useAiVaultSessionLaunchActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('wakes a sleeping session in its requested workspace instance', () => {
    const rootWorkspace = makeWorktree(ROOT_WORKSPACE_ID, 'yunxiao')
    const requirementWorkspace = makeWorktree(
      REQUIREMENT_WORKSPACE_ID,
      'DFHIS-32238 【新安人民】医院组套药房修复'
    )
    const session = makeSession()
    const repo = {
      id: 'repo-1',
      path: '/workspace/yunxiao',
      displayName: 'yunxiao',
      badgeColor: '#737373',
      addedAt: 1,
      connectionId: null,
      executionHostId: 'local'
    } satisfies Repo
    const targetState: AiVaultSessionResumeTargetState = {
      folderWorkspaces: [],
      projectGroups: [],
      repos: [repo],
      worktreesByRepo: { 'repo-1': [rootWorkspace, requirementWorkspace] }
    }
    mocks.getState.mockReturnValue({
      activeWorktreeId: ROOT_WORKSPACE_ID,
      sleepingAgentSessionsByPaneKey: {
        [PANE_KEY]: {
          paneKey: PANE_KEY,
          tabId: 'tab-existing',
          worktreeId: REQUIREMENT_WORKSPACE_ID,
          agent: 'kimi',
          providerSession: { key: 'session_id', id: session.sessionId },
          prompt: '',
          state: 'done',
          capturedAt: 1,
          updatedAt: 1,
          origin: 'live'
        }
      },
      tabsByWorktree: {
        [REQUIREMENT_WORKSPACE_ID]: [{ id: 'tab-existing', worktreeId: REQUIREMENT_WORKSPACE_ID }]
      },
      worktreesByRepo: targetState.worktreesByRepo,
      repos: targetState.repos,
      folderWorkspaces: []
    })

    const { result } = renderHook(() =>
      useAiVaultSessionLaunchActions({
        activeWorktree: rootWorkspace,
        activeWorktreeId: ROOT_WORKSPACE_ID,
        targetState
      })
    )
    act(() => result.current.handleResume(session, REQUIREMENT_WORKSPACE_ID))

    expect(mocks.activateWorktree).toHaveBeenCalledWith(REQUIREMENT_WORKSPACE_ID)
    expect(mocks.activateTabAndFocusPane).toHaveBeenCalledWith(
      'tab-existing',
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ ackPaneKeyOnSuccess: PANE_KEY })
    )
    expect(mocks.prepareSession).not.toHaveBeenCalled()
    expect(mocks.launchSession).not.toHaveBeenCalled()
  })
})
