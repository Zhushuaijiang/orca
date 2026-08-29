import React from 'react'
import { LoaderCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { GitHubMarkdownComposer } from '@/components/github/GitHubMarkdownComposer'
import IssueSourceSelector from '@/components/github/IssueSourceSelector'
import { sameGitHubOwnerRepo } from '@/components/github/IssueSourceIndicator'
import RepoBadgeLabel from '@/components/repo/RepoBadgeLabel'
import type { TaskPageRepoSourceState } from '@/components/task-page-cache-selectors'
import { resolveUserRepoSwitchReset } from '@/components/task-page-new-issue-draft'
import type { MetadataListState } from '@/hooks/useMetadataListRequest'
import { isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import { translate } from '@/i18n/i18n'
import type { GitHubAssignableUser } from '../../../../../shared/github/pull-request-types'
import type { IssueSourcePreference, Repo } from '../../../../../shared/repo-types'
import { GitHubIssueAssigneeSelector } from '../github/github-issue-assignee-selector'
import { GitHubIssueLabelSelector } from '../github/github-issue-label-selector'
import {
  getNewIssueProviderLabel,
  type NewIssueProvider
} from '../hooks/use-task-page-github-new-issue-state'

export type NewGithubIssueDialogProps = {
  newIssueOpen: boolean
  newIssueSubmitting: boolean
  setNewIssueOpen: (open: boolean) => void
  handleCreateNewIssue: () => Promise<void> | void
  newIssueTargetRepo: Repo | null
  newIssueProvider: NewIssueProvider
  setNewIssueProvider: (provider: NewIssueProvider) => void
  newIssueWorkspaceRepo: Repo | null
  newIssueLinkYunxiao: boolean
  setNewIssueLinkYunxiao: (value: boolean) => void
  newIssueArchiveYunxiao: boolean
  setNewIssueArchiveYunxiao: (value: boolean) => void
  perRepoSourceState: TaskPageRepoSourceState[]
  setIssueSourcePreference: (
    repoId: string,
    repoPath: string,
    preference: IssueSourcePreference
  ) => Promise<void>
  selectedRepos: readonly Repo[]
  newIssueRepoId: string | null
  setNewIssueRepoId: (id: string | null) => void
  setNewIssueLabels: (labels: string[]) => void
  setNewIssueAssignees: (assignees: GitHubAssignableUser[]) => void
  newIssueTitle: string
  setNewIssueTitle: (value: string) => void
  newIssueBody: string
  setNewIssueBody: (value: string) => void
  newIssueRepoLabels: MetadataListState<string>
  newIssueLabels: string[]
  newIssueRepoAssignees: MetadataListState<GitHubAssignableUser>
  newIssueAssignees: GitHubAssignableUser[]
  submitShortcutLabel: string
}

export function NewGithubIssueDialog({
  newIssueOpen,
  newIssueSubmitting,
  setNewIssueOpen,
  handleCreateNewIssue,
  newIssueTargetRepo,
  newIssueProvider,
  setNewIssueProvider,
  newIssueWorkspaceRepo,
  newIssueLinkYunxiao,
  setNewIssueLinkYunxiao,
  newIssueArchiveYunxiao,
  setNewIssueArchiveYunxiao,
  perRepoSourceState,
  setIssueSourcePreference,
  selectedRepos,
  newIssueRepoId,
  setNewIssueRepoId,
  setNewIssueLabels,
  setNewIssueAssignees,
  newIssueTitle,
  setNewIssueTitle,
  newIssueBody,
  setNewIssueBody,
  newIssueRepoLabels,
  newIssueLabels,
  newIssueRepoAssignees,
  newIssueAssignees,
  submitShortcutLabel
}: NewGithubIssueDialogProps): React.JSX.Element {
  return (
    <Dialog
      open={newIssueOpen}
      onOpenChange={(open) => {
        if (!newIssueSubmitting) {
          setNewIssueOpen(open)
        }
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        onKeyDown={(event) => {
          if (isScreenSubmitShortcut(event)) {
            event.preventDefault()
            void handleCreateNewIssue()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {newIssueProvider === 'yunxiao'
              ? translate('auto.components.TaskPage.7c80f6a313', 'New Yunxiao requirement')
              : translate('auto.components.TaskPage.2fc21cc61c', 'New {{value0}} issue', {
                  value0: getNewIssueProviderLabel(newIssueProvider)
                })}
          </DialogTitle>
          {(() => {
            if (newIssueProvider === 'yunxiao') {
              return (
                <DialogDescription>
                  {translate(
                    'auto.components.TaskPage.c57bf5f830',
                    'Submits through official Yunxiao MCP. After creation, Orca can archive it and dispatch it to the Yunxiao requirement skill.'
                  )}
                </DialogDescription>
              )
            }
            // Why: inline the resolved {owner}/{repo} slug as the source indicator; fall back to displayName when unresolved.
            const entry = newIssueTargetRepo
              ? perRepoSourceState.find((s) => s.repoId === newIssueTargetRepo.id)
              : undefined
            const issuesSlug = entry?.sources?.issues
              ? `${entry.sources.issues.owner}/${entry.sources.issues.repo}`
              : null
            const fallback =
              newIssueTargetRepo?.displayName ??
              translate(
                'auto.components.task.page.dialogs.new.github.issue.dialog.e02508846c',
                'this repository'
              )
            if (
              newIssueProvider === 'gitlab' &&
              newIssueWorkspaceRepo &&
              newIssueTargetRepo &&
              newIssueWorkspaceRepo.id !== newIssueTargetRepo.id
            ) {
              return (
                <DialogDescription>
                  {translate('auto.components.TaskPage.a4498dc284', 'Filing GitLab issue in')}{' '}
                  {fallback}
                  {translate('auto.components.TaskPage.c4e4b59344', ', code changes in')}{' '}
                  {newIssueWorkspaceRepo.displayName}
                </DialogDescription>
              )
            }
            return (
              <DialogDescription>
                {translate('auto.components.TaskPage.9f2b4c03a6', 'Filing in')} {issuesSlug ?? fallback}
              </DialogDescription>
            )
          })()}
          {(() => {
            if (newIssueProvider !== 'github') {
              return null
            }
            // Why: mirror the Tasks-view target selector so a fork contributor can flip target at filing time (fork-routing regression #1076).
            // Sibling (not nested) because DialogDescription renders a <p> and the selector a <div> — nesting is invalid HTML.
            if (!newIssueTargetRepo) {
              return null
            }
            const entry = perRepoSourceState.find((s) => s.repoId === newIssueTargetRepo.id)
            if (!entry || !entry.sources?.upstreamCandidate || !entry.sources?.originCandidate) {
              return null
            }
            if (
              sameGitHubOwnerRepo(entry.sources.originCandidate, entry.sources.upstreamCandidate)
            ) {
              return null
            }
            return (
              <div className="mt-1">
                <IssueSourceSelector
                  preference={newIssueTargetRepo.issueSourcePreference}
                  origin={entry.sources.originCandidate}
                  upstream={entry.sources.upstreamCandidate}
                  disabled={newIssueSubmitting}
                  // Why: composer only files issues, so the source tooltip is redundant here (kept on the Tasks header, which also lists PRs).
                  suppressTooltip
                  onChange={(next) => {
                    void setIssueSourcePreference(
                      newIssueTargetRepo.id,
                      newIssueTargetRepo.path,
                      next
                    )
                  }}
                />
              </div>
            )
          })()}
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {translate('auto.components.TaskPage.1d4de0491e', 'Target')}
            </label>
            <Select
              value={newIssueProvider}
              onValueChange={(value) => {
                const provider = value as NewIssueProvider
                setNewIssueProvider(provider)
                setNewIssueLinkYunxiao(provider === 'gitlab')
                if (provider !== 'github') {
                  setNewIssueLabels([])
                  setNewIssueAssignees([])
                }
              }}
              disabled={newIssueSubmitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="github">
                  {translate('auto.components.TaskPage.c7759fab5d', 'GitHub issue')}
                </SelectItem>
                <SelectItem value="gitlab">
                  {translate('auto.components.TaskPage.3b86ec0b27', 'GitLab issue')}
                </SelectItem>
                <SelectItem value="yunxiao">
                  {translate('auto.components.TaskPage.14cb2e282f', 'Yunxiao requirement')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {newIssueProvider === 'gitlab' && newIssueWorkspaceRepo ? (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                {translate('auto.components.TaskPage.c5769a85fd', 'Code workspace')}
              </label>
              <div className="flex min-h-9 items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-sm">
                <RepoBadgeLabel
                  name={newIssueWorkspaceRepo.displayName}
                  color={newIssueWorkspaceRepo.badgeColor}
                />
                {newIssueTargetRepo && newIssueWorkspaceRepo.id !== newIssueTargetRepo.id ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {translate(
                      'auto.components.TaskPage.7dd5845268',
                      'Used for code changes after creation'
                    )}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          {selectedRepos.length > 1 ? (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                {newIssueProvider === 'gitlab'
                  ? translate('auto.components.TaskPage.219357cf23', 'GitLab issue owner')
                  : translate('auto.components.TaskPage.00022ec0ba', 'Project')}
              </label>
              <Select
                value={newIssueRepoId ?? undefined}
                onValueChange={(v) => {
                  // Why: repo-scoped labels/assignees can't survive a real repo switch, so clear them here (restore never routes through this handler).
                  setNewIssueRepoId(v)
                  const reset = resolveUserRepoSwitchReset()
                  setNewIssueLabels(reset.labels)
                  setNewIssueAssignees(reset.assignees)
                }}
                disabled={newIssueSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectedRepos.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <RepoBadgeLabel name={r.displayName} color={r.badgeColor} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {translate('auto.components.TaskPage.16cba35bee', 'Title')}
            </label>
            <Input
              autoFocus
              value={newIssueTitle}
              onChange={(e) => setNewIssueTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void handleCreateNewIssue()
                }
              }}
              placeholder={translate('auto.components.TaskPage.578f730c16', 'Short summary')}
              disabled={newIssueSubmitting}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {translate('auto.components.TaskPage.7f3f7b4c18', 'Description (optional, markdown)')}
            </label>
            <GitHubMarkdownComposer
              value={newIssueBody}
              onChange={setNewIssueBody}
              placeholder={translate('auto.components.TaskPage.34d97ca682', "What's going on?")}
              disabled={newIssueSubmitting}
              minHeightClassName="min-h-40"
              onSubmitShortcut={() => void handleCreateNewIssue()}
            />
          </div>
          {newIssueProvider === 'github' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <GitHubIssueLabelSelector
                labels={newIssueRepoLabels.data}
                selectedLabels={newIssueLabels}
                loading={newIssueRepoLabels.loading}
                error={newIssueRepoLabels.error}
                disabled={newIssueSubmitting || !newIssueTargetRepo}
                onChange={setNewIssueLabels}
              />
              <GitHubIssueAssigneeSelector
                assignees={newIssueRepoAssignees.data}
                selectedAssignees={newIssueAssignees}
                loading={newIssueRepoAssignees.loading}
                error={newIssueRepoAssignees.error}
                disabled={newIssueSubmitting || !newIssueTargetRepo}
                onChange={setNewIssueAssignees}
              />
            </div>
          ) : null}
          {newIssueProvider === 'gitlab' ? (
            <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
              <label className="flex items-center gap-2 text-xs text-foreground">
                <Checkbox
                  checked={newIssueLinkYunxiao}
                  disabled={newIssueSubmitting}
                  onCheckedChange={(checked) => setNewIssueLinkYunxiao(checked === true)}
                />
                {translate(
                  'auto.components.TaskPage.e65804f357',
                  'Create and link a Yunxiao requirement'
                )}
              </label>
              {newIssueLinkYunxiao ? (
                <label className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
                  <Checkbox
                    checked={newIssueArchiveYunxiao}
                    disabled={newIssueSubmitting}
                    onCheckedChange={(checked) => setNewIssueArchiveYunxiao(checked === true)}
                  />
                  {translate(
                    'auto.components.TaskPage.72c283c5e8',
                    'Archive and dispatch to the Yunxiao requirement skill after creation'
                  )}
                </label>
              ) : null}
            </div>
          ) : null}
          {newIssueProvider === 'yunxiao' ? (
            <label className="flex items-center gap-2 text-xs text-foreground">
              <Checkbox
                checked={newIssueArchiveYunxiao}
                disabled={newIssueSubmitting}
                onCheckedChange={(checked) => setNewIssueArchiveYunxiao(checked === true)}
              />
              {translate(
                'auto.components.TaskPage.72c283c5e8',
                'Archive and dispatch to the Yunxiao requirement skill after creation'
              )}
            </label>
          ) : null}
          <p className="text-[10px] text-muted-foreground">
            {submitShortcutLabel} {translate('auto.components.TaskPage.fc0d8a1fa4', 'to submit.')}
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setNewIssueOpen(false)}
            disabled={newIssueSubmitting}
          >
            {translate('auto.components.TaskPage.ff69a30681', 'Cancel')}
          </Button>
          <Button
            onClick={() => void handleCreateNewIssue()}
            disabled={!newIssueTargetRepo || !newIssueTitle.trim() || newIssueSubmitting}
          >
            {newIssueSubmitting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                {translate('auto.components.TaskPage.8ff6fdc368', 'Creating…')}
              </>
            ) : newIssueProvider === 'yunxiao' ? (
              translate('auto.components.TaskPage.56851d859e', 'Create requirement')
            ) : (
              translate('auto.components.TaskPage.e15ba2d2eb', 'Create issue')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
