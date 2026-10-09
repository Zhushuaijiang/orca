import { describe, expect, it, vi } from 'vitest'
import type { AutomationDispatchRequest } from '../../shared/automations-types'
import { AutomationService } from './service'
import type { HeadlessAutomationDispatcher } from './headless-dispatch'
import { reconcileYunxiaoTodoPoolClaims } from '../persistence/scheduling-automations/yunxiao-todo-pool-claim-reconciliation'
import {
  createWorkerMaintenanceFixture,
  maintenanceBarrier
} from '../persistence/loading-store/profile-state-maintenance-fixture'

vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({
  getCohortAtEmit: () => ({ nth_repo_added: 2 })
}))
vi.mock('../ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))

async function fixture(workspaceMode: 'existing' | 'new_per_run') {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
  const fixture = await createWorkerMaintenanceFixture()
  for (const automation of fixture.store.listAutomations()) {
    fixture.store.updateAutomation(automation.id, { enabled: false })
  }
  fixture.store.addYunxiaoTodoPoolItems([
    {
      id: 'requirement-1',
      serialNumber: 'DFHIS-32684',
      title: 'Dispatch regression',
      category: 'Req',
      typeName: null,
      statusId: null,
      statusName: null,
      customer: null,
      priority: null,
      assignee: null,
      participants: [],
      sprint: null,
      updatedAt: null,
      url: null
    }
  ])
  const automation = fixture.store.createAutomation({
    name: 'Todo pool',
    prompt: 'Process the next requirement.',
    yunxiaoTodoPool: { kind: 'yunxiao-todo-pool', statuses: ['queued'], batchSize: 1 },
    agentId: 'claude',
    projectId: 'repo-local',
    workspaceMode,
    workspaceId: workspaceMode === 'existing' ? 'repo-local::/fixture/local' : null,
    timezone: 'UTC',
    rrule: 'FREQ=HOURLY;BYMINUTE=0',
    dtstart: Date.now() - 60_000
  })
  await fixture.store.flushPendingOrThrowAsync()
  return { ...fixture, automation, clock }
}

describe('Yunxiao claim prompt and automation configuration fence', () => {
  it.each([
    ['existing', 'renderer', 'manual'],
    ['new_per_run', 'renderer', 'manual'],
    ['existing', 'headless', 'manual'],
    ['new_per_run', 'headless', 'manual'],
    ['new_per_run', 'renderer', 'scheduled'],
    ['new_per_run', 'headless', 'scheduled']
  ] as const)(
    'dispatches a %s workspace through %s on a %s run with the claimed prompt',
    async (workspaceMode, transport, trigger) => {
      const { store, automation, clock, readState } = await fixture(workspaceMode)
      const launch = vi.fn<HeadlessAutomationDispatcher>(async () => ({
        workspaceId: 'repo-local::/fixture/local',
        terminalSessionId: 'run-tab'
      }))
      const send = vi.fn<(channel: string, payload: AutomationDispatchRequest) => void>()
      const service = new AutomationService(
        store,
        transport === 'headless' ? { headlessDispatcher: launch } : {}
      )
      try {
        if (trigger === 'scheduled') {
          clock.mockReturnValue(automation.nextRunAt)
        }
        if (transport === 'renderer') {
          service.setWebContents({ isDestroyed: () => false, send })
          service.setRendererReady()
        } else if (trigger === 'scheduled') {
          service.start()
        }
        if (trigger === 'manual') {
          await service.runNow(automation.id)
        }
        await vi.waitFor(() => {
          expect(transport === 'renderer' ? send : launch).toHaveBeenCalledOnce()
        })
        const dispatched =
          transport === 'renderer'
            ? send.mock.calls[0][1].automation
            : launch.mock.calls[0][0].automation
        expect(dispatched.prompt).toContain('DFHIS-32684')
        expect(dispatched.prompt).toContain('Yunxiao todo pool claim:')
        expect(
          readState().automations.find((entry: { id: string }) => entry.id === automation.id)
        ).toMatchObject({ prompt: automation.prompt })
        expect(store.listAutomationRuns(automation.id)[0]).toMatchObject({
          status: transport === 'renderer' ? 'dispatching' : 'dispatched',
          trigger,
          yunxiaoTodoPoolClaim: { itemIds: ['requirement-1'] }
        })
        if (transport === 'renderer') {
          await service.markDispatchResult({
            runId: store.listAutomationRuns(automation.id)[0].id,
            status: 'dispatched',
            workspaceId: 'repo-local::/fixture/local'
          })
        }
        expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
          poolStatus: 'done',
          claimedByRunId: null,
          requirementContract: null
        })
        clock.mockReturnValue(Date.now() + 1_000)
        await expect(service.runNow(automation.id)).resolves.toMatchObject({
          status: 'skipped_precheck'
        })
        expect(transport === 'renderer' ? send : launch).toHaveBeenCalledOnce()
      } finally {
        service.stop()
      }
    }
  )

  it.each(['completed', 'dispatch_failed'] as const)(
    'keeps a launched requirement consumed after %s and records its delivery outcome',
    async (status) => {
      const { store, automation } = await fixture('new_per_run')
      const service = new AutomationService(store, {
        headlessDispatcher: async () => ({
          workspaceId: 'repo-local::/fixture/local',
          terminalSessionId: 'run-tab'
        })
      })
      try {
        const run = await service.runNow(automation.id)
        await service.markDispatchResult({
          runId: run.id,
          status,
          error: status === 'dispatch_failed' ? 'HTTP 503' : null,
          yunxiaoRequirementOutcomes: [
            {
              itemId: 'requirement-1',
              poolStatus: 'ready-to-build',
              requirementContract: null,
              evidence: 'Delivery still needs verification.',
              updatedAt: Date.now()
            }
          ]
        })
        expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
          poolStatus: 'done',
          claimedByRunId: null,
          retryNotBefore: null
        })
        expect(store.listAutomationRuns(automation.id)[0]).toMatchObject({
          status,
          yunxiaoRequirementOutcomes: [expect.objectContaining({ poolStatus: 'ready-to-build' })]
        })
      } finally {
        service.stop()
      }
    }
  )

  it('restores started legacy claims as done while preserving a manually requeued item', async () => {
    const { store, automation } = await fixture('new_per_run')
    const run = store.createAutomationRun(automation, Date.now(), 'manual')
    const [claimed] = store.claimYunxiaoTodoPoolItems({
      automationId: automation.id,
      runId: run.id,
      statuses: ['queued'],
      limit: 1
    })
    const state = {
      automationRuns: [{ ...run, status: 'dispatched' as const, dispatchedAt: Date.now() }],
      yunxiaoTodoPool: [claimed]
    }
    expect(reconcileYunxiaoTodoPoolClaims(state).state.yunxiaoTodoPool[0]).toMatchObject({
      poolStatus: 'done',
      claimedByRunId: null
    })
    const requeued = { ...claimed, poolStatus: 'queued' as const, claimedByRunId: null }
    expect(
      reconcileYunxiaoTodoPoolClaims({ ...state, yunxiaoTodoPool: [requeued] }).state
        .yunxiaoTodoPool[0]
    ).toEqual(requeued)
  })

  it('still refuses a real prompt edit while the claim dispatch is being persisted', async () => {
    const { store, automation } = await fixture('new_per_run')
    const blocked = maintenanceBarrier()
    const release = maintenanceBarrier()
    const flush = store.flushPendingOrThrowAsync.bind(store)
    let calls = 0
    vi.spyOn(store, 'flushPendingOrThrowAsync').mockImplementation(async (options) => {
      if (++calls === 2) {
        blocked.resolve()
        await release.promise
      }
      await flush(options)
    })
    const dispatcher = vi.fn<HeadlessAutomationDispatcher>(async () => ({
      workspaceId: 'repo-local::/fixture/local',
      terminalSessionId: 'run-tab'
    }))
    const service = new AutomationService(store, { headlessDispatcher: dispatcher })
    try {
      const pending = service.runNow(automation.id)
      await blocked.promise
      store.updateAutomation(automation.id, { prompt: 'Changed instructions.' })
      release.resolve()
      await expect(pending).resolves.toMatchObject({
        status: 'skipped_unavailable',
        error: 'The automation changed before this run could launch.'
      })
      expect(dispatcher).not.toHaveBeenCalled()
      expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
        poolStatus: 'queued',
        claimedByRunId: null
      })
    } finally {
      release.resolve()
      service.stop()
    }
  })
})
