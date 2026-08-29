/** Yunxiao requirement gate outcomes: structured outcome application and snapshot backfill. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rmSync, mkdtempSync } from 'node:fs'
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type {
  PersistedState,
  YunxiaoRequirementContractSnapshot,
  YunxiaoRequirementGateOutcome,
  YunxiaoWorkItem
} from '../../../shared/types'
import {
  testState,
  createStore,
  makeRepo,
  dataFile
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

describe('Yunxiao todo pool gate outcomes', () => {

  it('marks completed Yunxiao todo pool claims as needing clarification from output evidence', async () => {
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
    store.updateAutomationRun({
      runId: run.id,
      status: 'completed',
      workspaceId: 'wt1',
      outputSnapshot: {
        format: 'plain_text',
        content: 'Contract status: needs_clarification. Asked Q1 and stopped before code changes.',
        capturedAt: 1,
        truncated: false
      },
      error: null
    })

    expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
      id: item.id,
      poolStatus: 'needs-clarification',
      lastError: null
    })
  })

  it('applies structured Yunxiao requirement gate outcomes before text fallback', async () => {
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
    const requirementContract: YunxiaoRequirementContractSnapshot = {
      status: 'needs_clarification',
      owner: 'product',
      nextAction: 'Answer Q1.',
      intent: 'Clarify sync scope.',
      archiveDir: null,
      prdPath: '/archive/DFHIS-31704/PRD_AND_CODE_ANALYSIS.md',
      evidenceUpdatedAt: 1,
      updatedAt: 2,
      blockingQuestions: [
        {
          id: 'Q1',
          question: 'Should historical data change?',
          whyBlocking: null,
          options: []
        }
      ],
      decisions: [],
      riskProfile: {
        reviewTier: 'focused',
        reasons: ['API behavior changes.'],
        uiWorkflow: false,
        apiOrDatabase: true,
        permissionsOrRelease: false,
        multiRepository: false,
        requirementConflict: false,
        weakVerification: false
      },
      reviewChecks: [
        {
          role: 'prd_gate',
          verdict: 'conditional_fail',
          topRisks: ['Q1 is unresolved.'],
          evidence: 'PRD review',
          dispatchId: 'review-1',
          reviewedAt: 3
        }
      ]
    }

    store.updateAutomationRun({
      runId: run.id,
      status: 'completed',
      workspaceId: 'wt1',
      yunxiaoRequirementOutcomes: [
        {
          itemId: item.id,
          poolStatus: 'needs-clarification',
          requirementContract,
          evidence: 'Structured outcome',
          updatedAt: 4
        }
      ],
      outputSnapshot: {
        format: 'plain_text',
        content: 'No contract status line in this output.',
        capturedAt: 5,
        truncated: false
      },
      error: null
    })

    expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
      id: item.id,
      poolStatus: 'needs-clarification',
      requirementContract
    })
    expect(store.listAutomationRuns(automation.id)[0]).toMatchObject({
      yunxiaoRequirementOutcomes: [
        {
          poolStatus: 'needs-clarification',
          requirementContract
        }
      ]
    })
  })

  it('does not apply an ambiguous structured Yunxiao outcome to a multi-item claim', async () => {
    const store = await trackedCreateStore()
    store.addRepo(makeRepo())
    const first = makeYunxiaoWorkItem({ id: 'yunxiao-item-1', serialNumber: 'DFHIS-31704' })
    const second = makeYunxiaoWorkItem({ id: 'yunxiao-item-2', serialNumber: 'DFHIS-31705' })
    store.addYunxiaoTodoPoolItems([first, second])
    const automation = store.createAutomation({
      name: 'Yunxiao todo pool',
      prompt: 'Pick up the next Yunxiao items.',
      yunxiaoTodoPool: { kind: 'yunxiao-todo-pool', statuses: ['queued'], batchSize: 2 },
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
      limit: 2
    })
    store.setAutomationRunYunxiaoTodoPoolClaim(run.id, {
      itemIds: [first.id, second.id],
      claimedAt: Date.now()
    })

    store.updateAutomationRun({
      runId: run.id,
      status: 'completed',
      workspaceId: 'wt1',
      yunxiaoRequirementOutcomes: [
        {
          itemId: null,
          poolStatus: 'needs-clarification',
          requirementContract: null,
          evidence: 'Missing item id.',
          updatedAt: 4
        }
      ],
      outputSnapshot: {
        format: 'plain_text',
        content: 'No contract status line in this output.',
        capturedAt: 5,
        truncated: false
      },
      error: null
    })

    expect(store.getYunxiaoTodoPool()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: first.id,
          poolStatus: 'ready-to-build',
          requirementContract: null
        }),
        expect.objectContaining({
          id: second.id,
          poolStatus: 'ready-to-build',
          requirementContract: null
        })
      ])
    )
  })

  it('enforces methodology gates on structured completion outcomes', async () => {
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

    store.updateAutomationRun({
      runId: run.id,
      status: 'completed',
      workspaceId: 'wt1',
      yunxiaoRequirementOutcomes: [
        {
          itemId: item.id,
          poolStatus: 'done',
          evidence: 'Agent claimed completion.',
          updatedAt: 2,
          requirementContract: {
            status: 'ready_to_build',
            owner: 'development',
            nextAction: 'Verify implementation.',
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
        }
      ],
      error: null
    })

    expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
      id: item.id,
      poolStatus: 'ready-to-build'
    })
    expect(store.getYunxiaoTodoPool()[0]?.lastError).toContain(
      'Implementation plan is required before edits.'
    )
  })

  it('blocks incomplete ready-to-verify outcomes by DFHIS serial number', async () => {
    const store = await trackedCreateStore()
    store.addRepo(makeRepo())
    const item = makeYunxiaoWorkItem({ id: 'internal-31687', serialNumber: 'DFHIS-31687' })
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
    const outcome = {
      itemId: 'DFHIS-31687',
      poolStatus: 'ready_to_verify',
      evidence: 'Pushed and verified.',
      updatedAt: 2,
      requirementContract: {
        status: 'ready_to_verify',
        owner: 'qa',
        nextAction: 'QA 验证。',
        intent: '修复已提交并验证。',
        archiveDir: '/archive/DFHIS-31687',
        prdPath: '/archive/DFHIS-31687/PRD_AND_CODE_ANALYSIS.md',
        evidenceUpdatedAt: 2,
        updatedAt: 2,
        blockingQuestions: [],
        decisions: [],
        riskProfile: null,
        reviewChecks: [],
        methodologyGate: {
          designConfirmed: true,
          alternatives: [],
          implementationPlan: {
            status: 'not_required',
            path: null,
            summary: null,
            updatedAt: 2
          },
          verificationEvidence: [
            {
              id: 'V-001',
              type: 'passing_test',
              command: 'npm test',
              artifactPath: null,
              result: 'pass',
              summary: 'Passed.',
              collectedAt: 2
            }
          ]
        }
      }
    } as unknown as YunxiaoRequirementGateOutcome

    store.updateAutomationRun({
      runId: run.id,
      status: 'completed',
      workspaceId: 'wt1',
      yunxiaoRequirementOutcomes: [outcome],
      error: null
    })

    expect(store.getYunxiaoTodoPool()[0]).toMatchObject({
      id: 'internal-31687',
      serialNumber: 'DFHIS-31687',
      poolStatus: 'ready-to-build',
      lastError:
        'Machine-readable risk profile is missing. Required delivery evidence is missing: runtime, yunxiao.'
    })
  })

  it('backfills and gates incomplete Yunxiao outcomes from persisted output snapshots', async () => {
    const store = await trackedCreateStore()
    store.addRepo(makeRepo())
    const item = makeYunxiaoWorkItem({ id: 'internal-31687', serialNumber: 'DFHIS-31687' })
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
    store.flushOrThrow()

    const persisted = JSON.parse(readFileSync(dataFile(), 'utf-8')) as PersistedState
    persisted.automationRuns = persisted.automationRuns?.map((entry) =>
      entry.id === run.id
        ? {
            ...entry,
            status: 'completed',
            outputSnapshot: {
              format: 'plain_text',
              content: `"yunxiaoRequirementOutcomes": [
  {
    "itemId": "DFHIS-31687",
    "poolStatus": "ready_to_verify",
    "requirementContract": {
      "status": "ready_to_verify",
      "owner": "qa",
      "nextAction": "QA 验证。",
      "intent": "修复已提交并验证。",
      "archiveDir": "/archive/DFHIS-31687",
      "prdPath": "/archive/DFHIS-31687/PRD_AND_CODE_ANALYSIS.md",
      "evidenceUpdatedAt": 2,
      "updatedAt": 2,
      "blockingQuestions": [],
      "decisions": [],
      "riskProfile": null,
      "reviewChecks": [],
      "methodologyGate": {
        "designConfirmed": true,
        "alternatives": [],
        "implementationPlan": { "status": "not_required", "path": null, "summary": null, "updatedAt": 2 },
        "verificationEvidence": [
          {
            "id": "V-001",
            "type": "passing_test",
            "command": "npm test",
            "artifactPath": null,
            "result": "pass",
            "summary": "Passed.",
            "collectedAt": 2
          }
        ]
      }
    },
    "evidence": "Pushed and verified.",
    "updatedAt": 2
  }
]`,
              capturedAt: 2,
              truncated: false
            },
            yunxiaoRequirementOutcomes: null,
            yunxiaoRequirementOutcome: null
          }
        : entry
    )
    writeFileSync(dataFile(), JSON.stringify(persisted), 'utf-8')

    const reloaded = await trackedCreateStore()

    expect(reloaded.getYunxiaoTodoPool()[0]).toMatchObject({
      id: 'internal-31687',
      serialNumber: 'DFHIS-31687',
      poolStatus: 'ready-to-build',
      lastError:
        'Machine-readable risk profile is missing. Required delivery evidence is missing: runtime, yunxiao.'
    })
    expect(reloaded.listAutomationRuns(automation.id)[0]).toMatchObject({
      yunxiaoRequirementOutcomes: [expect.objectContaining({ itemId: 'DFHIS-31687' })]
    })
  })
})
