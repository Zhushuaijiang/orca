import { LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'
import { requestRequirementDeepening } from '@/lib/requirement-deepening-compile'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import {
  canWriteRequirementDeepeningBatch,
  createRequirementDeepeningBatchEntries,
  exceedsRequirementDeepeningBatchLimit,
  REQUIREMENT_DEEPENING_BATCH_LIMIT,
  summarizeRequirementDeepeningBatch,
  updateRequirementDeepeningBatchEntry,
  type RequirementDeepeningBatchEntry,
  type RequirementDeepeningBatchEntryPatch,
  type RequirementDeepeningBatchStatus
} from '../../../shared/requirement-deepening-batch'
import {
  composeDeepenedRequirementDescription,
  getRequirementGrowthRatio
} from '../../../shared/requirement-deepening'
import type { YunxiaoWorkItem } from '../../../shared/types'
import { useAppStore } from '../store'
import { useAuxiliaryExecutionHost } from './settings/use-auxiliary-execution-host'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'

type RequirementDeepeningBatchDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: readonly YunxiaoWorkItem[]
}

const STATUS_LABELS: Record<RequirementDeepeningBatchStatus, string> = {
  pending: 'requirementDeepening.batchPending',
  loading: 'requirementDeepening.batchLoading',
  ready: 'requirementDeepening.batchReady',
  written: 'requirementDeepening.batchWritten',
  skipped: 'requirementDeepening.batchSkipped',
  failed: 'requirementDeepening.batchFailed'
}

const STATUS_FALLBACKS: Record<RequirementDeepeningBatchStatus, string> = {
  pending: '待处理',
  loading: '深化中',
  ready: '待写回',
  written: '已写回',
  skipped: '已跳过',
  failed: '失败'
}

export function RequirementDeepeningBatchDialog(
  props: RequirementDeepeningBatchDialogProps
): JSX.Element | null {
  const settings = useAppStore((state) => state.settings)
  if (!settings) {
    return null
  }
  return <RequirementDeepeningBatchDialogBody settings={settings} {...props} />
}

