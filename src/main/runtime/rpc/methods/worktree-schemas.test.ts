import { describe, expect, it } from 'vitest'
import { WorktreeCreate } from './worktree-create-schemas'
import { WorktreeActivate, WorktreeSet } from './worktree-schemas'
import { FolderWorkspaceUpdate } from '../../../../shared/rpc-contract/folder-workspace-params'
import { FolderWorkspaceUpdateArgs } from '../../../ipc/repos/repo-ipc-arg-schemas'

describe('worktree RPC schemas', () => {
  it('validates per-pane requirement reviews in git and folder updates', () => {
    const requirementReviews = {
      'pane-1': {
        round: 2,
        phase: 'awaiting_confirmation',
        review: 'Ready for confirmation',
        sessionId: 'session-1',
        ptyId: 'pty-1',
        updatedAt: 123
      }
    }
    expect(
      WorktreeSet.parse({ worktree: 'id:wt-1', requirementReviews }).requirementReviews
    ).toEqual(requirementReviews)
    for (const schema of [FolderWorkspaceUpdate, FolderWorkspaceUpdateArgs]) {
      expect(
        schema.parse({ folderWorkspaceId: 'fw-1', updates: { requirementReviews } }).updates
          .requirementReviews
      ).toEqual(requirementReviews)
      expect(
        schema.safeParse({
          folderWorkspaceId: 'fw-1',
          updates: {
            requirementReviews: { 'pane-1': { round: 1, phase: 'unknown', updatedAt: 123 } }
          }
        }).success
      ).toBe(false)
      expect(
        schema.parse({ folderWorkspaceId: 'fw-1', updates: { comment: 'legacy' } }).updates
          .requirementReviews
      ).toBeUndefined()
    }
    for (const invalidRecord of [
      { round: 1, phase: 'unknown', updatedAt: 123 },
      { round: '1', phase: 'confirmed', updatedAt: 123 },
      { round: 1, phase: 'confirmed', updatedAt: Infinity },
      { round: 1, phase: 'confirmed', review: 42, updatedAt: 123 }
    ]) {
      expect(
        WorktreeSet.safeParse({
          worktree: 'id:wt-1',
          requirementReviews: { 'pane-1': invalidRecord }
        }).success
      ).toBe(false)
    }
    expect(
      WorktreeSet.parse({ worktree: 'id:wt-1', requirementReviews: {} }).requirementReviews
    ).toEqual({})
    expect(
      WorktreeSet.parse({ worktree: 'id:wt-1', comment: 'legacy' }).requirementReviews
    ).toBeUndefined()
  })

  it('accepts optional display-name provenance values', () => {
    expect(
      WorktreeCreate.parse({ repo: 'repo-1', name: 'feature', displayNameKind: 'user' })
    ).toMatchObject({ displayNameKind: 'user' })
    expect(
      WorktreeCreate.parse({ repo: 'repo-1', name: 'feature', displayNameKind: 'generated' })
    ).toMatchObject({ displayNameKind: 'generated' })
  })

  it('validates additive navigation intent', () => {
    expect(WorktreeActivate.parse({ worktree: 'id:wt-1', navigation: 'clients' }).navigation).toBe(
      'clients'
    )
    expect(
      WorktreeActivate.safeParse({ worktree: 'id:wt-1', navigation: 'everyone' }).success
    ).toBe(false)
  })

  it('rejects invalid startup agent values', () => {
    const parsed = WorktreeCreate.safeParse({
      repo: 'repo-1',
      name: 'agent-startup',
      startupAgent: 'wat',
      startupPrompt: 'hi'
    })

    expect(parsed.success).toBe(false)
  })

  it('rejects startup prompts without startup agents', () => {
    const parsed = WorktreeCreate.safeParse({
      repo: 'repo-1',
      name: 'agent-startup',
      startupPrompt: 'hi'
    })

    expect(parsed.success).toBe(false)
  })

  it('normalizes durable Jira linked-item metadata and rejects provider mismatches', () => {
    const linkedWorkItem = {
      provider: 'jira',
      type: 'issue',
      number: 0,
      title: ' ORCA-123 Link Jira ',
      url: ' https://company.atlassian.net/browse/ORCA-123 ',
      jiraIdentifier: ' ORCA-123 '
    }
    const linkedTaskSourceContext = {
      kind: 'task-source',
      provider: 'jira',
      projectId: ' project-1 ',
      hostId: 'runtime:env-1',
      providerIdentity: {
        provider: 'jira',
        siteId: 'site-1',
        siteUrl: 'https://company.atlassian.net',
        projectKey: 'ORCA'
      }
    }
    const parsed = WorktreeCreate.parse({
      repo: 'repo-1',
      name: 'jira-link',
      linkedWorkItem,
      linkedTaskSourceContext
    })

    expect(parsed.linkedWorkItem).toMatchObject({
      provider: 'jira',
      title: 'ORCA-123 Link Jira',
      jiraIdentifier: 'ORCA-123'
    })
    expect(parsed.linkedTaskSourceContext).toMatchObject({
      provider: 'jira',
      projectId: 'project-1',
      hostId: 'runtime:env-1'
    })
    expect(
      WorktreeCreate.safeParse({
        repo: 'repo-1',
        name: 'mismatch',
        linkedWorkItem,
        linkedTaskSourceContext: { ...linkedTaskSourceContext, provider: 'linear' }
      }).success
    ).toBe(false)
    expect(
      WorktreeCreate.safeParse({
        repo: 'repo-1',
        name: 'wrong-site',
        linkedWorkItem,
        linkedTaskSourceContext: {
          ...linkedTaskSourceContext,
          providerIdentity: {
            ...linkedTaskSourceContext.providerIdentity,
            siteUrl: 'https://other.atlassian.net'
          }
        }
      }).success
    ).toBe(false)
    expect(() =>
      WorktreeCreate.safeParse({
        repo: 'repo-1',
        name: 'malformed',
        linkedWorkItem,
        linkedTaskSourceContext: { ...linkedTaskSourceContext, accountLabel: 44 }
      })
    ).not.toThrow()
  })

  it('keeps a blanked display name on remote hosts instead of dropping the clear', () => {
    // Blanking sends displayName:'' meaning "fall back to the branch/folder name".
    // Coercing it to undefined made updateManagedWorktreeMeta's omitUndefinedProperties
    // drop the key, so an SSH/paired-web rename-to-blank silently kept the old name.
    const parsed = WorktreeSet.parse({ worktree: 'id:r1::/repos/wt', displayName: '' })

    expect(parsed.displayName).toBe('')
    expect(Object.hasOwn(parsed, 'displayName')).toBe(true)
  })

  it('still omits a display name that was never sent', () => {
    const parsed = WorktreeSet.parse({ worktree: 'id:r1::/repos/wt', comment: 'note' })

    expect(parsed.displayName).toBeUndefined()
    expect(Object.hasOwn(parsed, 'displayName')).toBe(false)
  })

  it('ignores a non-string display name rather than persisting it', () => {
    const parsed = WorktreeSet.parse({ worktree: 'id:r1::/repos/wt', displayName: 42 })

    expect(parsed.displayName).toBeUndefined()
  })

  it('parses optional GitHub PR suppression writes and clears', () => {
    expect(
      WorktreeSet.parse({ worktree: 'id:r1::/repos/wt', suppressedGitHubPR: 42 }).suppressedGitHubPR
    ).toBe(42)
    expect(
      WorktreeSet.parse({ worktree: 'id:r1::/repos/wt', suppressedGitHubPR: null })
        .suppressedGitHubPR
    ).toBeNull()
    expect(
      WorktreeSet.safeParse({ worktree: 'id:r1::/repos/wt', suppressedGitHubPR: 0 }).success
    ).toBe(false)
  })
})
