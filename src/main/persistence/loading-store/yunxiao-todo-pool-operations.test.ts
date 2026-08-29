/** Yunxiao todo pool item lifecycle: add/refresh/update/remove, ordering, manual gate transitions. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type {
  PersistedState,
  YunxiaoRequirementContractSnapshot,
  YunxiaoWorkItem
} from '../../../shared/types'
import {
  testState,
  createStore,
  writeDataFile,
  readDataFile
} from '../../persistence-test-harness'
import type { Store } from './store'
import { getDefaultPersistedState } from '../../../shared/constants'

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

describe('Yunxiao todo pool persistence', () => {

  it('persists Yunxiao todo pool items without duplicating existing work items', async () => {
    const store = await trackedCreateStore()
    const item = makeYunxiaoWorkItem()

    expect(store.getYunxiaoTodoPool()).toEqual([])
    const addedPool = store.addYunxiaoTodoPoolItems([item])
    expect(addedPool).toHaveLength(1)
    expect(addedPool[0]).toMatchObject({
      id: item.id,
      serialNumber: item.serialNumber,
      poolStatus: 'queued',
      poolOrder: 1,
      attempts: 0,
      claimedAt: null,
      claimedByAutomationId: null,
      claimedByRunId: null,
      lastError: null,
      notes: '',
      requirementContract: null
    })

    const updated = store.updateYunxiaoTodoPoolItem(item.id, {
      poolStatus: 'done',
      notes: 'handled'
    })
    expect(updated).toMatchObject({
      poolStatus: 'done',
      notes: 'handled',
      lastError: null
    })
    store.addYunxiaoTodoPoolItems([makeYunxiaoWorkItem({ title: 'refreshed title' })])
    expect(store.getYunxiaoTodoPool()).toHaveLength(1)
    expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
      title: 'refreshed title',
      poolStatus: 'done',
      poolOrder: 1,
      notes: 'handled'
    })

    store.flush()
    const reloaded = await trackedCreateStore()
    expect(reloaded.getYunxiaoTodoPool()).toHaveLength(1)
    expect(reloaded.removeYunxiaoTodoPoolItem(item.id)).toBe(true)
    expect(reloaded.getYunxiaoTodoPool()).toEqual([])
  })

  it('clears stale claim ownership from terminal Yunxiao pool items on load', async () => {
    writeDataFile({
      ...getDefaultPersistedState(testState.dir),
      yunxiaoTodoPool: [
        {
          ...makeYunxiaoWorkItem(),
          poolStatus: 'done',
          poolOrder: 1,
          addedAt: 1,
          poolUpdatedAt: 1,
          lastSyncedAt: null,
          attempts: 1,
          claimedAt: 123,
          claimedByAutomationId: 'automation-1',
          claimedByRunId: 'run-1',
          lastError: null,
          notes: '',
          requirementContract: null
        }
      ]
    })

    const store = await trackedCreateStore()

    expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
      poolStatus: 'done',
      claimedAt: null,
      claimedByAutomationId: null,
      claimedByRunId: null
    })
    store.flush()
    expect((readDataFile() as PersistedState).yunxiaoTodoPool[0]?.claimedAt).toBeNull()
  })

  it('orders Yunxiao todo pool items from top to bottom and claims in that order', async () => {
    const store = await trackedCreateStore()
    const first = makeYunxiaoWorkItem({ id: 'item-1', serialNumber: 'DFHIS-31771' })
    const second = makeYunxiaoWorkItem({ id: 'item-2', serialNumber: 'DFHIS-31772' })
    const third = makeYunxiaoWorkItem({ id: 'item-3', serialNumber: 'DFHIS-31773' })

    store.addYunxiaoTodoPoolItems([first, second, third])

    expect(store.getYunxiaoTodoPool().map((item) => item.serialNumber)).toEqual([
      'DFHIS-31771',
      'DFHIS-31772',
      'DFHIS-31773'
    ])

    const moved = store.updateYunxiaoTodoPoolItem('DFHIS-31773', { poolOrder: 1 })

    expect(moved).toMatchObject({ serialNumber: 'DFHIS-31773', poolOrder: 1 })
    expect(
      store
        .getYunxiaoTodoPool()
        .map((item) => ({ itemOrder: item.poolOrder, serialNumber: item.serialNumber }))
    ).toEqual([
      { itemOrder: 1, serialNumber: 'DFHIS-31773' },
      { itemOrder: 2, serialNumber: 'DFHIS-31771' },
      { itemOrder: 3, serialNumber: 'DFHIS-31772' }
    ])

    const claimed = store.claimYunxiaoTodoPoolItems({
      automationId: 'automation-1',
      runId: 'run-1',
      statuses: ['queued'],
      limit: 2
    })

    expect(claimed.map((item) => item.serialNumber)).toEqual(['DFHIS-31773', 'DFHIS-31771'])
    expect(claimed.map((item) => item.poolOrder)).toEqual([99, 99])
    expect(
      store
        .getYunxiaoTodoPool()
        .map((item) => ({ itemOrder: item.poolOrder, serialNumber: item.serialNumber }))
    ).toEqual([
      { itemOrder: 3, serialNumber: 'DFHIS-31772' },
      { itemOrder: 99, serialNumber: 'DFHIS-31773' },
      { itemOrder: 99, serialNumber: 'DFHIS-31771' }
    ])
  })

  it('updates and removes Yunxiao todo pool items by DFHIS serial number', async () => {
    const store = await trackedCreateStore()
    const item = makeYunxiaoWorkItem({ id: 'internal-31773', serialNumber: 'DFHIS-31773' })
    store.addYunxiaoTodoPoolItems([item])

    const updated = store.updateYunxiaoTodoPoolItem('DFHIS-31773', { poolStatus: 'done' })

    expect(updated).toMatchObject({
      id: 'internal-31773',
      serialNumber: 'DFHIS-31773',
      poolStatus: 'done',
      lastError: null
    })
    expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
      id: 'internal-31773',
      poolStatus: 'done'
    })
    expect(store.removeYunxiaoTodoPoolItem('DFHIS-31773')).toBe(true)
    expect(store.getYunxiaoTodoPool()).toEqual([])
  })

  it('preserves Yunxiao requirement contracts when work items refresh', async () => {
    const store = await trackedCreateStore()
    const item = makeYunxiaoWorkItem()
    store.addYunxiaoTodoPoolItems([item])
    const contract: YunxiaoRequirementContractSnapshot = {
      status: 'needs_clarification',
      owner: 'product',
      nextAction: 'Answer Q1 before code changes.',
      intent: 'Keep package order names synchronized after product rename.',
      archiveDir: '/archive/DFHIS-31704',
      prdPath: '/archive/DFHIS-31704/PRD_AND_CODE_ANALYSIS.md',
      evidenceUpdatedAt: 1_789_000_000_000,
      updatedAt: 1_789_000_000_001,
      blockingQuestions: [
        {
          id: 'Q1',
          question: 'Should historical package orders be renamed too?',
          whyBlocking: 'This changes the migration and compatibility behavior.',
          options: [
            {
              label: 'Only rename future orders',
              impact: 'Implementation updates sync-on-change logic only.',
              recommended: true
            }
          ]
        }
      ],
      decisions: [],
      riskProfile: null,
      reviewChecks: [],
      methodologyGate: {
        designConfirmed: true,
        alternatives: [
          {
            id: 'A1',
            summary: 'Update sync-on-change only.',
            tradeoff: 'Avoids retroactive migration risk.',
            decision: 'selected',
            reason: 'Matches current compatibility expectations.'
          }
        ],
        implementationPlan: {
          status: 'required',
          path: null,
          summary: 'Plan must be completed after Q1 is answered.',
          updatedAt: 1_789_000_000_002
        },
        verificationEvidence: [
          {
            id: 'VE-001',
            type: 'command',
            command: 'pnpm test',
            artifactPath: null,
            result: 'blocked',
            summary: 'Blocked until Q1 is answered.',
            collectedAt: 1_789_000_000_003
          }
        ]
      }
    }

    const updated = store.updateYunxiaoTodoPoolItem(item.id, {
      poolStatus: 'needs-clarification',
      requirementContract: contract
    })

    expect(updated).toMatchObject({
      poolStatus: 'needs-clarification',
      requirementContract: contract,
      claimedAt: null,
      claimedByAutomationId: null,
      claimedByRunId: null
    })
    store.addYunxiaoTodoPoolItems([makeYunxiaoWorkItem({ title: 'refreshed title' })])
    expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
      title: 'refreshed title',
      poolStatus: 'needs-clarification',
      requirementContract: contract
    })

    store.flush()
    const reloaded = await trackedCreateStore()
    expect(reloaded.getYunxiaoTodoPool()[0]).toMatchObject({
      poolStatus: 'needs-clarification',
      requirementContract: contract
    })
  })

  it('skips Yunxiao todo pool claims when the requirement contract is not buildable', async () => {
    const store = await trackedCreateStore()
    const item = makeYunxiaoWorkItem()
    store.addYunxiaoTodoPoolItems([item])
    store.updateYunxiaoTodoPoolItem(item.id, {
      requirementContract: {
        status: 'needs_clarification',
        owner: 'product',
        nextAction: 'Answer Q1.',
        intent: 'Clarify synchronization scope.',
        archiveDir: null,
        prdPath: null,
        evidenceUpdatedAt: null,
        updatedAt: 1,
        blockingQuestions: [
          {
            id: 'Q1',
            question: 'Should historical data change?',
            whyBlocking: null,
            options: []
          }
        ],
        decisions: [],
        riskProfile: null,
        reviewChecks: []
      }
    })

    expect(
      store.claimYunxiaoTodoPoolItems({
        automationId: 'automation-1',
        runId: 'run-1',
        statuses: ['queued'],
        limit: 1
      })
    ).toEqual([])
  })

  it('enforces requirement methodology gates on manual todo pool transitions', async () => {
    const store = await trackedCreateStore()
    const item = makeYunxiaoWorkItem()
    store.addYunxiaoTodoPoolItems([item])
    const contract: YunxiaoRequirementContractSnapshot = {
      status: 'needs_clarification',
      owner: 'product',
      nextAction: 'Answer Q1.',
      intent: 'Clarify migration behavior.',
      archiveDir: null,
      prdPath: null,
      evidenceUpdatedAt: null,
      updatedAt: 1,
      blockingQuestions: [
        { id: 'Q1', question: 'Migrate historical data?', whyBlocking: null, options: [] }
      ],
      decisions: [],
      riskProfile: null,
      reviewChecks: []
    }

    const updated = store.updateYunxiaoTodoPoolItem(item.id, {
      poolStatus: 'ready-to-build',
      requirementContract: contract
    })

    expect(updated).toMatchObject({
      poolStatus: 'needs-clarification',
      lastError: 'Requirement Contract has unresolved blocking questions.'
    })
  })

  it('allows manual done transitions even when completion gates are incomplete', async () => {
    const store = await trackedCreateStore()
    const item = makeYunxiaoWorkItem()
    store.addYunxiaoTodoPoolItems([item])
    const contract: YunxiaoRequirementContractSnapshot = {
      status: 'ready_to_build',
      owner: 'development',
      nextAction: 'Implement release-sensitive API behavior.',
      intent: 'Keep release behavior auditable.',
      archiveDir: null,
      prdPath: null,
      evidenceUpdatedAt: null,
      updatedAt: 1,
      blockingQuestions: [],
      decisions: [],
      riskProfile: {
        reviewTier: 'mandatory',
        reasons: ['Release behavior changes.'],
        uiWorkflow: false,
        apiOrDatabase: true,
        permissionsOrRelease: true,
        multiRepository: false,
        requirementConflict: false,
        weakVerification: true
      },
      reviewChecks: [],
      methodologyGate: {
        designConfirmed: true,
        alternatives: [],
        implementationPlan: { status: 'missing', path: null, summary: null, updatedAt: null },
        verificationEvidence: []
      }
    }

    store.updateYunxiaoTodoPoolItem(item.id, { lastError: 'Previous blocker.' })
    const updated = store.updateYunxiaoTodoPoolItem(item.id, {
      poolStatus: 'done',
      requirementContract: contract
    })

    expect(updated?.poolStatus).toBe('done')
    expect(updated?.lastError).toBeNull()
  })

  it('blocks completed status for manual Yunxiao worktrees without a passing gate', async () => {
    const store = await trackedCreateStore()
    store.setWorktreeMeta('wt1', {
      displayName: 'DFHIS-31732',
      yunxiaoRequirementGate: {
        identifier: 'DFHIS-31732',
        source: 'manual-prompt',
        sourcePromptPreview: 'DFHIS-31732',
        requirementContract: null,
        lastCompletionBlocker: null,
        createdAt: 1,
        updatedAt: 1
      }
    })

    const updated = store.setWorktreeMeta('wt1', { workspaceStatus: 'completed' })

    expect(updated.workspaceStatus).toBe('in-review')
    expect(updated.yunxiaoRequirementGate?.lastCompletionBlocker).toContain(
      'Requirement Contract is missing.'
    )
  })
})
