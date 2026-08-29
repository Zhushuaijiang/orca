import { randomUUID } from 'node:crypto'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { normalizeStoredTaskSourceContext } from '../../../shared/task-source-context'
import { normalizeWorkspaceLinkedItem } from '../../../shared/workspace-linked-item'
import { isWorkspaceLinkedItemSourceContextMatch } from '../../../shared/workspace-linked-item-source-context'
import { getYunxiaoRequirementCompletionGate } from '../../../shared/yunxiao-requirement-review-policy'
import { DEFAULT_WORKSPACE_STATUS_ID } from '../../../shared/workspace-statuses'
import type { WorktreeMeta } from '../../../shared/worktree/meta-types'

type WorktreeMetaIdentity = {
  instanceId: string
  hostId: ExecutionHostId
}

function createDefaultWorktreeMeta(): WorktreeMeta {
  return {
    instanceId: randomUUID(),
    displayName: '',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    linkedGitLabMR: null,
    linkedGitLabIssue: null,
    linkedBitbucketPR: null,
    linkedAzureDevOpsPR: null,
    linkedGiteaPR: null,
    linkedWorkItem: null,
    linkedTaskSourceContext: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: Date.now(),
    lastActivityAt: 0,
    workspaceStatus: DEFAULT_WORKSPACE_STATUS_ID
  }
}

/** Merge and normalize the metadata shape shared by legacy and identity-keyed writes. */
export function mergeWorktreeMetaForWrite(
  existing: WorktreeMeta | undefined,
  updates: Partial<WorktreeMeta>,
  identity?: WorktreeMetaIdentity
): WorktreeMeta {
  const updated = {
    ...(existing ?? createDefaultWorktreeMeta()),
    ...coerceManualYunxiaoWorktreeCompletion(existing, updates),
    ...identity
  }
  updated.linkedWorkItem = normalizeWorkspaceLinkedItem(updated.linkedWorkItem)
  const sourceContext = normalizeStoredTaskSourceContext(updated.linkedTaskSourceContext)
  updated.linkedTaskSourceContext = isWorkspaceLinkedItemSourceContextMatch(
    updated.linkedWorkItem,
    sourceContext
  )
    ? sourceContext
    : null
  updated.instanceId ||= randomUUID()
  return updated
}

/** A manual Yunxiao gate that has not passed blocks 'completed'; park the worktree in review with the blocker recorded. */
function coerceManualYunxiaoWorktreeCompletion(
  existing: WorktreeMeta | undefined,
  updates: Partial<WorktreeMeta>
): Partial<WorktreeMeta> {
  if (updates.workspaceStatus !== 'completed') {
    return updates
  }
  const gate = updates.yunxiaoRequirementGate ?? existing?.yunxiaoRequirementGate
  if (!gate) {
    return updates
  }
  const completionGate = getYunxiaoRequirementCompletionGate(gate.requirementContract)
  if (completionGate.ready) {
    return updates
  }
  return {
    ...updates,
    workspaceStatus: 'in-review',
    yunxiaoRequirementGate: {
      ...gate,
      lastCompletionBlocker: completionGate.gaps.join(' '),
      updatedAt: Date.now()
    }
  }
}
