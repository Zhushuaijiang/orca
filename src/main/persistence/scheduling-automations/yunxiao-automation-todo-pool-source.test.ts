import { describe, expect, it } from 'vitest'
import { normalizeAutomationYunxiaoTodoPoolSource } from './yunxiao-automation-todo-pool-source'

describe('normalizeAutomationYunxiaoTodoPoolSource', () => {
  it('keeps a configured review agent', () => {
    expect(
      normalizeAutomationYunxiaoTodoPoolSource({
        kind: 'yunxiao-todo-pool',
        statuses: ['queued'],
        batchSize: 1,
        reviewHandoff: { enabled: true, agentId: 'codex' }
      })
    ).toEqual({
      kind: 'yunxiao-todo-pool',
      statuses: ['queued', 'ready-to-build', 'workspace-created'],
      batchSize: 1,
      reviewHandoff: { enabled: true, agentId: 'codex' }
    })
  })

  it('drops an unknown review agent and leaves handoff unset', () => {
    expect(
      normalizeAutomationYunxiaoTodoPoolSource({
        kind: 'yunxiao-todo-pool',
        statuses: ['ready-to-build'],
        batchSize: 1,
        reviewHandoff: { enabled: false, agentId: 'not-a-real-agent' }
      })?.reviewHandoff
    ).toBeNull()
  })
})
