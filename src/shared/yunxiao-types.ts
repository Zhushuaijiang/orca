export type YunxiaoRequirementPriority = 'low' | 'medium' | 'high' | 'urgent'

export type YunxiaoCreateRequirementArgs = {
  title: string
  description?: string
  priority?: YunxiaoRequirementPriority
  labels?: string[]
  assignee?: string | null
  archiveAfterCreate?: boolean
}

export type YunxiaoArchiveRequirementArgs = {
  workItemIdOrUrl: string
  dispatch?: boolean
  reviewMode?: 'deep' | 'quick'
}

export type YunxiaoWorkItemCategory = 'Req' | 'Task' | 'Bug'

export type YunxiaoWorkItemPerson = {
  id: string | null
  name: string
}

export type YunxiaoWorkItemSprint = {
  id: string
  name: string
}

export type YunxiaoWorkItem = {
  id: string
  serialNumber: string | null
  title: string
  category: YunxiaoWorkItemCategory | string
  typeName: string | null
  statusId: string | null
  statusName: string | null
  customer: string | null
  priority: string | null
  assignee: YunxiaoWorkItemPerson | null
  participants: YunxiaoWorkItemPerson[]
  sprint: YunxiaoWorkItemSprint | null
  updatedAt: string | null
  url: string | null
}

export type YunxiaoTodoPoolStatus =
  | 'queued'
  | 'archived'
  | 'running'
  | 'dispatched'
  | 'workspace-created'
  | 'failed'
  | 'done'
  | 'dismissed'

export type YunxiaoTodoPoolItem = YunxiaoWorkItem & {
  poolStatus: YunxiaoTodoPoolStatus
  addedAt: number
  poolUpdatedAt: number
  lastSyncedAt: number | null
  attempts: number
  claimedAt: number | null
  claimedByAutomationId: string | null
  claimedByRunId: string | null
  lastError: string | null
  notes: string
}

export type YunxiaoTodoPoolAddArgs = {
  items: YunxiaoWorkItem[]
}

export type YunxiaoTodoPoolUpdateArgs = {
  id: string
  updates: Partial<Pick<YunxiaoTodoPoolItem, 'poolStatus' | 'notes' | 'lastError'>>
}

export type YunxiaoWorkItemFilters = {
  category?: YunxiaoWorkItemCategory | 'all'
  statusIds?: string[]
  sprintId?: string | null
  assigneeId?: string | 'self' | null
  participantId?: string | 'self' | null
  query?: string | null
  page?: number
  perPage?: number
}

export type YunxiaoWorkItemFacet = {
  id: string
  name: string
  count: number
}

export type YunxiaoListWorkItemsArgs = {
  filters?: YunxiaoWorkItemFilters
}

export type YunxiaoListWorkItemsResult =
  | {
      ok: true
      items: YunxiaoWorkItem[]
      people: YunxiaoWorkItemFacet[]
      sprints: YunxiaoWorkItemFacet[]
      statuses: YunxiaoWorkItemFacet[]
      page: number
      perPage: number
      hasMore: boolean
    }
  | { ok: false; error: string }

export type YunxiaoRequirementResult =
  | {
      ok: true
      workItemId: string | null
      url: string | null
      message: string
      archiveMessage?: string
    }
  | { ok: false; error: string }

export type YunxiaoArchiveRequirementResult =
  | { ok: true; workItemId: string | null; message: string }
  | { ok: false; error: string }
