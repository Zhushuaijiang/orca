// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'

import { TaskPageYunxiaoWorkItemList } from './task-page-yunxiao-work-item-list'

const listWorkItems = vi.fn()
const listTodoPool = vi.fn()

vi.mock('./task-page-yunxiao-work-item-table', () => ({
  TaskPageYunxiaoWorkItemTable: () => <div data-testid="yunxiao-table" />
}))

vi.mock('./task-page-yunxiao-requirement-decision-dialog', () => ({
  TaskPageYunxiaoRequirementDecisionDialog: () => null
}))

vi.mock('./use-yunxiao-requirement-decision-answer', () => ({
  useYunxiaoRequirementDecisionAnswer: () => vi.fn()
}))

vi.mock('./use-yunxiao-todo-pool-order', () => ({
  useYunxiaoTodoPoolOrder: () => vi.fn()
}))

vi.mock('./yunxiao-todo-pool-automation', () => ({
  useYunxiaoTodoPoolAutomation: () => ({
    configureTodoPoolAutomation: vi.fn(),
    configuringTodoPoolAutomation: false,
    reviewHandoff: { enabled: true, agentId: 'grok' },
    runNextTodoPoolAutomation: vi.fn(),
    runningTodoPoolAutomation: false,
    updateReviewHandoff: vi.fn()
  })
}))

beforeEach(() => {
  listWorkItems.mockResolvedValue({
    ok: true,
    items: [],
    people: [],
    sprints: [],
    statuses: [
      { id: 'status-new', name: '新', count: 1 },
      { id: 'status-dev', name: '待开发', count: 5 },
      { id: 'status-fix', name: '待修复', count: 2 },
      { id: 'status-closed', name: '已关闭', count: 31 }
    ],
    page: 1,
    perPage: 100,
    hasMore: false
  })
  listTodoPool.mockResolvedValue([])
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      yunxiao: {
        addTodoPoolItems: vi.fn(),
        archiveRequirement: vi.fn(),
        listTodoPool,
        listWorkItems,
        removeTodoPoolItem: vi.fn(),
        updateTodoPoolItem: vi.fn()
      }
    }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TaskPageYunxiaoWorkItemList', () => {
  it('resolves default status names to facet ids before filtering work items', async () => {
    render(<TaskPageYunxiaoWorkItemList onStartWorkspace={vi.fn()} />)

    await waitFor(() => expect(listWorkItems).toHaveBeenCalledTimes(2))

    expect(listWorkItems.mock.calls[0][0].filters.statusIds).toBeUndefined()
    expect(listWorkItems.mock.calls[1][0].filters.statusIds).toEqual([
      'status-new',
      'status-dev',
      'status-fix'
    ])
  })
})
