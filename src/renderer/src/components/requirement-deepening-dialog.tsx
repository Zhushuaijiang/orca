import { LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'

import { translate } from '@/i18n/i18n'
import { requestRequirementDeepening } from '@/lib/requirement-deepening-compile'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import {
  splitDeepenedRequirement,
  type RequirementPackageSplit
} from '../../../shared/deepened-requirement-packages'
import type { YunxiaoWorkItem } from '../../../shared/yunxiao-types'
import {
  composeDeepenedRequirementDescription,
  exceedsRequirementGrowthLimit,
  getRequirementGrowthRatio,
  REQUIREMENT_DEEPENING_GROWTH_LIMIT,
  type RequirementDeepeningBrief
} from '../../../shared/requirement-deepening'
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
import { Textarea } from './ui/textarea'

type RequirementDeepeningDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  body: string
  onAccept: (description: string) => void | Promise<void>
  acceptLabel?: string
  notice?: string
  /** Present when deepening an existing Yunxiao work item; enables the package split-to-pool flow. */
  workItem?: YunxiaoWorkItem
}

const ANALYSIS_SECTIONS: { key: keyof RequirementDeepeningBrief; label: string }[] = [
  { key: 'delta', label: 'requirementDeepening.delta' },
  { key: 'sources', label: 'requirementDeepening.sources' },
  { key: 'method', label: 'requirementDeepening.method' },
  { key: 'oracle', label: 'requirementDeepening.oracle' },
  { key: 'dropped', label: 'requirementDeepening.dropped' },
  { key: 'gaps', label: 'requirementDeepening.gaps' }
]

const ANALYSIS_FALLBACKS: Record<string, string> = {
  'requirementDeepening.delta': '领域增量',
  'requirementDeepening.sources': '一手素材',
  'requirementDeepening.method': '方法与工具',
  'requirementDeepening.oracle': '独立裁判',
  'requirementDeepening.dropped': '删除清单',
  'requirementDeepening.gaps': '待取证'
}

export function RequirementDeepeningDialog(
  props: RequirementDeepeningDialogProps
): JSX.Element | null {
  const settings = useAppStore((state) => state.settings)
  if (!settings) {
    return null
  }
  return <RequirementDeepeningDialogBody settings={settings} {...props} />
}

