import { ipcMain } from 'electron'
import type {
  YunxiaoArchiveRequirementArgs,
  YunxiaoCreateRequirementArgs
} from '../../shared/yunxiao-types'
import { archiveYunxiaoRequirement, createYunxiaoRequirement } from '../yunxiao/client'

function normalizeStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined
}

export function registerYunxiaoHandlers(): void {
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
}
