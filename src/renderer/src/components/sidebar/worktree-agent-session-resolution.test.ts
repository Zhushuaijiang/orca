import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { FolderWorkspace, Repo, Worktree } from '../../../../shared/types'
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import {
  findVaultSessionForAgentRow,
  resolveAgentRowWorkspaceTarget,
  shouldShowAgentSessionContextMenu
} from './worktree-agent-session-resolution'

function makeEntry(overrides: Partial<AgentStatusEntry> = {}): AgentStatusEntry {
  return {
    paneKey: 'tab-1:pane-1',
    state: 'done',
    prompt: 'fix the thing',
    updatedAt: 1000,
    stateStartedAt: 1000,
    stateHistory: [],
    agentType: 'codex',
    ...overrides
  }
}

function makeAgentRow(
  overrides: Partial<AgentStatusEntry> = {},
  row: Partial<DashboardAgentRow> = {}
): Pick<DashboardAgentRow, 'rowSource' | 'entry'> {
  return {
    rowSource: row.rowSource ?? 'live',
    entry: makeEntry(overrides)
  }
}

function makeVaultSession(overrides: Partial<AiVaultSession> = {}): AiVaultSession {
  return {
    id: 'codex:session-1',
    executionHostId: 'local',
    agent: 'codex',
    sessionId: 'session-1',
    title: 'session',
    cwd: '/repo/orca',
    branch: 'main',
    model: null,
    filePath: '/logs/session-1.jsonl',
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-08-04T00:00:00.000Z',
    messageCount: 4,
    totalTokens: 100,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: 'codex resume session-1',
    subagent: null,
    ...overrides
  }
}

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'repo-1::/repo/orca',
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

