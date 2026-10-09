import { closeTestStores, createStore, testState, makeRepo } from '../persistence-test-harness'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { YunxiaoWorkItem } from '../../shared/yunxiao-types'
import { AutomationService } from './service'

vi.mock('electron', () => ({
  app: {
    getPath: () => testState.dir
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`encrypted:${plaintext}`, 'utf-8'),
    decryptString: (ciphertext: Buffer) => ciphertext.toString('utf-8').slice('encrypted:'.length)
  }
}))

const makeYunxiaoWorkItem = (overrides: Partial<YunxiaoWorkItem> = {}): YunxiaoWorkItem => ({
  id: 'item-1',
  serialNumber: 'DFHIS-31704',
  title: '折扣套餐，医嘱名称变更后，同步变更',
  category: 'Req',
  typeName: '产品类需求',
  statusId: 'todo',
  statusName: '待开发',
  customer: '新疆佳音医院',
  priority: '中',
  assignee: { id: 'u1', name: '竺帅江' },
  participants: [],
  sprint: { id: 's1', name: '20260730迭代' },
  updatedAt: null,
  url: 'https://devops.aliyun.com/workitem/DFHIS-31704',
  ...overrides
})

describe('Yunxiao todo pool automation service', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-yunxiao-automation-test-'))
    vi.useFakeTimers()
  })

  afterEach(async () => {
    await closeTestStores()
    vi.useRealTimers()
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('claims a Yunxiao todo pool item before dispatching the automation', async () => {
    vi.setSystemTime(new Date('2026-05-13T08:00:00Z'))
    const store = await createStore()
    store.addRepo(makeRepo())
    store.addYunxiaoTodoPoolItems([makeYunxiaoWorkItem()])
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
    const send = vi.fn()
    const service = new AutomationService(store, { tickMs: 60_000 })
    service.setWebContents({
      isDestroyed: () => false,
      send
    } as never)
    service.setRendererReady()

    const run = await service.runNow(automation.id)

    expect(run.status).toBe('dispatching')
    expect(run.yunxiaoTodoPoolClaim?.itemIds).toEqual(['item-1'])
    expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
      id: 'item-1',
      poolStatus: 'running',
      poolOrder: 99,
      attempts: 1,
      claimedByAutomationId: automation.id,
      claimedByRunId: run.id
    })
    const [, payload] = send.mock.calls[0]
    expect(payload.automation.prompt).toContain('DFHIS-31704')
    // Why: the compact workflow replaced the older "direct Yunxiao MCP" wording (285a3ebe54).
    expect(payload.automation.prompt).toContain('执行 $yunxiao-requirement-archiver')
    expect(payload.automation.prompt).toContain('用户可见内容使用中文')
    expect(payload.automation.prompt).toContain('Requirement Contract')
    expect(payload.automation.prompt).toContain('needs_clarification')
    expect(payload.automation.prompt).toContain('阻断时写明合同状态和精确原因')
    expect(payload.automation.prompt).not.toContain('Archive the requirement through HIS MCP')
    // Why: the code-root chain now names DFHIS Setup instead of the raw dfhis-environment.json path.
    expect(payload.automation.prompt).toContain('DFHIS Setup hisCodeRoot')

    await service.markDispatchResult({
      runId: run.id,
      status: 'completed',
      workspaceId: 'wt1'
    })

    expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
      poolStatus: 'ready-to-build',
      lastError: 'Requirement Contract is missing.'
    })
  })

  it('claims actionable Yunxiao pool states for queued-only automations', async () => {
    vi.setSystemTime(new Date('2026-05-13T08:00:00Z'))
    const store = await createStore()
    store.addRepo(makeRepo())
    store.addYunxiaoTodoPoolItems([
      makeYunxiaoWorkItem({ id: 'workspace-item', serialNumber: 'DFHIS-31705' }),
      makeYunxiaoWorkItem({ id: 'ready-item', serialNumber: 'DFHIS-31706' }),
      makeYunxiaoWorkItem({ id: 'clarify-item', serialNumber: 'DFHIS-31707' })
    ])
    store.updateYunxiaoTodoPoolItem('workspace-item', { poolStatus: 'workspace-created' })
    store.updateYunxiaoTodoPoolItem('ready-item', { poolStatus: 'ready-to-build' })
    store.updateYunxiaoTodoPoolItem('clarify-item', { poolStatus: 'needs-clarification' })
    const automation = store.createAutomation({
      name: 'Yunxiao todo pool',
      prompt: 'Pick up the next Yunxiao item.',
      yunxiaoTodoPool: { kind: 'yunxiao-todo-pool', statuses: ['queued'], batchSize: 3 },
      agentId: 'codex',
      projectId: 'r1',
      workspaceMode: 'existing',
      workspaceId: 'wt1',
      timezone: 'UTC',
      rrule: 'FREQ=HOURLY;BYMINUTE=15',
      dtstart: new Date('2026-05-14T00:00:00Z').getTime()
    })
    const send = vi.fn()
    const service = new AutomationService(store, { tickMs: 60_000 })
    service.setWebContents({
      isDestroyed: () => false,
      send
    } as never)
    service.setRendererReady()

    const run = await service.runNow(automation.id)

    expect(run.status).toBe('dispatching')
    expect(run.title).toBe('DFHIS-31705 折扣套餐，医嘱名称变更后，同步变更 +1')
    expect(run.yunxiaoTodoPoolClaim?.itemIds).toHaveLength(2)
    expect(run.yunxiaoTodoPoolClaim?.itemIds).toEqual(
      expect.arrayContaining(['workspace-item', 'ready-item'])
    )
    expect(store.getYunxiaoTodoPool()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'workspace-item', poolStatus: 'running', attempts: 1 }),
        expect.objectContaining({ id: 'ready-item', poolStatus: 'running', attempts: 1 }),
        expect.objectContaining({ id: 'clarify-item', poolStatus: 'needs-clarification' })
      ])
    )
    expect(send).toHaveBeenCalled()
  })

  it('keeps a launched Yunxiao claim done when the renderer marks the run completed', async () => {
    vi.setSystemTime(new Date('2026-05-13T08:00:00Z'))
    const store = await createStore()
    store.addRepo(makeRepo())
    store.addYunxiaoTodoPoolItems([makeYunxiaoWorkItem()])
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
      itemIds: ['item-1'],
      claimedAt: Date.now()
    })
    store.updateYunxiaoTodoPoolItem('item-1', { poolStatus: 'workspace-created' })
    store.updateAutomationRun({
      runId: run.id,
      status: 'dispatched',
      workspaceId: 'wt1',
      terminalSessionId: 'tab-1',
      terminalPaneKey: 'tab-1:pane-1',
      error: null
    })
    const service = new AutomationService(store, { tickMs: 60_000 })

    await service.markDispatchResult({
      runId: run.id,
      status: 'completed',
      workspaceId: 'wt1',
      terminalSessionId: 'tab-1',
      terminalPaneKey: 'tab-1:pane-1',
      error: null
    })

    expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
      id: 'item-1',
      poolStatus: 'done',
      lastError: null
    })
  })

  it('skips a Yunxiao todo pool automation when no matching items are queued', async () => {
    vi.setSystemTime(new Date('2026-05-13T08:00:00Z'))
    const store = await createStore()
    store.addRepo(makeRepo())
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
    const send = vi.fn()
    const service = new AutomationService(store, { tickMs: 60_000 })
    service.setWebContents({
      isDestroyed: () => false,
      send
    } as never)
    service.setRendererReady()

    const run = await service.runNow(automation.id)

    expect(run.status).toBe('skipped_precheck')
    expect(run.error).toBe('No matching actionable Yunxiao todo pool items are available.')
    expect(send).not.toHaveBeenCalled()
  })
})
