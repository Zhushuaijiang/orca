import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Store } from '../persistence'
import { registerYunxiaoHandlers } from './yunxiao'

const { handlers, handleMock } = vi.hoisted(() => {
  const registeredHandlers = new Map<string, (event: unknown, args: unknown) => unknown>()
  return {
    handlers: registeredHandlers,
    handleMock: vi.fn(
      (channel: string, handler: (event: unknown, args: unknown) => unknown): void => {
        registeredHandlers.set(channel, handler)
      }
    )
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock
  }
}))

vi.mock('../yunxiao/client', () => ({
  archiveYunxiaoRequirement: vi.fn(),
  createYunxiaoRequirement: vi.fn()
}))

vi.mock('../yunxiao/work-item-list', () => ({
  listYunxiaoWorkItems: vi.fn()
}))

describe('registerYunxiaoHandlers', () => {
  beforeEach(() => {
    handlers.clear()
    handleMock.mockClear()
  })

  it('forwards todo pool requirement contract updates to the store', async () => {
    const updateYunxiaoTodoPoolItem = vi.fn((id, updates) => ({
      id,
      ...updates
    }))
    registerYunxiaoHandlers({
      addYunxiaoTodoPoolItems: vi.fn(),
      getYunxiaoTodoPool: vi.fn(),
      removeYunxiaoTodoPoolItem: vi.fn(),
      updateYunxiaoTodoPoolItem
    } as unknown as Store)
    const handler = handlers.get('yunxiao:updateTodoPoolItem')
    const requirementContract = {
      status: 'needs_clarification',
      owner: 'product',
      nextAction: 'Answer Q1.',
      intent: 'Clarify sync scope.',
      archiveDir: null,
      prdPath: null,
      evidenceUpdatedAt: null,
      updatedAt: 1,
      blockingQuestions: [],
      decisions: [],
      riskProfile: null,
      reviewChecks: []
    }

    const result = await handler?.(null, {
      id: 'item-1',
      updates: { requirementContract }
    })

    expect(result).toMatchObject({ id: 'item-1', requirementContract })
    expect(updateYunxiaoTodoPoolItem).toHaveBeenCalledWith('item-1', {
      poolStatus: undefined,
      poolOrder: undefined,
      notes: undefined,
      lastError: undefined,
      requirementContract
    })
  })

  it('forwards todo pool order updates to the store', async () => {
    const updateYunxiaoTodoPoolItem = vi.fn((id, updates) => ({
      id,
      ...updates
    }))
    registerYunxiaoHandlers({
      addYunxiaoTodoPoolItems: vi.fn(),
      getYunxiaoTodoPool: vi.fn(),
      removeYunxiaoTodoPoolItem: vi.fn(),
      updateYunxiaoTodoPoolItem
    } as unknown as Store)
    const handler = handlers.get('yunxiao:updateTodoPoolItem')

    const result = await handler?.(null, {
      id: 'DFHIS-31773',
      updates: { poolOrder: 1 }
    })

    expect(result).toMatchObject({ id: 'DFHIS-31773', poolOrder: 1 })
    expect(updateYunxiaoTodoPoolItem).toHaveBeenCalledWith('DFHIS-31773', {
      poolStatus: undefined,
      poolOrder: 1,
      notes: undefined,
      lastError: undefined,
      requirementContract: undefined
    })
  })
})