function RequirementDeepeningDialogBody({
  settings,
  open,
  onOpenChange,
  title,
  body,
  onAccept,
  acceptLabel,
  notice,
  workItem
}: RequirementDeepeningDialogProps & { settings: GlobalSettings }): JSX.Element {
  const worktreeId = useAppStore((state) => state.activeWorktreeId)
  const hostKey = useAuxiliaryExecutionHost(settings)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [brief, setBrief] = useState<RequirementDeepeningBrief | null>(null)
  const [rewritten, setRewritten] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [splitting, setSplitting] = useState(false)
  const [splitDone, setSplitDone] = useState(0)

  // Why a memo: the split is a pure function of the (editable) rewrite, so the
  // package preview and the pool write always describe the text being accepted.
  const split: RequirementPackageSplit | null = useMemo(
    () =>
      brief && workItem
        ? splitDeepenedRequirement({
            brief: { ...brief, rewritten },
            requirementTitle: title,
            parentPoolItemId: workItem.id
          })
        : null,
    [brief, rewritten, title, workItem]
  )
  const showPackages = Boolean(split && split.packages.length > 1 && workItem)

  const splitToPool = useCallback(async (): Promise<void> => {
    if (!workItem || !split || split.packages.length <= 1) {
      return
    }
    setSplitting(true)
    setError('')
    try {
      await window.api.yunxiao.addTodoPoolItems({
        items: split.packages.map((pkg) => ({
          ...workItem,
          // Why null: identity falls to the distinct per-package id, and the
          // parent URL still routes the executor to the source work item.
          serialNumber: null,
          id: pkg.poolItemId,
          title: pkg.title
        }))
      })
      for (const pkg of split.packages) {
        await window.api.yunxiao.updateTodoPoolItem({
          id: pkg.poolItemId,
          updates: { notes: pkg.note }
        })
      }
      setSplitDone(split.packages.length)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setSplitting(false)
    }
  }, [split, workItem])

  const runSeq = useRef(0)

  const run = useCallback(async (): Promise<void> => {
    const seq = ++runSeq.current
    setRunning(true)
    setError('')
    const result = await requestRequirementDeepening({
      settings,
      hostKey,
      worktreeId,
      title,
      body
    })
    if (seq !== runSeq.current) {
      return
    }
    if (!result.ok) {
      setError(result.error)
      setRunning(false)
      return
    }
    setBrief(result.brief)
    setRewritten(result.brief.rewritten)
    setRunning(false)
  }, [body, hostKey, settings, title, worktreeId])

  // Why a ref: settings/body identity changes must not re-trigger a run while open.
  const runRef = useRef(run)
  useEffect(() => {
    runRef.current = run
  }, [run])

  useEffect(() => {
    if (!open) {
      runSeq.current += 1
      setBrief(null)
      setRewritten('')
      setError('')
      setRunning(false)
      setAccepting(false)
      setSplitDone(0)
      return
    }
    void runRef.current()
  }, [open])

  const growthRatio = getRequirementGrowthRatio(body, rewritten)
  const overLimit = exceedsRequirementGrowthLimit(body, rewritten)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Why z-[60]: this panel opens on top of another z-50 dialog (new requirement). */}
      <DialogContent className="sm:max-w-3xl z-[60]" overlayClassName="z-[60]">
        <DialogHeader>
          <DialogTitle>{translate('requirementDeepening.title', '需求深化')}</DialogTitle>
          <DialogDescription>
            {translate(
              'requirementDeepening.description',
              '先把需求改写成更深入、而不是更大的执行提示词：四问分析、重写稿、删除清单、待取证。确认后才采用。'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="scrollbar-sleek flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
          {running ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              {translate('requirementDeepening.running', '正在深化…')}
            </div>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {brief
            ? ANALYSIS_SECTIONS.filter((section) => brief[section.key]).map((section) => (
                <div key={section.key} className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {translate(section.label, ANALYSIS_FALLBACKS[section.label] ?? section.label)}
                  </span>
                  <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-2 text-[11px] text-foreground">
                    {brief[section.key]}
                  </pre>
                </div>
              ))
            : null}
          {brief ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {translate('requirementDeepening.rewrite', '重写稿（可编辑）')}
                </span>
                <span
                  className={
                    overLimit ? 'text-[11px] text-destructive' : 'text-[11px] text-muted-foreground'
                  }
                >
                  {translate(
                    'requirementDeepening.growth',
                    '长度 {{value0}}%（上限 {{value1}}%）',
                    {
                      value0: Math.round(growthRatio * 100),
                      value1: Math.round(REQUIREMENT_DEEPENING_GROWTH_LIMIT * 100)
                    }
                  )}
                </span>
              </div>
              <Textarea
                variant="code"
                value={rewritten}
                onChange={(event) => setRewritten(event.target.value)}
                className="min-h-56"
              />
            </div>
          ) : null}
          {showPackages && split ? (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">
                {translate('requirementDeepening.packages', '工作包（按模块标签确定性拆分）')}
              </span>
              {split.untaggedCriteria.length > 0 ? (
                <p className="text-[11px] text-destructive">
                  {translate(
                    'requirementDeepening.untaggedWarning',
                    '有 {{value0}} 条验收标准缺模块标签，拆分不可用：请补标后重新拆分，或采用整单模式。',
                    { value0: split.untaggedCriteria.length }
                  )}
                </p>
              ) : null}
              {split.packages.map((pkg) => (
                <div key={pkg.tag} className="rounded-md border border-border bg-muted/40 p-2">
                  <p className="text-[11px] font-medium text-foreground">{pkg.title}</p>
                  <pre className="whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
                    {pkg.criteria.join('\n')}
                  </pre>
                </div>
              ))}
              {splitDone > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {translate(
                    'requirementDeepening.splitDone',
                    '已写入 {{value0}} 个执行包到待办池（按 数据变更 → 后端 → 前端 → 测试 顺序）。',
                    { value0: splitDone }
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        {notice ? <p className="text-[11px] text-muted-foreground">{notice}</p> : null}
        <DialogFooter>
          <Button
            variant="ghost"
            disabled={accepting || splitting}
            onClick={() => onOpenChange(false)}
          >
            {translate('requirementDeepening.cancel', '取消')}
          </Button>
          {showPackages && split ? (
            <Button
              variant="outline"
              disabled={
                running ||
                splitting ||
                accepting ||
                split.untaggedCriteria.length > 0 ||
                splitDone > 0
              }
              onClick={() => void splitToPool()}
            >
              {splitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {translate('requirementDeepening.splitToPool', '拆分写入待办池')}
            </Button>
          ) : null}
          <Button
            variant="outline"
            disabled={running || accepting || !body.trim()}
            onClick={() => void run()}
          >
            {translate('requirementDeepening.retry', '重新深化')}
          </Button>
          <Button
            disabled={!rewritten.trim() || running || accepting}
            onClick={() => {
              const description = composeDeepenedRequirementDescription({
                rewrittenPrompt: rewritten,
                evidenceGaps: brief?.gaps,
                original: body
              })
              setAccepting(true)
              setError('')
              void (async () => {
                try {
                  await onAccept(description)
                  onOpenChange(false)
                } catch (failure) {
                  setError(failure instanceof Error ? failure.message : String(failure))
                } finally {
                  setAccepting(false)
                }
              })()
            }}
          >
            {accepting ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {acceptLabel ?? translate('requirementDeepening.accept', '采用')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
