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

describe('prepareYunxiaoTodoPoolRun', () => {
  it('puts the full Yunxiao URL in the claim commit message field', () => {
    const prompt = preparePrompt(makeYunxiaoWorkItem())

    expect(prompt).toContain('提交信息: https://devops.aliyun.com/projex/bug/DFHIS-31704')
    expect(prompt).toContain('链接: https://devops.aliyun.com/projex/bug/DFHIS-31704')
    expect(prompt).toContain(
      'git commit message 必须使用该工作项 claim 中“提交信息”字段的完整云效链接'
    )
    expect(prompt).toContain('禁止修改构建/依赖定义来解决需求，包括 build.gradle')
    expect(prompt).toContain('不能把已发布依赖改成 compile project(...)')
    expect(prompt).toContain('禁止新增、修改或依赖项目内 *-api/API 模块')
  })

  it('synthesizes a full Yunxiao URL from category and serial number when the item has no URL', () => {
    const prompt = preparePrompt(
      makeYunxiaoWorkItem({ serialNumber: 'DFHIS-31762', category: 'Bug', url: null })
    )

    expect(prompt).toContain('提交信息: https://devops.aliyun.com/projex/bug/DFHIS-31762')
    expect(prompt).toContain('链接: https://devops.aliyun.com/projex/bug/DFHIS-31762')
  })
})
