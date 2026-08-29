/** Yunxiao todo pool automation claims: hand-off, finish, recovery, and load reconciliation. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { YunxiaoWorkItem } from '../../../shared/types'
import {
  testState,
  createStore,
  makeRepo
} from '../../persistence-test-harness'
import type { Store } from './store'

vi.mock('electron', () => ({
  app: {
    getPath: () => testState.dir
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`encrypted:${plaintext}`, 'utf-8'),
    decryptString: (ciphertext: Buffer) => {
      const decoded = ciphertext.toString('utf-8')
      if (!decoded.startsWith('encrypted:')) {
        throw new Error('invalid ciphertext')
      }
      return decoded.slice('encrypted:'.length)
    }
  }
}))

const { trackMock, getCohortAtEmitMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
  getCohortAtEmitMock: vi.fn()
}))

vi.mock('../../telemetry/client', () => ({
  track: trackMock
}))

vi.mock('../../telemetry/cohort-classifier', () => ({
  getCohortAtEmit: getCohortAtEmitMock
}))

const stores: Store[] = []

beforeEach(() => {
  testState.dir = mkdtempSync(join(tmpdir(), 'orca-yunxiao-pool-'))
  trackMock.mockReset()
  getCohortAtEmitMock.mockReset()
})

afterEach(() => {
  // Leaving a debounced save armed would write into a temp dir after the test file finishes.
  for (const store of stores.splice(0)) {
    store.flush()
  }
  rmSync(testState.dir, { recursive: true, force: true })
})

function trackedCreateStore(): Store {
  const store = createStore()
  stores.push(store)
  return store
}

const makeYunxiaoWorkItem = (overrides: Partial<YunxiaoWorkItem> = {}): YunxiaoWorkItem => ({
  id: 'yunxiao-item-1',
  serialNumber: 'DFHIS-31704',
  title: '折扣套餐，医嘱名称变更后，同步变更',
  category: 'Req',
  typeName: '产品类需求',
  statusId: 'status-wait-dev',
  statusName: '待开发',
  customer: '新疆佳音医院',
  priority: '中',
  assignee: { id: 'user-1', name: '笪帅江' },
  participants: [],
  sprint: { id: 'sprint-1', name: '20260730迭代' },
  updatedAt: '2026-07-23T00:00:00.000Z',
  url: 'https://devops.aliyun.com/projex/req/DFHIS-31704',
  ...overrides
})

describe('Yunxiao todo pool claims', () => {

  it('claims and finishes Yunxiao todo pool items for automation runs', async () => {
    const store = await trackedCreateStore()
    const item = makeYunxiaoWorkItem()
    store.addYunxiaoTodoPoolItems([item])

    const claimed = store.claimYunxiaoTodoPoolItems({
      automationId: 'automation-1',
      runId: 'run-1',
      statuses: ['queued'],
      limit: 1
    })

    expect(claimed).toHaveLength(1)
    expect(claimed[0]).toMatchObject({
      id: item.id,
      poolStatus: 'running',
      poolOrder: 99,
      attempts: 1,
      claimedByAutomationId: 'automation-1',
      claimedByRunId: 'run-1',
      lastError: null
    })
    expect(
      store.claimYunxiaoTodoPoolItems({
        automationId: 'automation-2',
        runId: 'run-2',
        statuses: ['queued'],
        limit: 1
      })
    ).toEqual([])

    const failed = store.finishYunxiaoTodoPoolClaim({
      runId: 'run-1',
      poolStatus: 'failed',
      error: 'archive failed'
    })

    expect(failed[0]).toMatchObject({
      poolStatus: 'failed',
      lastError: 'archive failed'
    })

    const queued = store.updateYunxiaoTodoPoolItem(item.id, { poolStatus: 'queued' })
    expect(queued).toMatchObject({
      poolStatus: 'queued',
      claimedAt: null,
      claimedByAutomationId: null,
      claimedByRunId: null,
      lastError: null
    })

    store.claimYunxiaoTodoPoolItems({
      automationId: 'automation-3',
      runId: 'run-3',
      statuses: ['queued'],
      limit: 1
    })
    const done = store.finishYunxiaoTodoPoolClaim({
      runId: 'run-3',
      poolStatus: 'done'
    })

    expect(done[0]).toMatchObject({
      poolStatus: 'ready-to-build',
      lastError: 'Requirement Contract is missing.'
    })
  })

  it('requeues recoverable Yunxiao failures after a durable backoff', async () => {
    const store = await trackedCreateStore()
    const item = makeYunxiaoWorkItem()
    store.addYunxiaoTodoPoolItems([item])
    store.claimYunxiaoTodoPoolItems({
      automationId: 'automation-1',
      runId: 'run-1',
      statuses: ['queued'],
      limit: 1
    })

    const [requeued] = store.finishYunxiaoTodoPoolClaim({
      runId: 'run-1',
      poolStatus: 'failed',
      automationRunStatus: 'dispatch_failed',
      error: 'fetch failed: ECONNRESET'
    })

    expect(requeued).toMatchObject({
      poolStatus: 'queued',
      lastFailureKind: 'transient_infrastructure',
      claimedAt: null,
      claimedByRunId: null
    })
    expect(requeued.retryNotBefore).toBeGreaterThan(Date.now())
    expect(
      store.claimYunxiaoTodoPoolItems({
        automationId: 'automation-2',
        runId: 'run-2',
        statuses: ['queued'],
        limit: 1
      })
    ).toEqual([])
  })

  it('recovers an expired Yunxiao claim and eventually exhausts its budget', async () => {
    const store = await trackedCreateStore()
    const item = makeYunxiaoWorkItem()
    store.addYunxiaoTodoPoolItems([item])
    const firstClaim = store.claimYunxiaoTodoPoolItems({
      automationId: 'automation-1',
      runId: 'missing-run',
      statuses: ['queued'],
      limit: 1
    })[0]!

    const [recovered] = store.recoverStaleYunxiaoTodoPoolClaims(firstClaim.claimedAt! + 1)

    expect(recovered).toMatchObject({
      poolStatus: 'queued',
      lastFailureKind: 'host_unavailable',
      claimedAt: null
    })
  })

  it('reconciles completed Yunxiao todo pool claims that were left in workspace-created state', async () => {
    const store = await trackedCreateStore()
    store.addRepo(makeRepo())
    const item = makeYunxiaoWorkItem()
    store.addYunxiaoTodoPoolItems([item])
    const automation = store.createAutomation({
      name: 'Yunxiao todo pool',
      prompt: 'Pick up the next Yunxiao item.',
      yunxiaoTodoPool: { kind: 'yunxiao-todo-pool', statuses: ['queued'], batchSize: 1 },
      agentId: 'codex',
      projectId: 'r1',
      workspaceMode: 'existing',
      workspaceId: 'wt1',
      timezone: 'UTC',
      rrule: 'FREQ=HOURLY;BYMINUTE=15',
      dtstart: new Date('2026-05-14T00:00:00Z').getTime()
    })
    const run = store.createAutomationRun(automation, Date.now(), 'manual')
    store.claimYunxiaoTodoPoolItems({
      automationId: automation.id,
      runId: run.id,
      statuses: ['queued'],
      limit: 1
    })
    store.setAutomationRunYunxiaoTodoPoolClaim(run.id, {
      itemIds: [item.id],
      claimedAt: Date.now()
    })
    store.updateYunxiaoTodoPoolItem(item.id, {
      poolStatus: 'workspace-created',
      lastError: 'stale failure'
    })
    store.updateAutomationRun({
      runId: run.id,
      status: 'completed',
      workspaceId: 'wt1',
      error: null
    })

    expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
      id: item.id,
      poolStatus: 'ready-to-build',
      lastError: 'Requirement Contract is missing.'
    })

    const reloaded = await trackedCreateStore()

    expect(reloaded.getYunxiaoTodoPool()[0]).toMatchObject({
      id: item.id,
      poolStatus: 'ready-to-build',
      lastError: 'Requirement Contract is missing.'
    })
  })

  it('does not finish Yunxiao todo pool claims that are waiting for clarification', async () => {
    const store = await trackedCreateStore()
    store.addRepo(makeRepo())
    const item = makeYunxiaoWorkItem()
    store.addYunxiaoTodoPoolItems([item])
    const automation = store.createAutomation({
      name: 'Yunxiao todo pool',
      prompt: 'Pick up the next Yunxiao item.',
      yunxiaoTodoPool: { kind: 'yunxiao-todo-pool', statuses: ['queued'], batchSize: 1 },
      agentId: 'codex',
      projectId: 'r1',
      workspaceMode: 'existing',
      workspaceId: 'wt1',
      timezone: 'UTC',
      rrule: 'FREQ=HOURLY;BYMINUTE=15',
      dtstart: new Date('2026-05-14T00:00:00Z').getTime()
    })
    const run = store.createAutomationRun(automation, Date.now(), 'manual')
    store.claimYunxiaoTodoPoolItems({
      automationId: automation.id,
      runId: run.id,
      statuses: ['queued'],
      limit: 1
    })
    store.setAutomationRunYunxiaoTodoPoolClaim(run.id, {
      itemIds: [item.id],
      claimedAt: Date.now()
    })
    store.updateYunxiaoTodoPoolItem(item.id, { poolStatus: 'needs-clarification' })
    store.updateAutomationRun({
      runId: run.id,
      status: 'completed',
      workspaceId: 'wt1',
      error: null
    })

    expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
      id: item.id,
      poolStatus: 'needs-clarification',
      lastError: null
    })
  })

  it('does not reconcile stale completed claims over ready-to-build todo pool items', async () => {
    const store = await trackedCreateStore()
    store.addRepo(makeRepo())
    const item = makeYunxiaoWorkItem()
    store.addYunxiaoTodoPoolItems([item])
    const automation = store.createAutomation({
      name: 'Yunxiao todo pool',
      prompt: 'Pick up the next Yunxiao item.',
      yunxiaoTodoPool: { kind: 'yunxiao-todo-pool', statuses: ['queued'], batchSize: 1 },
      agentId: 'codex',
      projectId: 'r1',
      workspaceMode: 'existing',
      workspaceId: 'wt1',
      timezone: 'UTC',
      rrule: 'FREQ=HOURLY;BYMINUTE=15',
      dtstart: new Date('2026-05-14T00:00:00Z').getTime()
    })
    const run = store.createAutomationRun(automation, Date.now(), 'manual')
    store.claimYunxiaoTodoPoolItems({
      automationId: automation.id,
      runId: run.id,
      statuses: ['queued'],
      limit: 1
    })
    store.setAutomationRunYunxiaoTodoPoolClaim(run.id, {
      itemIds: [item.id],
      claimedAt: Date.now()
    })
    store.updateYunxiaoTodoPoolItem(item.id, { poolStatus: 'ready-to-build' })
    store.updateAutomationRun({
      runId: run.id,
      status: 'completed',
      workspaceId: 'wt1',
      error: null
    })

    expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
      id: item.id,
      poolStatus: 'ready-to-build'
    })

    const reloaded = await trackedCreateStore()
    expect(reloaded.getYunxiaoTodoPool()[0]).toMatchObject({
      id: item.id,
      poolStatus: 'ready-to-build'
    })
  })
})