function makeFolderWorkspace(overrides: Partial<FolderWorkspace> = {}): FolderWorkspace {
  return {
    id: 'folder-1',
    projectGroupId: 'group-1',
    name: 'notes',
    folderPath: '/folders/notes',
    linkedTask: null,
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('shouldShowAgentSessionContextMenu', () => {
  it('shows for a live row with a provider session id', () => {
    expect(
      shouldShowAgentSessionContextMenu(
        makeAgentRow({ providerSession: { key: 'session_id', id: 'session-1' } })
      )
    ).toBe(true)
  })

  it('shows for a retained row with a provider session id', () => {
    expect(
      shouldShowAgentSessionContextMenu(
        makeAgentRow(
          { providerSession: { key: 'session_id', id: 'session-1' } },
          {
            rowSource: 'retained'
          }
        )
      )
    ).toBe(true)
  })

  it('hides for subagent rows even with a provider session id', () => {
    expect(
      shouldShowAgentSessionContextMenu(
        makeAgentRow(
          { providerSession: { key: 'session_id', id: 'session-1' } },
          {
            rowSource: 'subagent'
          }
        )
      )
    ).toBe(false)
  })

  it('hides without a provider session id', () => {
    expect(shouldShowAgentSessionContextMenu(makeAgentRow())).toBe(false)
    expect(
      shouldShowAgentSessionContextMenu(
        makeAgentRow({ providerSession: { key: 'session_id', id: '   ' } })
      )
    ).toBe(false)
  })
})

describe('findVaultSessionForAgentRow', () => {
  const args = { agentType: 'codex', providerSessionId: 'session-1' }

  it('matches by agent type and provider session id', () => {
    const session = makeVaultSession()
    expect(findVaultSessionForAgentRow([session], args)).toBe(session)
  })

  it('rejects a different agent or session id', () => {
    expect(findVaultSessionForAgentRow([makeVaultSession({ agent: 'claude' })], args)).toBeNull()
    expect(findVaultSessionForAgentRow([makeVaultSession({ sessionId: 'other' })], args)).toBeNull()
    expect(findVaultSessionForAgentRow([], args)).toBeNull()
  })

  it('prefers the top-level session over a subagent transcript with the same id', () => {
    const subagent = makeVaultSession({
      id: 'codex:session-1:sub',
      subagent: { parentSessionId: 'session-1', agentType: 'codex', status: 'completed' }
    })
    const topLevel = makeVaultSession()
    expect(findVaultSessionForAgentRow([subagent, topLevel], args)).toBe(topLevel)
    expect(findVaultSessionForAgentRow([subagent], args)).toBe(subagent)
  })
})

describe('resolveAgentRowWorkspaceTarget', () => {
  const state = {
    worktreesByRepo: { 'repo-1': [makeWorktree()] },
    repos: [{ id: 'repo-1', connectionId: null } as Repo],
    folderWorkspaces: [makeFolderWorkspace()]
  }

  it('resolves a local git worktree', () => {
    expect(resolveAgentRowWorkspaceTarget(state, 'repo-1::/repo/orca')).toEqual({
      workspaceId: 'repo-1::/repo/orca',
      path: '/repo/orca',
      executionHostId: 'local'
    })
  })

  it('prefers the worktree host stamp when present', () => {
    const withHost = {
      ...state,
      worktreesByRepo: { 'repo-1': [makeWorktree({ hostId: 'ssh:target' })] }
    }
    expect(resolveAgentRowWorkspaceTarget(withHost, 'repo-1::/repo/orca')?.executionHostId).toBe(
      'ssh:target'
    )
  })

  it('carries the linked Yunxiao requirement identity', () => {
    const linked = {
      ...state,
      worktreesByRepo: {
        'repo-1': [
          makeWorktree({
            linkedWorkItem: {
              provider: 'yunxiao',
              type: 'issue',
              number: 0,
              title: 'DFHIS-31889 requirement',
              url: 'https://devops.aliyun.com/projex/req/DFHIS-31889',
              yunxiaoIdentifier: ' DFHIS-31889 '
            }
          })
        ]
      }
    }

    expect(resolveAgentRowWorkspaceTarget(linked, 'repo-1::/repo/orca')).toEqual({
      workspaceId: 'repo-1::/repo/orca',
      path: '/repo/orca',
      executionHostId: 'local',
      yunxiaoRequirementId: 'DFHIS-31889'
    })
  })

  it('derives the Yunxiao requirement identity from an automation workspace name', () => {
    const automationWorkspace = {
      ...state,
      worktreesByRepo: {
        'repo-1': [
          makeWorktree({
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
        ]
      }
    }

    expect(resolveAgentRowWorkspaceTarget(automationWorkspace, 'repo-1::/repo/orca')).toEqual({
      workspaceId: 'repo-1::/repo/orca',
      path: '/repo/orca',
      executionHostId: 'local',
      yunxiaoRequirementId: 'DFHIS-32238'
    })
  })

  it('derives an ssh host from the repo connection', () => {
    const remote = {
      ...state,
      repos: [{ id: 'repo-1', connectionId: 'prod-box' } as Repo]
    }
    expect(resolveAgentRowWorkspaceTarget(remote, 'repo-1::/repo/orca')?.executionHostId).toBe(
      'ssh:prod-box'
    )
  })

  it('resolves a folder workspace by workspace key', () => {
    expect(resolveAgentRowWorkspaceTarget(state, 'folder:folder-1')).toEqual({
      workspaceId: 'folder:folder-1',
      path: '/folders/notes',
      executionHostId: 'local'
    })
  })

  it('derives the Yunxiao requirement identity from a folder workspace name', () => {
    const namedFolder = {
      ...state,
      folderWorkspaces: [makeFolderWorkspace({ name: 'DFHIS-32238 医院组套药房修复' })]
    }

    expect(resolveAgentRowWorkspaceTarget(namedFolder, 'folder:folder-1')).toEqual({
      workspaceId: 'folder:folder-1',
      path: '/folders/notes',
      executionHostId: 'local',
      yunxiaoRequirementId: 'DFHIS-32238'
    })
  })

  it('resolves a remote folder workspace host', () => {
    const remoteFolder = {
      ...state,
      folderWorkspaces: [makeFolderWorkspace({ connectionId: 'prod-box' })]
    }
    expect(resolveAgentRowWorkspaceTarget(remoteFolder, 'folder:folder-1')?.executionHostId).toBe(
      'ssh:prod-box'
    )
  })

  it('returns null for unknown workspaces', () => {
    expect(resolveAgentRowWorkspaceTarget(state, 'repo-1::/repo/missing')).toBeNull()
    expect(resolveAgentRowWorkspaceTarget(state, 'folder:missing')).toBeNull()
  })
})
