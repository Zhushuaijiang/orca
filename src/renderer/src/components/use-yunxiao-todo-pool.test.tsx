// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { emitAutomationsChangedWindowEvent } from '@/lib/automations-changed-window-event'
import type { YunxiaoTodoPoolItem, YunxiaoTodoPoolStatus } from '../../../shared/yunxiao-types'
import { YunxiaoTableRow, type YunxiaoTableRowProps } from './task-page-yunxiao-work-item-table-row'
import { todoPoolStatusLabel, type YunxiaoListView } from './task-page-yunxiao-work-item-model'
import { useYunxiaoTodoPool } from './use-yunxiao-todo-pool'

const item: YunxiaoTodoPoolItem = {
  id: 'item-id',
  serialNumber: 'DFHIS-32681',
  title: 'Todo pool sync',
  category: 'Bug',
  typeName: null,
  statusId: 'fix',
  statusName: '待修复',
  customer: null,
  priority: null,
  assignee: null,
  participants: [],
  sprint: null,
  updatedAt: null,
  url: null,
  poolStatus: 'queued',
  poolOrder: 1,
  addedAt: 1,
  poolUpdatedAt: 1,
  lastSyncedAt: null,
  attempts: 0,
  retryNotBefore: null,
  lastFailureKind: null,
  claimedAt: null,
  claimedByAutomationId: null,
  claimedByRunId: null,
  lastError: null,
  notes: '',
  requirementContract: null
}
const listTodoPool = vi.fn<() => Promise<YunxiaoTodoPoolItem[]>>()
beforeEach(() => {
  listTodoPool.mockReset().mockResolvedValue([item])
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { yunxiao: { listTodoPool } }
  })
})
afterEach(cleanup)

describe('Yunxiao todo pool state refresh', () => {
  it('refreshes after automation updates without leaving Work items', async () => {
    const hook = renderHook(() => useYunxiaoTodoPool(0, 'work-items'))
    await waitFor(() => expect(hook.result.current.todoPool[0]?.poolStatus).toBe('queued'))
    listTodoPool.mockResolvedValue([{ ...item, poolStatus: 'done' }])
    act(() => emitAutomationsChangedWindowEvent({ reason: 'run' }))
    await waitFor(() => expect(hook.result.current.todoPool[0]?.poolStatus).toBe('done'))
  })

  it('refreshes when switching back to Work items and when the window regains focus', async () => {
    const initialProps: { view: YunxiaoListView } = { view: 'todo-pool' }
    const hook = renderHook(({ view }: { view: YunxiaoListView }) => useYunxiaoTodoPool(0, view), {
      initialProps
    })
    await waitFor(() => expect(hook.result.current.todoPool[0]?.poolStatus).toBe('queued'))
    listTodoPool.mockResolvedValue([{ ...item, poolStatus: 'done' }])
    hook.rerender({ view: 'work-items' })
    await waitFor(() => expect(hook.result.current.todoPool[0]?.poolStatus).toBe('done'))
    listTodoPool.mockResolvedValue([{ ...item, poolStatus: 'dismissed' }])
    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(hook.result.current.todoPool[0]?.poolStatus).toBe('dismissed'))
  })

  it('ignores an old response arriving after the newer done state', async () => {
    const pending = Promise.withResolvers<YunxiaoTodoPoolItem[]>()
    listTodoPool.mockReturnValueOnce(pending.promise)
    const hook = renderHook(() => useYunxiaoTodoPool(0, 'work-items'))
    listTodoPool.mockResolvedValue([{ ...item, poolStatus: 'done' }])
    act(() => emitAutomationsChangedWindowEvent({ reason: 'run' }))
    await waitFor(() => expect(hook.result.current.todoPool[0]?.poolStatus).toBe('done'))
    await act(async () => pending.resolve([item]))
    expect(hook.result.current.todoPool[0]?.poolStatus).toBe('done')
  })

  it('removes refresh listeners on unmount', async () => {
    const hook = renderHook(() => useYunxiaoTodoPool(0, 'work-items'))
    await waitFor(() => expect(listTodoPool).toHaveBeenCalledOnce())
    hook.unmount()
    act(() => {
      emitAutomationsChangedWindowEvent({ reason: 'run' })
      window.dispatchEvent(new Event('focus'))
    })
    expect(listTodoPool).toHaveBeenCalledOnce()
  })
})

describe('Work item pool badge', () => {
  function row(status: YunxiaoTodoPoolStatus | null) {
    const props: YunxiaoTableRowProps = {
      archiveTarget: null,
      item: { ...item, id: 'provider-item-id' },
      view: 'work-items',
      onAddToTodoPool: vi.fn(),
      onAnswerRequirementQuestion: vi.fn(),
      onArchive: vi.fn(),
      onRemoveFromTodoPool: vi.fn(),
      onSelectionChange: vi.fn(),
      onSetTodoPoolOrder: vi.fn(),
      onSetTodoPoolStatus: vi.fn(),
      onStartWorkspace: vi.fn(),
      onStartTodoPoolWorkspace: vi.fn(),
      selectedWorkItemIds: new Set(),
      todoPoolStatusByIdentity: status
        ? new Map([[item.serialNumber ?? item.id, status]])
        : new Map()
    }
    return (
      <TooltipProvider>
        <YunxiaoTableRow {...props} />
      </TooltipProvider>
    )
  }
  it.each(['queued', 'done', 'dismissed'] as const)(
    'shows the actual %s pool state by work item identity',
    (status) => {
      const rendered = render(row(status))
      expect(rendered.container.querySelector('[data-slot="badge"]')?.textContent).toBe(
        todoPoolStatusLabel(status)
      )
      expect(rendered.container.textContent).toContain('待修复')
    }
  )
  it('updates the badge from queued to done without remounting the row', () => {
    const rendered = render(row('queued'))
    rendered.rerender(row('done'))
    expect(rendered.container.querySelector('[data-slot="badge"]')?.textContent).toBe(
      todoPoolStatusLabel('done')
    )
  })
  it('does not show a pool badge for an item outside the pool', () => {
    const rendered = render(row(null))
    expect(rendered.container.querySelector('[data-slot="badge"]')).toBeNull()
  })
})
