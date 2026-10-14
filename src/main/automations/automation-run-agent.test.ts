import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Automation, AutomationRun } from '../../shared/automations-types'
import type { TuiAgent } from '../../shared/tui-agent'
import type { Repo } from '../../shared/repo-types'
import type { Store } from '../persistence'
import type { AutomationRunWriter } from './automation-run-writer'
import { requestAutomationDispatch } from './automation-dispatch-request'
import { resolveAutomationRunAgent } from './automation-run-agent'

const LOCAL_REPO: Repo = {
  id: 'repo-1',
  path: '/repo',
  displayName: 'Repo',
  badgeColor: '#fff',
  addedAt: 1
}

const WSL_REPO: Repo = { ...LOCAL_REPO, path: '/wsl', kind: 'folder' }
const WSL_CWD = '//wsl.localhost/Ubuntu/home/dev/project'

function makeAutomation(agentId: TuiAgent): Automation {
  return {
    id: 'automation-1',
    name: 'Nightly',
    prompt: 'Run checks',
    precheck: null,
    agentId,
    projectId: 'repo-1',
    executionTargetType: 'local',
    executionTargetId: 'local',
    schedulerOwner: 'local_host_service',
    workspaceMode: 'existing',
    baseBranch: null,
    reuseSession: false,
    timezone: 'UTC',
    rrule: 'FREQ=DAILY',
    dtstart: 1,
    enabled: true,
    nextRunAt: 2,
    missedRunPolicy: 'run_once_within_grace',
    missedRunGraceMinutes: 720,
    createdAt: 1,
    updatedAt: 1,
    runContext: {
      kind: 'workspace-run',
      projectId: 'repo:repo-1',
      hostId: 'local',
      projectHostSetupId: 'repo-1',
      repoId: 'repo-1',
      path: '/repo'
    }
  } as Automation
}

const TARGET = { ok: true as const, cwd: '/repo', repo: LOCAL_REPO }

describe('resolveAutomationRunAgent', () => {
  it('runs native Windows teams as plain Claude', () => {
    expect(resolveAutomationRunAgent('claude-agent-teams', TARGET, 'win32')).toBe('claude')
  })

  it.each(['darwin', 'linux'] as const)('keeps teams on %s', (platform) => {
    expect(resolveAutomationRunAgent('claude-agent-teams', TARGET, platform)).toBe(
      'claude-agent-teams'
    )
  })

  it('keeps every other agent untouched on Windows', () => {
    expect(resolveAutomationRunAgent('claude', TARGET, 'win32')).toBe('claude')
    expect(resolveAutomationRunAgent('codex', TARGET, 'win32')).toBe('codex')
  })

  // Why: the wrapper has no Windows launcher, but an SSH host runs its own platform,
  // so the client's win32 must not downgrade a run that happens elsewhere.
  it('does not downgrade a run owned by another host', () => {
    const sshRepo = { ...LOCAL_REPO, executionHostId: 'ssh:server' } as Repo
    expect(
      resolveAutomationRunAgent(
        'claude-agent-teams',
        { ok: true, cwd: '/repo', repo: sshRepo },
        'win32'
      )
    ).toBe('claude-agent-teams')
  })

  // Why: a WSL guest is linux even when Orca runs on Windows, and the config treats WSL
  // as the in-process fallback rather than the unsupported native-pane launcher.
  it('does not downgrade a WSL folder workspace opened from Windows', () => {
    expect(
      resolveAutomationRunAgent(
        'claude-agent-teams',
        { ok: true, cwd: WSL_CWD, repo: WSL_REPO },
        'win32'
      )
    ).toBe('claude-agent-teams')
  })
})

/** Drives one dispatch through the renderer channel and reports the payload it received. */
async function dispatchThroughRenderer(agentId: TuiAgent): Promise<Automation | null> {
  const automation = makeAutomation(agentId)
  let run: AutomationRun = {
    id: 'run-1',
    automationId: automation.id,
    title: 'Nightly run',
    scheduledFor: 1,
    status: 'pending',
    trigger: 'scheduled',
    workspaceId: automation.workspaceId ?? null,
    sessionKind: 'terminal',
    chatSessionId: null,
    terminalSessionId: null,
    terminalPaneKey: null,
    terminalPtyId: null,
    outputSnapshot: null,
    precheckResult: null,
    usage: null,
    error: null,
    startedAt: null,
    dispatchedAt: null,
    createdAt: 1
  }
  const runs = {
    updateRun: async (args: { runId: string; status: AutomationRun['status'] }) => {
      run = { ...run, status: args.status }
      return run
    }
  } as unknown as AutomationRunWriter
  const store = {
    listAutomationRuns: () => [run],
    listAutomations: () => [automation],
    flushPendingOrThrowAsync: async () => {}
  } as unknown as Store
  let payload: Automation | null = null
  const target = { ok: true as const, cwd: '/repo', repo: LOCAL_REPO }
  await requestAutomationDispatch(
    {
      store,
      runs,
      isActive: () => true,
      getRenderer: () => ({
        isDestroyed: () => false,
        send: (_channel: string, request: { automation: Automation }) => {
          payload = request.automation
        }
      }),
      headlessDispatcher: null,
      resolveTarget: () => target,
      runPrecheck: async () => null,
      markDispatchResult: async () => run,
      watchRun: () => {}
    },
    automation,
    run,
    target
  )
  return payload
}

describe('automation dispatch agent resolution', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends plain Claude when a teams automation runs on native Windows', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')

    expect(await dispatchThroughRenderer('claude-agent-teams')).toMatchObject({ agentId: 'claude' })
  })

  it('sends teams unchanged off Windows', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')

    expect(await dispatchThroughRenderer('claude-agent-teams')).toMatchObject({
      agentId: 'claude-agent-teams'
    })
  })
})
