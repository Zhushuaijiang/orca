import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Automation, AutomationRun } from '../../../shared/automations-types'

const mockLaunchAgentBackgroundSession = vi.fn()
const mockRelease = vi.fn()
const state = {
  agentStatusByPaneKey: {} as Record<
    string,
    { interrupted?: boolean; providerSession?: { key: 'session_id'; id: string } }
  >,
  getKnownWorktreeById: vi.fn((worktreeId: string) =>
    worktreeId === 'wt-1' ? { id: 'wt-1', path: '/workspace/yunxiao' } : undefined
  )
}

vi.mock('@/lib/launch-agent-background-session', () => ({
  launchAgentBackgroundSession: (...args: unknown[]) => mockLaunchAgentBackgroundSession(...args)
}))

vi.mock('@/store', () => ({
  useAppStore: { getState: () => state }
}))

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 'automation-1',
    name: 'Yunxiao todo pool',
    prompt:
      'Yunxiao todo pool claim:\n1. DFHIS-32345\n  提交信息: https://devops.aliyun.com/projex/req/DFHIS-32345',
    precheck: null,
    yunxiaoTodoPool: {
      kind: 'yunxiao-todo-pool',
      statuses: ['queued'],
      batchSize: 1,
      reviewHandoff: { enabled: true, agentId: 'grok' }
    },
    agentId: 'kimi',
    projectId: 'repo-1',
    executionTargetType: 'local',
    executionTargetId: 'local',
    schedulerOwner: 'local_host_service',
    workspaceMode: 'new_per_run',
    workspaceId: null,
    baseBranch: null,
    reuseSession: false,
    timezone: 'UTC',
    rrule: 'FREQ=HOURLY',
    dtstart: 1,
    enabled: true,
    nextRunAt: 2,
    missedRunPolicy: 'run_once_within_grace',
    missedRunGraceMinutes: 30,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function makeRun(): AutomationRun {
  return {
    id: 'run-1',
    automationId: 'automation-1',
    title: 'DFHIS-32345 HQMS 导出',
    scheduledFor: 1,
    status: 'completed',
    trigger: 'manual',
    workspaceId: 'wt-1',
    sessionKind: 'terminal',
    chatSessionId: null,
    terminalSessionId: 'kimi-tab',
    terminalPaneKey: 'kimi-tab:leaf',
    terminalPtyId: 'pty-1',
    outputSnapshot: null,
    precheckResult: null,
    yunxiaoTodoPoolClaim: { itemIds: ['item-1'], claimedAt: 1 },
    yunxiaoRequirementOutcomes: [
      {
        itemId: 'item-1',
        poolStatus: 'done',
        requirementContract: {
          status: 'ready_to_verify',
          owner: 'qa',
          nextAction: 'QA verify',
          intent: 'export filename',
          archiveDir: '/workspace/yunxiao/DFHIS-32345',
          prdPath: null,
          evidenceUpdatedAt: 1,
          updatedAt: 1,
          blockingQuestions: [],
          decisions: [],
          riskProfile: null,
          reviewChecks: []
        },
        evidence: 'pushed',
        updatedAt: 1
      }
    ],
    yunxiaoRequirementOutcome: null,
    usage: null,
    error: null,
    startedAt: 1,
    dispatchedAt: 1,
    createdAt: 1
  }
}

describe('maybeLaunchYunxiaoReviewHandoff', () => {
  beforeEach(() => {
    mockLaunchAgentBackgroundSession.mockReset()
    mockRelease.mockReset()
    state.agentStatusByPaneKey = {
      'kimi-tab:leaf': {
        providerSession: { key: 'session_id', id: 'session_abc' }
      }
    }
    mockLaunchAgentBackgroundSession.mockResolvedValue({
      tabId: 'grok-tab',
      paneKey: 'grok-tab:leaf',
      ptyId: 'pty-2',
      startupPlan: {},
      terminalOwnership: { finalize: vi.fn(), release: mockRelease }
    })
  })

  it('launches the configured review agent in the same worktree', async () => {
    const { maybeLaunchYunxiaoReviewHandoff } = await import('./yunxiao-review-handoff-launch')

    await maybeLaunchYunxiaoReviewHandoff({
      automation: makeAutomation({
        yunxiaoTodoPool: {
          kind: 'yunxiao-todo-pool',
          statuses: ['queued'],
          batchSize: 1,
          reviewHandoff: { enabled: true, agentId: 'codex' }
        }
      }),
      run: makeRun(),
      worktreeId: 'wt-1',
      implementerPaneKey: 'kimi-tab:leaf',
      outputSnapshot: null
    })

    expect(mockLaunchAgentBackgroundSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'codex',
        worktreeId: 'wt-1',
        title: 'DFHIS-32345 审核',
        launchSource: 'task_page'
      })
    )
    const prompt = mockLaunchAgentBackgroundSession.mock.calls[0]?.[0]?.prompt as string
    expect(prompt).toContain('Orca Yunxiao review handoff: DFHIS-32345')
    expect(prompt).toContain('session_abc')
    expect(prompt).toContain('/workspace/yunxiao/DFHIS-32345')
    expect(mockRelease).toHaveBeenCalledTimes(1)
  })

  it('defaults a missing review handoff to grok', async () => {
    const { maybeLaunchYunxiaoReviewHandoff } = await import('./yunxiao-review-handoff-launch')

    await maybeLaunchYunxiaoReviewHandoff({
      automation: makeAutomation({
        yunxiaoTodoPool: {
          kind: 'yunxiao-todo-pool',
          statuses: ['queued'],
          batchSize: 1
        }
      }),
      run: makeRun(),
      worktreeId: 'wt-1',
      implementerPaneKey: 'kimi-tab:leaf',
      outputSnapshot: null
    })

    expect(mockLaunchAgentBackgroundSession).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'grok' })
    )
  })

  it('does not launch when review handoff is disabled', async () => {
    const { maybeLaunchYunxiaoReviewHandoff } = await import('./yunxiao-review-handoff-launch')

    await maybeLaunchYunxiaoReviewHandoff({
      automation: makeAutomation({
        yunxiaoTodoPool: {
          kind: 'yunxiao-todo-pool',
          statuses: ['queued'],
          batchSize: 1,
          reviewHandoff: { enabled: false, agentId: 'grok' }
        }
      }),
      run: makeRun(),
      worktreeId: 'wt-1',
      implementerPaneKey: 'kimi-tab:leaf',
      outputSnapshot: null
    })

    expect(mockLaunchAgentBackgroundSession).not.toHaveBeenCalled()
  })

  it('does not launch for ordinary automations', async () => {
    const { maybeLaunchYunxiaoReviewHandoff } = await import('./yunxiao-review-handoff-launch')

    await maybeLaunchYunxiaoReviewHandoff({
      automation: makeAutomation({ yunxiaoTodoPool: null }),
      run: makeRun(),
      worktreeId: 'wt-1',
      implementerPaneKey: 'kimi-tab:leaf',
      outputSnapshot: null
    })

    expect(mockLaunchAgentBackgroundSession).not.toHaveBeenCalled()
  })
})
