import type {
  YunxiaoTodoPoolItem,
  YunxiaoTodoPoolUpdateArgs,
  YunxiaoWorkItem
} from '../../shared/yunxiao-types'
import type { RuntimeStore } from './runtime-store-contract'

export type RuntimeYunxiaoCommandSurface = {
  listYunxiaoTodoPool(): YunxiaoTodoPoolItem[]
  addYunxiaoTodoPoolItems(items: readonly YunxiaoWorkItem[]): YunxiaoTodoPoolItem[]
  updateYunxiaoTodoPoolItem(
    id: string,
    updates: YunxiaoTodoPoolUpdateArgs['updates']
  ): YunxiaoTodoPoolItem | null
  removeYunxiaoTodoPoolItem(id: string): boolean
}

type YunxiaoTodoPoolStore = Pick<
  RuntimeStore,
  | 'getYunxiaoTodoPool'
  | 'addYunxiaoTodoPoolItems'
  | 'updateYunxiaoTodoPoolItem'
  | 'removeYunxiaoTodoPoolItem'
>

type YunxiaoTodoPoolStoreHost = { store?: YunxiaoTodoPoolStore | null }

type StoreDelegator = (this: YunxiaoTodoPoolStoreHost, ...args: never[]) => unknown

function defineStoreDelegator(
  target: object,
  name: keyof RuntimeYunxiaoCommandSurface,
  delegator: StoreDelegator
): void {
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: delegator
  })
}

export function installRuntimeYunxiaoCommandSurface(target: RuntimeYunxiaoCommandSurface): void {
  defineStoreDelegator(target, 'listYunxiaoTodoPool', function listYunxiaoTodoPool() {
    const { store } = this
    if (!store?.getYunxiaoTodoPool) {
      throw new Error('runtime_unavailable')
    }
    return store.getYunxiaoTodoPool()
  } as StoreDelegator)
  defineStoreDelegator(
    target,
    'addYunxiaoTodoPoolItems',
    function addYunxiaoTodoPoolItems(items: readonly YunxiaoWorkItem[]) {
      const { store } = this
      if (!store?.addYunxiaoTodoPoolItems) {
        throw new Error('runtime_unavailable')
      }
      return store.addYunxiaoTodoPoolItems(items)
    } as StoreDelegator
  )
  defineStoreDelegator(
    target,
    'updateYunxiaoTodoPoolItem',
    function updateYunxiaoTodoPoolItem(id: string, updates: YunxiaoTodoPoolUpdateArgs['updates']) {
      const { store } = this
      if (!store?.updateYunxiaoTodoPoolItem) {
        throw new Error('runtime_unavailable')
      }
      return store.updateYunxiaoTodoPoolItem(id, updates)
    } as StoreDelegator
  )
  defineStoreDelegator(
    target,
    'removeYunxiaoTodoPoolItem',
    function removeYunxiaoTodoPoolItem(id: string) {
      const { store } = this
      if (!store?.removeYunxiaoTodoPoolItem) {
        throw new Error('runtime_unavailable')
      }
      return store.removeYunxiaoTodoPoolItem(id)
    } as StoreDelegator
  )
}
