import type { PreloadApi } from '../../../../preload/api-types'
import { callRuntimeResult } from './web-runtime-calls'

export type WebYunxiaoApi = NonNullable<PreloadApi['yunxiao']>

export type WebYunxiaoResult<K extends keyof WebYunxiaoApi> = Awaited<ReturnType<WebYunxiaoApi[K]>>

type WebYunxiaoRouteKey =
  | 'listWorkItems'
  | 'createRequirement'
  | 'listRequirementFieldOptions'
  | 'archiveRequirement'
  | 'listTodoPool'
  | 'addTodoPoolItems'
  | 'updateTodoPoolItem'
  | 'removeTodoPoolItem'

type WebYunxiaoRuntimeMethod =
  | 'yunxiao.listWorkItems'
  | 'yunxiao.createRequirement'
  | 'yunxiao.listRequirementFieldOptions'
  | 'yunxiao.archiveRequirement'
  | 'yunxiao.listTodoPool'
  | 'yunxiao.addTodoPoolItems'
  | 'yunxiao.updateTodoPoolItem'
  | 'yunxiao.removeTodoPoolItem'

export const YUNXIAO_WEB_RPC_METHODS = {
  listWorkItems: 'yunxiao.listWorkItems',
  createRequirement: 'yunxiao.createRequirement',
  listRequirementFieldOptions: 'yunxiao.listRequirementFieldOptions',
  archiveRequirement: 'yunxiao.archiveRequirement',
  listTodoPool: 'yunxiao.listTodoPool',
  addTodoPoolItems: 'yunxiao.addTodoPoolItems',
  updateTodoPoolItem: 'yunxiao.updateTodoPoolItem',
  removeTodoPoolItem: 'yunxiao.removeTodoPoolItem'
} as const satisfies Record<WebYunxiaoRouteKey, WebYunxiaoRuntimeMethod>

export function createYunxiaoApi(): WebYunxiaoApi {
  const route = <Result>(method: WebYunxiaoRuntimeMethod, args?: unknown): Promise<Result> =>
    callRuntimeResult<Result>(method, args)

  return {
    listWorkItems: (args) =>
      route<WebYunxiaoResult<'listWorkItems'>>(YUNXIAO_WEB_RPC_METHODS.listWorkItems, args),
    createRequirement: (args) =>
      route<WebYunxiaoResult<'createRequirement'>>(YUNXIAO_WEB_RPC_METHODS.createRequirement, args),
    listRequirementFieldOptions: () =>
      route<WebYunxiaoResult<'listRequirementFieldOptions'>>(
        YUNXIAO_WEB_RPC_METHODS.listRequirementFieldOptions
      ),
    archiveRequirement: (args) =>
      route<WebYunxiaoResult<'archiveRequirement'>>(YUNXIAO_WEB_RPC_METHODS.archiveRequirement, args),
    listTodoPool: () =>
      route<WebYunxiaoResult<'listTodoPool'>>(YUNXIAO_WEB_RPC_METHODS.listTodoPool),
    addTodoPoolItems: (args) =>
      route<WebYunxiaoResult<'addTodoPoolItems'>>(YUNXIAO_WEB_RPC_METHODS.addTodoPoolItems, args),
    updateTodoPoolItem: (args) =>
      route<WebYunxiaoResult<'updateTodoPoolItem'>>(
        YUNXIAO_WEB_RPC_METHODS.updateTodoPoolItem,
        args
      ),
    removeTodoPoolItem: (id) =>
      route<WebYunxiaoResult<'removeTodoPoolItem'>>(YUNXIAO_WEB_RPC_METHODS.removeTodoPoolItem, id)
  } satisfies WebYunxiaoApi
}