function RequirementDeepeningBatchDialogBody({
  settings,
  open,
  onOpenChange,
  items
}: RequirementDeepeningBatchDialogProps & { settings: GlobalSettings }): JSX.Element {
  const worktreeId = useAppStore((state) => state.activeWorktreeId)
  const hostKey = useAuxiliaryExecutionHost(settings)
  const [entries, setEntries] = useState<RequirementDeepeningBatchEntry[]>([])
  const [writing, setWriting] = useState(false)
  const runSeq = useRef(0)
  const itemsRef = useRef(items)
  const entriesRef = useRef(entries)
  itemsRef.current = items
  entriesRef.current = entries

  const patch = useCallback(
    (workItemId: string, next: RequirementDeepeningBatchEntryPatch): void => {
      setEntries((current) => {
        const updated = updateRequirementDeepeningBatchEntry(current, workItemId, next)
        entriesRef.current = updated
        return updated
      })
    },
    []
  )

  const runBatch = useCallback(async (): Promise<void> => {
    if (exceedsRequirementDeepeningBatchLimit(itemsRef.current.length)) {
      return
    }
    const seq = ++runSeq.current
    const batch = createRequirementDeepeningBatchEntries(itemsRef.current)
    setEntries(batch)
    entriesRef.current = batch
    for (const source of itemsRef.current) {
      if (seq !== runSeq.current) {
        return
      }
      const workItemId = source.serialNumber ?? source.id
      patch(workItemId, { status: 'loading' })
      const detail = await window.api.yunxiao.getWorkItemDetail({ workItemIdOrUrl: workItemId })
      if (seq !== runSeq.current) {
        return
      }
      if (!detail.ok) {
        patch(workItemId, { status: 'failed', error: detail.error })
        continue
      }
      if (!detail.description.trim()) {
        patch(workItemId, {
          status: 'skipped',
          error: translate('requirementDeepening.noDescription', '该工作项没有可深化的描述。')
        })
        continue
      }
      const compiled = await requestRequirementDeepening({
        settings,
        hostKey,
        worktreeId,
        title: detail.subject || source.title,
        body: detail.description
      })
      if (seq !== runSeq.current) {
        return
      }
      if (!compiled.ok) {
        patch(workItemId, { status: 'failed', error: compiled.error })
        continue
      }
      patch(workItemId, {
        status: 'ready',
        original: detail.description,
        rewritten: compiled.brief.rewritten,
        gaps: compiled.brief.gaps,
        growthRatio: getRequirementGrowthRatio(detail.description, compiled.brief.rewritten)
      })
    }
  }, [hostKey, patch, settings, worktreeId])

  // Why a ref: settings identity changes must not restart a running batch.
  const runBatchRef = useRef(runBatch)
  useEffect(() => {
    runBatchRef.current = runBatch
  }, [runBatch])

  useEffect(() => {
    if (!open) {
      runSeq.current += 1
      setEntries([])
      setWriting(false)
      return
    }
    // Why: one batch per open; the selection is snapshotted at open time.
    void runBatchRef.current()
  }, [open])

  const overLimit = exceedsRequirementDeepeningBatchLimit(items.length)
  const summary = summarizeRequirementDeepeningBatch(entries)
  const canWrite = canWriteRequirementDeepeningBatch(entries) && !writing

  const writeAll = async (): Promise<void> => {
    setWriting(true)
    let written = 0
    let failed = 0
    for (const entry of entriesRef.current) {
      if (entry.status !== 'ready') {
        continue
      }
      const description = composeDeepenedRequirementDescription({
        rewrittenPrompt: entry.rewritten,
        evidenceGaps: entry.gaps,
        original: entry.original
      })
      const result = await window.api.yunxiao.updateWorkItemDescription({
        workItemIdOrUrl: entry.workItemId,
        description
      })
      if (result.ok) {
        written += 1
        patch(entry.workItemId, { status: 'written', error: '' })
      } else {
        failed += 1
        patch(entry.workItemId, { status: 'failed', error: result.error })
      }
    }
    setWriting(false)
    if (failed === 0) {
      toast.success(
        translate('requirementDeepening.batchWriteDone', '已写回 {{value0}} 条', {
          value0: String(written)
        })
      )
      return
    }
    toast.error(
      translate(
        'requirementDeepening.batchWritePartial',
        '写回 {{value0}} 条，失败 {{value1}} 条',
        {
          value0: String(written),
          value1: String(failed)
        }
      )
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{translate('requirementDeepening.batchTitle', '批量深化需求')}</DialogTitle>
          <DialogDescription>
            {translate(
              'requirementDeepening.batchDescription',
              '逐条读取云效描述并深化，确认后统一写回。写回会覆盖描述，原文保留在末尾。'
            )}
          </DialogDescription>
        </DialogHeader>
        {overLimit ? (
          <p className="text-[11px] text-destructive">
            {translate(
              'requirementDeepening.batchOverLimit',
              '一次最多深化 {{value0}} 条，当前勾选 {{value1}} 条。请减少勾选后重试。',
              {
                value0: String(REQUIREMENT_DEEPENING_BATCH_LIMIT),
                value1: String(items.length)
              }
            )}
          </p>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'requirementDeepening.batchSummary',
            '待写回 {{value0}} · 已写回 {{value1}} · 跳过 {{value2}} · 失败 {{value3}} · 平均长度 {{value4}}% · 待取证 {{value5}} 条',
            {
              value0: String(summary.ready),
              value1: String(summary.written),
              value2: String(summary.skipped),
              value3: String(summary.failed),
              value4: String(Math.round(summary.averageGrowthRatio * 100)),
              value5: String(summary.withGaps)
            }
          )}
        </p>
        <div className="scrollbar-sleek flex max-h-[52vh] flex-col gap-1.5 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <details
              key={entry.workItemId}
              className="rounded-md border border-border bg-muted/30 px-2 py-1.5"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-foreground">
                  {entry.workItemId} · {entry.title}
                </span>
                <span className="flex flex-none items-center gap-2 text-[11px] text-muted-foreground">
                  {entry.status === 'loading' ? (
                    <LoaderCircle className="size-3 animate-spin" />
                  ) : null}
                  {translate(STATUS_LABELS[entry.status], STATUS_FALLBACKS[entry.status])}
                  {entry.rewritten ? <span>{Math.round(entry.growthRatio * 100)}%</span> : null}
                </span>
              </summary>
              {entry.error ? (
                <p className="mt-1 text-[11px] text-destructive">{entry.error}</p>
              ) : null}
              {entry.rewritten ? (
                <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] text-foreground">
                  {entry.rewritten}
                </pre>
              ) : null}
            </details>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={writing} onClick={() => onOpenChange(false)}>
            {translate('requirementDeepening.batchClose', '关闭')}
          </Button>
          <Button disabled={!canWrite} onClick={() => void writeAll()}>
            {writing ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {translate('requirementDeepening.batchWriteAll', '全部写回云效')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
