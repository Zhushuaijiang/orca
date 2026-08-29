import type { YunxiaoTodoPoolItem, YunxiaoWorkItem } from '../../../shared/yunxiao-types'
import { normalizeYunxiaoTodoPoolItem } from './yunxiao-todo-pool-item-normalization'

export const YUNXIAO_TODO_POOL_RUNNING_ORDER = 99

export function normalizeYunxiaoTodoPool(value: unknown): YunxiaoTodoPoolItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  const itemsByIdentity = new Map<string, YunxiaoTodoPoolItem>()
  for (const [index, entry] of value.entries()) {
    const item = normalizeYunxiaoTodoPoolItem(entry, index + 1)
    if (!item) {
      continue
    }
    itemsByIdentity.set(getYunxiaoTodoPoolIdentity(item), item)
  }
  return sortYunxiaoTodoPoolItems([...itemsByIdentity.values()])
}

export function sortYunxiaoTodoPoolItems(
  items: readonly YunxiaoTodoPoolItem[]
): YunxiaoTodoPoolItem[] {
  return [...items].sort(
    (left, right) =>
      left.poolOrder - right.poolOrder ||
      left.addedAt - right.addedAt ||
      left.title.localeCompare(right.title)
  )
}

export function moveYunxiaoTodoPoolItemToOrder(
  items: readonly YunxiaoTodoPoolItem[],
  id: string,
  poolOrder: number
): YunxiaoTodoPoolItem[] {
  const sorted = sortYunxiaoTodoPoolItems(items)
  const currentIndex = sorted.findIndex((item) => matchesYunxiaoTodoPoolIdentity(item, id))
  if (currentIndex === -1) {
    return sorted
  }
  const [item] = sorted.splice(currentIndex, 1)
  if (!item) {
    return sorted
  }
  const nextIndex = Math.max(0, Math.min(poolOrder - 1, sorted.length))
  sorted.splice(nextIndex, 0, item)
  return sorted.map((entry, index) => ({ ...entry, poolOrder: index + 1 }))
}

export function getYunxiaoTodoPoolIdentity(
  item: Pick<YunxiaoWorkItem, 'id' | 'serialNumber'>
): string {
  return item.serialNumber?.trim() || item.id
}

export function matchesYunxiaoTodoPoolIdentity(
  item: Pick<YunxiaoWorkItem, 'id' | 'serialNumber'>,
  identity: string
): boolean {
  return (
    item.id === identity ||
    item.serialNumber === identity ||
    getYunxiaoTodoPoolIdentity(item) === identity
  )
}
