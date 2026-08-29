import type { YunxiaoTodoPoolItem, YunxiaoWorkItem } from '../../../shared/yunxiao-types'
import {
  coerceYunxiaoRequirementManualStatus,
  normalizeYunxiaoTodoPoolItem
} from '../scheduling-automations/yunxiao-todo-pool-item-normalization'
import {
  getYunxiaoTodoPoolIdentity,
  matchesYunxiaoTodoPoolIdentity,
  moveYunxiaoTodoPoolItemToOrder,
  normalizeYunxiaoTodoPool,
  sortYunxiaoTodoPoolItems
} from '../scheduling-automations/yunxiao-todo-pool-ordering'
import { normalizeYunxiaoRequirementContract } from '../scheduling-automations/yunxiao-requirement-contract-normalization'
import {
  normalizeOptionalNonEmptyString,
  normalizeYunxiaoTodoPoolOrder,
  normalizeYunxiaoTodoPoolStatus
} from '../scheduling-automations/yunxiao-field-value-normalization'
import type { StoreRuntimeState } from './store-runtime-state'
import type { WriteSchedulingOperations } from './write-scheduling'
import { scheduleSave } from './write-scheduling'

type YunxiaoTodoPoolRuntime = Pick<StoreRuntimeState, 'state'>

const yunxiaoTodoPoolContext = Symbol('YunxiaoTodoPoolOperations')
type YunxiaoTodoPoolContext = {
  runtime: YunxiaoTodoPoolRuntime
  scheduling: WriteSchedulingOperations
}

export class YunxiaoTodoPoolOperations {
  readonly [yunxiaoTodoPoolContext]: YunxiaoTodoPoolContext

  constructor(runtime: YunxiaoTodoPoolRuntime, scheduling: WriteSchedulingOperations) {
    this[yunxiaoTodoPoolContext] = { runtime, scheduling }
  }

  getYunxiaoTodoPool(): YunxiaoTodoPoolItem[] {
    const state = this[yunxiaoTodoPoolContext].runtime.state
    state.yunxiaoTodoPool = normalizeYunxiaoTodoPool(state.yunxiaoTodoPool)
    return [...state.yunxiaoTodoPool]
  }

  addYunxiaoTodoPoolItems(items: readonly YunxiaoWorkItem[]): YunxiaoTodoPoolItem[] {
    const state = this[yunxiaoTodoPoolContext].runtime.state
    const now = Date.now()
    const existingPool = this.getYunxiaoTodoPool()
    const poolByIdentity = new Map(
      existingPool.map((item) => [getYunxiaoTodoPoolIdentity(item), item])
    )
    const changedItems: YunxiaoTodoPoolItem[] = []
    let nextPoolOrder = existingPool.length + 1
    for (const item of items) {
      const normalizedItem = normalizeYunxiaoTodoPoolItem({
        ...item,
        poolStatus: 'queued',
        poolOrder: nextPoolOrder,
        addedAt: now,
        poolUpdatedAt: now,
        lastSyncedAt: now,
        attempts: 0,
        retryNotBefore: null,
        lastFailureKind: null,
        claimedAt: null,
        claimedByAutomationId: null,
        claimedByRunId: null,
        lastError: null,
        notes: '',
        requirementContract: null
      })
      if (!normalizedItem) {
        continue
      }
      const identity = getYunxiaoTodoPoolIdentity(normalizedItem)
      const existing = poolByIdentity.get(identity)
      const next: YunxiaoTodoPoolItem = existing
        ? {
            ...normalizedItem,
            poolStatus: existing.poolStatus,
            poolOrder: existing.poolOrder,
            addedAt: existing.addedAt,
            poolUpdatedAt: now,
            notes: existing.notes,
            attempts: existing.attempts,
            retryNotBefore: existing.retryNotBefore,
            lastFailureKind: existing.lastFailureKind,
            claimedAt: existing.claimedAt,
            claimedByAutomationId: existing.claimedByAutomationId,
            claimedByRunId: existing.claimedByRunId,
            lastError: existing.lastError,
            requirementContract: existing.requirementContract,
            lastSyncedAt: now
          }
        : normalizedItem
      if (!existing) {
        nextPoolOrder += 1
      }
      poolByIdentity.set(identity, next)
      changedItems.push(next)
    }
    if (changedItems.length === 0) {
      return this.getYunxiaoTodoPool()
    }
    state.yunxiaoTodoPool = sortYunxiaoTodoPoolItems([...poolByIdentity.values()])
    scheduleSave(this[yunxiaoTodoPoolContext].scheduling)
    return this.getYunxiaoTodoPool()
  }

