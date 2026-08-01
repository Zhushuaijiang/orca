import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/types'
import type { YunxiaoWorkItem } from '../../shared/yunxiao-types'
import { AutomationService } from './service'

const testState = { dir: '' }

vi.mock('electron', () => ({
  app: { getPath: () => testState.dir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`encrypted:${plaintext}`, 'utf8'),
    decryptString: (ciphertext: Buffer) => ciphertext.toString('utf8').slice('encrypted:'.length)
  }
}))

async function createStore() {
  vi.resetModules()
  const { Store, initDataPath } = await import('../persistence')
  initDataPath()
  return new Store()
}

const repo: Repo = {
  id: 'r1',
  path: '/repo',
  displayName: 'test',
  badgeColor: '#fff',
  addedAt: 1
}

const workItem: YunxiaoWorkItem = {
  id: 'item-1',
  serialNumber: 'DFHIS-31704',
  title: 'Yunxiao recovery test',
  category: 'Req',
  typeName: 'Requirement',
  statusId: 'todo',
  statusName: 'Todo',
  customer: null,
  priority: 'medium',
  assignee: null,
  participants: [],
  sprint: null,
  updatedAt: null,
  url: null
}

describe('AutomationService claim recovery', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-automation-recovery-test-'))
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('requeues a Yunxiao claim when the execution host is temporarily unavailable', async () => {
    vi.setSystemTime(new Date('2026-05-13T08:00:00Z'))
    const store = await createStore()
    store.addRepo(repo)
    store.addYunxiaoTodoPoolItems([workItem])
    const automation = store.createAutomation({
      name: 'Yunxiao todo pool',
      prompt: 'Pick up the next Yunxiao item.',
      yunxiaoTodoPool: { kind: 'yunxiao-todo-pool', statuses: ['queued'], batchSize: 1 },
      agentId: 'codex',
      projectId: repo.id,
      workspaceMode: 'existing',
      workspaceId: 'wt1',
      timezone: 'UTC',
      rrule: 'FREQ=HOURLY;BYMINUTE=15',
      dtstart: Date.now()
    })
    const run = store.createAutomationRun(automation, Date.now(), 'manual')
    store.claimYunxiaoTodoPoolItems({
      automationId: automation.id,
      runId: run.id,
      statuses: ['queued'],
      limit: 1
    })
    store.setAutomationRunYunxiaoTodoPoolClaim(run.id, {
      itemIds: [workItem.id],
      claimedAt: Date.now()
    })

    await new AutomationService(store).markDispatchResult({
      runId: run.id,
      status: 'skipped_unavailable',
      workspaceId: 'wt1',
      error: 'No Orca window was available to launch the automation.'
    })

    expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
      poolStatus: 'queued',
      lastFailureKind: 'host_unavailable',
      claimedAt: null
    })
    expect(store.getYunxiaoTodoPool()[0]?.retryNotBefore).toBeGreaterThan(Date.now())
  })
})
