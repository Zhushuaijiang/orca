import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, LoaderCircle, Maximize2, Minimize2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { GitLabMRFileDiff } from '@/components/gitlab-mr-file-diff'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { GitLabMRFile, GitLabWorkItem, GitLabWorkItemDetails } from '../../../shared/types'
import type { TaskSourceContext } from '../../../shared/task-source-context'

type Props = {
  open: boolean
  item: GitLabWorkItem | null
  repoPath: string | null
  repoId?: string | null
  sourceContext?: TaskSourceContext | null
  onOpenChange: (open: boolean) => void
}

type GitLabFilesRepoSelector = {
  repoPath: string
  repoId?: string | null
  sourceContext?: TaskSourceContext | null
}

const EMPTY_GITLAB_MR_FILES: GitLabMRFile[] = []

function formatFileStatus(file: GitLabMRFile): string {
  if (file.oldPath && file.oldPath !== file.path) {
    return translate('auto.components.GitLabMRFilesDialog.renamed', 'renamed')
  }
  return file.status
}

function getFileKey(file: GitLabMRFile): string {
  return `${file.oldPath ?? ''}->${file.path}`
}

export function GitLabMRFilesDialog({
  open,
  item,
  repoPath,
  repoId,
  sourceContext,
  onOpenChange
}: Props): React.JSX.Element {
  const [details, setDetails] = useState<GitLabWorkItemDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [selectedFileKey, setSelectedFileKey] = useState<string | null>(null)
  const [fullScreen, setFullScreen] = useState(false)
  const repoSelector = useMemo<GitLabFilesRepoSelector | null>(() => {
    if (!repoPath) {
      return null
    }
    return {
      repoPath,
      ...(repoId ? { repoId } : {}),
      ...(sourceContext ? { sourceContext } : {})
    }
  }, [repoId, repoPath, sourceContext])

  useEffect(() => {
    if (!open) {
      return
    }
    setError(null)
    setSelectedFileKey(null)
    setFullScreen(false)
  }, [item?.id, open])

  useEffect(() => {
    if (!open || !item || item.type !== 'mr' || !repoSelector) {
      setDetails(null)
      setLoading(false)
      return
    }
    let stale = false
    setLoading(true)
    setError(null)
    void window.api.gl
      .workItemDetails({ ...repoSelector, iid: item.number, type: item.type })
      .then((data) => {
        if (stale) {
          return
        }
        if (!data) {
          setError(translate('auto.components.GitLabMRFilesDialog.notFound', 'MR not found.'))
          setDetails(null)
          return
        }
        setDetails(data as GitLabWorkItemDetails)
      })
      .catch((err) => {
        if (!stale) {
          setError(err instanceof Error ? err.message : String(err))
          setDetails(null)
        }
      })
      .finally(() => {
        if (!stale) {
          setLoading(false)
        }
      })
    return () => {
      stale = true
    }
  }, [item, open, refreshNonce, repoSelector])

  const files = details?.files ?? EMPTY_GITLAB_MR_FILES
  const selectedFile = useMemo(() => {
    if (files.length === 0) {
      return null
    }
    return files.find((file) => getFileKey(file) === selectedFileKey) ?? files[0]
  }, [files, selectedFileKey])
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0)
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0)
  const visibleTitle = details?.item.title ?? item?.title ?? ''
  const canOpenGitLab = Boolean(item?.url)
  const handleRefresh = useCallback(() => {
    setRefreshNonce((current) => current + 1)
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          fullScreen
            ? 'h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] !max-w-[calc(100vw-1rem)]'
            : 'h-[min(86vh,900px)] w-[min(1280px,calc(100vw-2rem))] !max-w-[min(1280px,calc(100vw-2rem))]'
        )}
      >
        <DialogHeader className="border-b border-border/50 px-4 py-3 text-left">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">!{item?.number ?? ''}</span>
                <span className="uppercase">{item?.state ?? ''}</span>
                {files.length > 0 ? (
                  <>
                    <span>{files.length} files</span>
                    <span className="text-[var(--git-decoration-added)]">+{totalAdditions}</span>
                    <span className="text-[var(--git-decoration-deleted)]">-{totalDeletions}</span>
                  </>
                ) : null}
              </div>
              <DialogTitle className="mt-1 truncate text-base leading-tight">
                {visibleTitle}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {translate(
                  'auto.components.GitLabMRFilesDialog.description',
                  'Review changed files for this GitLab merge request.'
                )}
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={translate('auto.components.GitLabMRFilesDialog.refresh', 'Refresh')}
                disabled={loading}
                onClick={handleRefresh}
              >
                {loading ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={
                  fullScreen
                    ? translate(
                        'auto.components.GitLabMRFilesDialog.exitFullScreen',
                        'Exit full screen'
                      )
                    : translate('auto.components.GitLabMRFilesDialog.fullScreen', 'Full screen')
                }
                onClick={() => setFullScreen((current) => !current)}
              >
                {fullScreen ? (
                  <Minimize2 className="size-3.5" />
                ) : (
                  <Maximize2 className="size-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={translate(
                  'auto.components.GitLabMRFilesDialog.openGitLab',
                  'Open in GitLab'
                )}
                disabled={!canOpenGitLab}
                onClick={() => {
                  if (item?.url) {
                    void window.api.shell.openUrl(item.url)
                  }
                }}
              >
                <ExternalLink className="size-3.5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1">
          {loading && !details ? (
            <div className="flex h-full items-center justify-center">
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">{error}</div>
          ) : details?.filesUnavailable ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">
              {translate(
                'auto.components.GitLabMRFilesDialog.filesUnavailable',
                "Couldn't load changed files."
              )}
            </div>
          ) : files.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">
              {translate('auto.components.GitLabMRFilesDialog.noFiles', 'No changed files.')}
            </div>
          ) : (
            <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)]">
              <aside className="min-h-0 overflow-auto border-r border-border/50 bg-muted/15 scrollbar-sleek">
                <div className="space-y-1 p-2">
                  {files.map((file) => {
                    const fileKey = getFileKey(file)
                    const selected = selectedFile ? getFileKey(selectedFile) === fileKey : false
                    return (
                      <button
                        type="button"
                        key={fileKey}
                        onClick={() => setSelectedFileKey(fileKey)}
                        className={cn(
                          'w-full rounded-md px-2 py-2 text-left hover:bg-accent',
                          selected && 'bg-accent'
                        )}
                      >
                        <div className="truncate font-mono text-xs text-foreground">
                          {file.path}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{formatFileStatus(file)}</span>
                          <span className="text-[var(--git-decoration-added)]">
                            +{file.additions}
                          </span>
                          <span className="text-[var(--git-decoration-deleted)]">
                            -{file.deletions}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </aside>
              <section className="flex min-h-0 min-w-0 flex-col">
                {selectedFile ? (
                  <>
                    <div className="flex items-center justify-between gap-3 border-b border-border/50 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-xs text-foreground">
                          {selectedFile.path}
                        </div>
                        {selectedFile.oldPath ? (
                          <div className="truncate font-mono text-[11px] text-muted-foreground">
                            {translate('auto.components.GitLabMRFilesDialog.from', 'from')}{' '}
                            {selectedFile.oldPath}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-[11px] text-muted-foreground">
                        <span className="text-[var(--git-decoration-added)]">
                          +{selectedFile.additions}
                        </span>{' '}
                        <span className="text-[var(--git-decoration-deleted)]">
                          -{selectedFile.deletions}
                        </span>
                      </div>
                    </div>
                    {selectedFile.diff ? (
                      <GitLabMRFileDiff diff={selectedFile.diff} fill />
                    ) : (
                      <div className="px-3 py-3 text-xs text-muted-foreground">
                        {translate(
                          'auto.components.GitLabMRFilesDialog.diffUnavailable',
                          'Diff content unavailable.'
                        )}
                      </div>
                    )}
                  </>
                ) : null}
              </section>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
