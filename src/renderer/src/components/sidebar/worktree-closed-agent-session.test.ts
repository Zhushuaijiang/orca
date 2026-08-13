import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SleepingAgentSessionRecord } from '../../../../shared/agent-session-resume'

const mocks = vi.hoisted(() => ({
  takeRecentlyClosedAgentSessions: vi.fn(),
  launchSleepingAgentSession: vi.fn(),
  activateAndRevealWorktree: vi.fn(),
  activateAndRevealFolderWorkspace: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      takeRecentlyClosedAgentSessions: mocks.takeRecentlyClosedAgentSessions
    })
  }
}))

vi.mock('@/lib/sleeping-agent-session-launch', () => ({
  launchSleepingAgentSession: mocks.launchSleepingAgentSession
}))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: mocks.activateAndRevealWorktree,
  activateAndRevealFolderWorkspace: mocks.activateAndRevealFolderWorkspace
}))

import { restoreRecentlyClosedAgentSession } from './worktree-closed-agent-session'

function session(paneKey: string): SleepingAgentSessionRecord {
  return {
    paneKey,
    worktreeId: 'wt-1',
    agent: 'codex',
    providerSession: { key: 'session_id', id: paneKey },
    prompt: '',
    state: 'working',
    capturedAt: 1,
    updatedAt: 1
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('restoreRecentlyClosedAgentSession', () => {
  it('restores every session from the closed tab and then opens its worktree', () => {
    const sessions = [session('tab-1:leaf-1'), session('tab-1:leaf-2')]
    mocks.takeRecentlyClosedAgentSessions.mockReturnValue(sessions)
    mocks.launchSleepingAgentSession.mockReturnValue(true)

    expect(restoreRecentlyClosedAgentSession('wt-1')).toBe(2)

    expect(mocks.launchSleepingAgentSession.mock.calls).toEqual([[sessions[0]], [sessions[1]]])
    expect(mocks.activateAndRevealWorktree).toHaveBeenCalledWith('wt-1')
  })

  it('does not navigate when no closed agent session exists', () => {
    mocks.takeRecentlyClosedAgentSessions.mockReturnValue(null)

    expect(restoreRecentlyClosedAgentSession('wt-1')).toBe(0)
    expect(mocks.launchSleepingAgentSession).not.toHaveBeenCalled()
    expect(mocks.activateAndRevealWorktree).not.toHaveBeenCalled()
    expect(mocks.activateAndRevealFolderWorkspace).not.toHaveBeenCalled()
  })

  it('opens a restored folder workspace through its folder activation path', () => {
    mocks.takeRecentlyClosedAgentSessions.mockReturnValue([session('tab-1:leaf-1')])
    mocks.launchSleepingAgentSession.mockReturnValue(true)

    expect(restoreRecentlyClosedAgentSession('folder:folder-1')).toBe(1)

    expect(mocks.activateAndRevealFolderWorkspace).toHaveBeenCalledWith('folder-1')
    expect(mocks.activateAndRevealWorktree).not.toHaveBeenCalled()
  })
})
