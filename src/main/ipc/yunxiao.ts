import { ipcMain } from 'electron'
import type {
  YunxiaoArchiveRequirementArgs,
  YunxiaoCreateRequirementArgs,
  YunxiaoListWorkItemsArgs,
  YunxiaoTodoPoolAddArgs,
  YunxiaoTodoPoolUpdateArgs,
  YunxiaoWorkItemCategory
} from '../../shared/yunxiao-types'
import type { Store } from '../persistence'
import { archiveYunxiaoRequirement, createYunxiaoRequirement } from '../yunxiao/client'
import { listYunxiaoWorkItems } from '../yunxiao/work-item-list'

function normalizeStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined
}

function normalizePositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function normalizeWorkItemCategory(value: unknown): YunxiaoWorkItemCategory | 'all' | undefined {
  return value === 'Req' || value === 'Task' || value === 'Bug' || value === 'all'
    ? value
    : undefined
}

function normalizeListWorkItemsArgs(args: YunxiaoListWorkItemsArgs): YunxiaoListWorkItemsArgs {
  const filters = args && typeof args === 'object' ? args.filters : undefined
  return {
    filters: {
      category: normalizeWorkItemCategory(filters?.category),
      statusIds: normalizeStringArray(filters?.statusIds),
      sprintId: typeof filters?.sprintId === 'string' ? filters.sprintId : null,
      assigneeId: typeof filters?.assigneeId === 'string' ? filters.assigneeId : null,
      participantId: typeof filters?.participantId === 'string' ? filters.participantId : null,
      query: typeof filters?.query === 'string' ? filters.query : null,
      page: normalizePositiveInteger(filters?.page),
      perPage: normalizePositiveInteger(filters?.perPage)
    }
  }
}

export function registerYunxiaoHandlers(store: Store): void {
  ipcMain.handle('yunxiao:listWorkItems', async (_event, args: YunxiaoListWorkItemsArgs) => {
    return listYunxiaoWorkItems(normalizeListWorkItemsArgs(args))
  })

  ipcMain.handle(
    'yunxiao:createRequirement',
    async (_event, args: YunxiaoCreateRequirementArgs) => {
      if (!args || typeof args.title !== 'string') {
        return { ok: false, error: 'Title is required.' }
      }
      return createYunxiaoRequirement({
        title: args.title,
        description: typeof args.description === 'string' ? args.description : undefined,
        priority: args.priority,
        labels: normalizeStringArray(args.labels),
        assignee: typeof args.assignee === 'string' ? args.assignee : null,
        archiveAfterCreate: Boolean(args.archiveAfterCreate)
      })
    }
  )

  ipcMain.handle(
    'yunxiao:archiveRequirement',
    async (_event, args: YunxiaoArchiveRequirementArgs) => {
      if (!args || typeof args.workItemIdOrUrl !== 'string') {
        return { ok: false, error: 'Yunxiao work item id or URL is required.' }
      }
      return archiveYunxiaoRequirement({
        workItemIdOrUrl: args.workItemIdOrUrl,
        dispatch: args.dispatch,
        reviewMode: args.reviewMode === 'quick' ? 'quick' : 'deep'
      })
    }
  )

  ipcMain.handle('yunxiao:listTodoPool', () => store.getYunxiaoTodoPool())

  ipcMain.handle('yunxiao:addTodoPoolItems', (_event, args: YunxiaoTodoPoolAddArgs) => {
    return store.addYunxiaoTodoPoolItems(Array.isArray(args?.items) ? args.items : [])
  })

  ipcMain.handle('yunxiao:updateTodoPoolItem', (_event, args: YunxiaoTodoPoolUpdateArgs) => {
    if (!args || typeof args.id !== 'string') {
      return null
    }
    return store.updateYunxiaoTodoPoolItem(args.id, {
      poolStatus: args.updates?.poolStatus,
      notes: typeof args.updates?.notes === 'string' ? args.updates.notes : undefined,
      lastError:
        typeof args.updates?.lastError === 'string' || args.updates?.lastError === null
          ? args.updates.lastError
          : undefined
    })
  })

  ipcMain.handle('yunxiao:removeTodoPoolItem', (_event, id: string) => {
    return typeof id === 'string' ? store.removeYunxiaoTodoPoolItem(id) : false
  })
}
