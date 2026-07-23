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
