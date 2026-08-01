import { z } from 'zod'
import type { YunxiaoTodoPoolUpdateArgs, YunxiaoWorkItem } from '../../../../shared/yunxiao-types'
import { archiveYunxiaoRequirement, createYunxiaoRequirement } from '../../../yunxiao/client'
import { listYunxiaoWorkItems } from '../../../yunxiao/work-item-list'
import { defineMethod, type RpcMethod } from '../core'
import { OptionalBoolean, OptionalFiniteNumber, OptionalString, requiredString } from '../schemas'

const YunxiaoWorkItemCategory = z.enum(['Req', 'Task', 'Bug', 'all']).optional()
const YunxiaoRelationId = z.union([z.string(), z.null()]).optional()
const PositiveInteger = z.number().int().positive().optional()

const YunxiaoListWorkItems = z
  .object({
    filters: z
      .object({
        category: YunxiaoWorkItemCategory,
        statusIds: z.array(z.string()).optional(),
        sprintId: YunxiaoRelationId,
        assigneeId: YunxiaoRelationId,
        participantId: YunxiaoRelationId,
        query: YunxiaoRelationId,
        page: PositiveInteger,
        perPage: PositiveInteger
      })
      .optional()
  })
  .optional()
  .default({})

const YunxiaoPriority = z.enum(['low', 'medium', 'high', 'urgent']).optional()
const YunxiaoCreateRequirement = z.object({
  title: requiredString('Title is required.'),
  description: OptionalString,
  priority: YunxiaoPriority,
  labels: z.array(z.string()).optional(),
  assignee: YunxiaoRelationId,
  archiveAfterCreate: OptionalBoolean
})

const YunxiaoArchiveRequirement = z.object({
  workItemIdOrUrl: requiredString('Yunxiao work item id or URL is required.'),
  dispatch: OptionalBoolean,
  reviewMode: z.enum(['deep', 'quick']).optional()
})

const YunxiaoTodoPoolStatus = z.enum([
  'queued',
  'needs-clarification',
  'ready-to-build',
  'archived',
  'running',
  'dispatched',
  'workspace-created',
  'failed',
  'done',
  'dismissed'
])

const YunxiaoTodoPoolAdd = z.object({
  items: z.array(z.custom<YunxiaoWorkItem>((value) => Boolean(value))).default([])
})

const YunxiaoTodoPoolUpdate = z.object({
  id: requiredString('Missing Yunxiao todo pool item id'),
  updates: z
    .object({
      poolStatus: YunxiaoTodoPoolStatus.optional(),
      poolOrder: OptionalFiniteNumber,
      notes: OptionalString,
      lastError: z.union([z.string(), z.null()]).optional(),
      requirementContract: z.unknown().optional()
    })
    .default({})
})

export const YUNXIAO_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'yunxiao.listWorkItems',
    params: YunxiaoListWorkItems,
    handler: (params) => listYunxiaoWorkItems(params)
  }),
  defineMethod({
    name: 'yunxiao.createRequirement',
    params: YunxiaoCreateRequirement,
    handler: (params) => createYunxiaoRequirement(params)
  }),
  defineMethod({
    name: 'yunxiao.archiveRequirement',
    params: YunxiaoArchiveRequirement,
    handler: (params) => archiveYunxiaoRequirement(params)
  }),
  defineMethod({
    name: 'yunxiao.listTodoPool',
    params: null,
    handler: (_params, { runtime }) => runtime.listYunxiaoTodoPool()
  }),
  defineMethod({
    name: 'yunxiao.addTodoPoolItems',
    params: YunxiaoTodoPoolAdd,
    handler: (params, { runtime }) => runtime.addYunxiaoTodoPoolItems(params.items)
  }),
  defineMethod({
    name: 'yunxiao.updateTodoPoolItem',
    params: YunxiaoTodoPoolUpdate,
    handler: (params, { runtime }) =>
      runtime.updateYunxiaoTodoPoolItem(
        params.id,
        params.updates as YunxiaoTodoPoolUpdateArgs['updates']
      )
  }),
  defineMethod({
    name: 'yunxiao.removeTodoPoolItem',
    params: requiredString('Missing Yunxiao todo pool item id'),
    handler: (params, { runtime }) => runtime.removeYunxiaoTodoPoolItem(params)
  })
]