  updateYunxiaoTodoPoolItem(
    id: string,
    updates: Partial<
      Pick<
        YunxiaoTodoPoolItem,
        'poolStatus' | 'poolOrder' | 'notes' | 'lastError' | 'requirementContract'
      >
    >
  ): YunxiaoTodoPoolItem | null {
    const state = this[yunxiaoTodoPoolContext].runtime.state
    const item = this.getYunxiaoTodoPool().find((entry) =>
      matchesYunxiaoTodoPoolIdentity(entry, id)
    )
    if (!item) {
      return null
    }
    if (updates.poolStatus !== undefined) {
      const nextStatus = coerceYunxiaoRequirementManualStatus(
        normalizeYunxiaoTodoPoolStatus(updates.poolStatus),
        updates.requirementContract !== undefined
          ? normalizeYunxiaoRequirementContract(updates.requirementContract)
          : item.requirementContract
      )
      item.poolStatus = nextStatus.status
      if (nextStatus.error) {
        item.lastError = nextStatus.error
      }
      if (
        item.poolStatus === 'queued' ||
        item.poolStatus === 'ready-to-build' ||
        item.poolStatus === 'needs-clarification' ||
        item.poolStatus === 'done' ||
        item.poolStatus === 'dismissed'
      ) {
        item.claimedAt = null
        item.claimedByAutomationId = null
        item.claimedByRunId = null
        item.retryNotBefore = null
        item.lastFailureKind = null
        if (!nextStatus.error) {
          item.lastError = null
        }
      }
    }
    if (updates.notes !== undefined) {
      item.notes = updates.notes
    }
    if (updates.poolOrder !== undefined) {
      item.poolOrder = normalizeYunxiaoTodoPoolOrder(updates.poolOrder, item.poolOrder)
    }
    if (updates.lastError !== undefined) {
      item.lastError = normalizeOptionalNonEmptyString(updates.lastError)
    }
    if (updates.requirementContract !== undefined) {
      item.requirementContract = normalizeYunxiaoRequirementContract(updates.requirementContract)
      const nextStatus = coerceYunxiaoRequirementManualStatus(
        item.poolStatus,
        item.requirementContract
      )
      item.poolStatus = nextStatus.status
      if (nextStatus.error) {
        item.lastError = nextStatus.error
      } else if (item.poolStatus === 'done' || item.poolStatus === 'dismissed') {
        item.lastError = null
      }
    }
    item.poolUpdatedAt = Date.now()
    const nextPool = state.yunxiaoTodoPool.map((entry) =>
      matchesYunxiaoTodoPoolIdentity(entry, id) ? item : entry
    )
    state.yunxiaoTodoPool =
      updates.poolOrder === undefined
        ? nextPool
        : moveYunxiaoTodoPoolItemToOrder(nextPool, item.id, item.poolOrder)
    scheduleSave(this[yunxiaoTodoPoolContext].scheduling)
    return (
      state.yunxiaoTodoPool.find((entry) => matchesYunxiaoTodoPoolIdentity(entry, item.id)) ?? item
    )
  }

  removeYunxiaoTodoPoolItem(id: string): boolean {
    const state = this[yunxiaoTodoPoolContext].runtime.state
    const before = state.yunxiaoTodoPool?.length ?? 0
    state.yunxiaoTodoPool = sortYunxiaoTodoPoolItems(
      (state.yunxiaoTodoPool ?? []).filter((item) => !matchesYunxiaoTodoPoolIdentity(item, id))
    )
    if (state.yunxiaoTodoPool.length === before) {
      return false
    }
    scheduleSave(this[yunxiaoTodoPoolContext].scheduling)
    return true
  }
}

export function installYunxiaoTodoPoolOperationsContext(
  target: object,
  source: YunxiaoTodoPoolOperations
): void {
  Object.defineProperty(target, yunxiaoTodoPoolContext, {
    value: source[yunxiaoTodoPoolContext]
  })
}
