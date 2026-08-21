import { describe, expect, it } from 'vitest'
import type { Automation, AutomationRun } from '../../shared/automations-types'
import type { YunxiaoWorkItem } from '../../shared/yunxiao-types'
import { prepareYunxiaoTodoPoolRun } from './yunxiao-todo-pool-dispatch'

const makeAutomation = (): Automation =>
  ({
    id: 'automation-1',
    name: 'Yunxiao todo pool',
    prompt: 'Pick up the next Yunxiao item.',
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
    agentId: 'codex',
    projectId: 'project-1',
    workspaceMode: 'existing',
    workspaceId: 'workspace-1',
    timezone: 'UTC',
    rrule: 'FREQ=HOURLY',
    dtstart: 1,
    nextRunAt: 2,
    yunxiaoTodoPool: { kind: 'yunxiao-todo-pool', statuses: ['queued'], batchSize: 1 }
  }) as Automation

const makeRun = (): AutomationRun => ({
  id: 'run-1',
  automationId: 'automation-1',
  title: 'Yunxiao todo pool run',
  status: 'dispatching',
  trigger: 'manual',
  scheduledFor: 1,
  workspaceId: 'workspace-1',
  sessionKind: 'terminal',
  chatSessionId: null,
  terminalSessionId: null,
  terminalPaneKey: null,
  terminalPtyId: null,
  outputSnapshot: null,
  precheckResult: null,
  yunxiaoTodoPoolClaim: null,
  yunxiaoRequirementOutcomes: null,
  yunxiaoRequirementOutcome: null,
  usage: null,
  error: null,
  startedAt: 1,
  dispatchedAt: null,
  createdAt: 1
})

const makeYunxiaoWorkItem = (overrides: Partial<YunxiaoWorkItem> = {}): YunxiaoWorkItem => ({
  id: 'item-1',
  serialNumber: 'DFHIS-31704',
  title: '折扣套餐，医嘱名称变更后，同步变更',
  category: 'Bug',
  typeName: '缺陷',
  statusId: 'todo',
  statusName: '待修复',
  customer: '奇台县中医医院',
  priority: '中',
  assignee: { id: 'u1', name: '竺帅江' },
  participants: [],
  sprint: { id: 's1', name: '20260813迭代' },
  updatedAt: null,
  url: 'https://devops.aliyun.com/projex/bug/DFHIS-31704',
  ...overrides
})

function preparePrompt(item: YunxiaoWorkItem): string {
  const run = makeRun()
  const result = prepareYunxiaoTodoPoolRun({
    automation: makeAutomation(),
    run,
    store: {
      claimYunxiaoTodoPoolItems: () => [{ ...item, claimedAt: 1 }],
      setAutomationRunYunxiaoTodoPoolClaim: () => run,
      updateAutomationRun: () => run
    } as never
  })
  if (!result.ok) {
    throw new Error('Expected Yunxiao todo pool run to be prepared')
  }
  return result.automation.prompt
}

function prepareRun(items: YunxiaoWorkItem[]): AutomationRun {
  const run = makeRun()
  const result = prepareYunxiaoTodoPoolRun({
    automation: makeAutomation(),
    run,
    store: {
      claimYunxiaoTodoPoolItems: () => items.map((item) => ({ ...item, claimedAt: 1 })),
      setAutomationRunYunxiaoTodoPoolClaim: (_runId: string, _claim: unknown, title?: string) => ({
        ...run,
        title: title ?? run.title
      }),
      updateAutomationRun: () => run
    } as never
  })
  if (!result.ok) {
    throw new Error('Expected Yunxiao todo pool run to be prepared')
  }
  return result.run
}

describe('prepareYunxiaoTodoPoolRun', () => {
  it('names a claimed run after its Yunxiao work item', () => {
    const run = prepareRun([makeYunxiaoWorkItem()])

    expect(run.title).toBe('DFHIS-31704 折扣套餐，医嘱名称变更后，同步变更')
  })

  it('keeps batch run titles concise', () => {
    const run = prepareRun([
      makeYunxiaoWorkItem(),
      makeYunxiaoWorkItem({ id: 'item-2', serialNumber: 'DFHIS-31705' })
    ])

    expect(run.title).toBe('DFHIS-31704 折扣套餐，医嘱名称变更后，同步变更 +1')
  })

  it('puts the full Yunxiao URL in the claim commit message field', () => {
    const prompt = preparePrompt(makeYunxiaoWorkItem())

    expect(prompt).toContain('提交信息: https://devops.aliyun.com/projex/bug/DFHIS-31704')
    expect(prompt).toContain('链接: https://devops.aliyun.com/projex/bug/DFHIS-31704')
    expect(prompt).toContain('工作流: dfhis-requirement-gate')
    expect(prompt).toContain('代码提交信息必须精确使用 claim 的“提交信息”完整 URL')
    expect(prompt).toContain('不得为需求修改构建/锁文件')
    expect(prompt).toContain('先修改共享 df-his-api')
    expect(prompt).toContain('事实卡/索引定位候选仓库')
    expect(prompt).toContain('UI 必须用路由/挂载/import 证据确认真实仓库')
    expect(prompt.length).toBeLessThan(2_000)
  })

  it('synthesizes a full Yunxiao URL from category and serial number when the item has no URL', () => {
    const prompt = preparePrompt(
      makeYunxiaoWorkItem({ serialNumber: 'DFHIS-31762', category: 'Bug', url: null })
    )

    expect(prompt).toContain('提交信息: https://devops.aliyun.com/projex/bug/DFHIS-31762')
    expect(prompt).toContain('链接: https://devops.aliyun.com/projex/bug/DFHIS-31762')
  })

  it('adds the YGT harness profile for 医共体 page governance items', () => {
    const prompt = preparePrompt(
      makeYunxiaoWorkItem({
        serialNumber: 'DFHIS-31812',
        category: 'Req',
        typeName: '需求',
        title: '公告管理页面体验优化',
        url: 'https://devops.aliyun.com/projex/req/DFHIS-31812'
      })
    )

    expect(prompt).toContain('工作流: ygt-harness')
    expect(prompt).toContain('Orca YGT workflow harness gate')
    expect(prompt).toContain('必须先使用 $ygt skill')
    expect(prompt).toContain("node scripts/harness/ygt-workflow.mjs /ygt 'DFHIS-31812")
    expect(prompt).toContain('--project auto --json')
    expect(prompt).toContain('df-web-base layout README 和 STYLE_CONSTRAINTS.md')
  })
})
