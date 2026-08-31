import type { AiVaultSession } from '../../../shared/ai-vault-types'
import type { FolderWorkspace } from '../../../shared/folder-workspace-types'
import type { Worktree } from '../../../shared/worktree/types'
import { extractYunxiaoRequirementIdentifier } from '../../../shared/yunxiao-requirement-prompt-gate'

function explicitIdentifier(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase()
  return normalized || null
}

function firstIdentifier(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (!value) {
      continue
    }
    const identifier = extractYunxiaoRequirementIdentifier(value)
    if (identifier) {
      return identifier
    }
  }
  return null
}

export function resolveWorktreeYunxiaoRequirementId(
  worktree: Pick<
    Worktree,
    'linkedWorkItem' | 'yunxiaoRequirementGate' | 'automationProvenance' | 'displayName'
  >
): string | null {
  const linkedIdentifier =
    worktree.linkedWorkItem?.provider === 'yunxiao'
      ? (explicitIdentifier(worktree.linkedWorkItem.yunxiaoIdentifier) ??
        firstIdentifier(worktree.linkedWorkItem.title, worktree.linkedWorkItem.url))
      : null
  return (
    linkedIdentifier ??
    explicitIdentifier(worktree.yunxiaoRequirementGate?.identifier) ??
    firstIdentifier(worktree.automationProvenance?.automationRunTitleSnapshot, worktree.displayName)
  )
}

export function resolveFolderWorkspaceYunxiaoRequirementId(
  workspace: Pick<FolderWorkspace, 'linkedTask' | 'name'>
): string | null {
  const linkedIdentifier =
    workspace.linkedTask?.provider === 'yunxiao'
      ? (explicitIdentifier(workspace.linkedTask.yunxiaoIdentifier) ??
        firstIdentifier(workspace.linkedTask.title, workspace.linkedTask.url))
      : null
  return linkedIdentifier ?? firstIdentifier(workspace.name)
}

export function resolveAiVaultSessionYunxiaoRequirementId(
  session: Pick<AiVaultSession, 'title' | 'firstUserPrompt' | 'lastUserPrompt' | 'previewMessages'>
): string | null {
  const directIdentifier = firstIdentifier(
    session.title,
    session.firstUserPrompt,
    session.lastUserPrompt
  )
  if (directIdentifier) {
    return directIdentifier
  }
  for (let index = session.previewMessages.length - 1; index >= 0; index -= 1) {
    const identifier = firstIdentifier(session.previewMessages[index]?.text)
    if (identifier) {
      return identifier
    }
  }
  return null
}
