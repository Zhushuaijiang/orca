import React from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Clock3,
  ExternalLink,
  FileSpreadsheet,
  FolderTree,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  codeMergeLogs,
  codeMergeMetrics,
  codeMergeRecords,
  codeMergeServiceGroups,
  getCodeMergeStatusBadgeClass,
  getCodeMergeStatusLabel,
  type MergeStatus
} from '@/components/task-page-code-merge-model'
import type { CodeMergeAction } from '@/components/task-page-code-merge-workflow'

function StatusBadge({ status }: { status: MergeStatus }): React.JSX.Element {
  return (
    <Badge
      variant="outline"
      className={cn('h-6 rounded-full', getCodeMergeStatusBadgeClass(status))}
    >
      {getCodeMergeStatusLabel(status)}
    </Badge>
  )
}

function ServiceStatusDot({ status }: { status: MergeStatus }): React.JSX.Element {
  return (
    <span
      className={cn(
        'size-2 rounded-full',
        status === 'done' && 'bg-status-success',
        status === 'running' && 'bg-foreground',
        status === 'conflict' && 'bg-destructive',
        (status === 'review' || status === 'pending' || status === 'skipped') &&
          'bg-muted-foreground'
      )}
    />
  )
}

function IconButton({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function MetricCard({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone: string
}): React.JSX.Element {
  return (
    <div className="min-w-[132px] rounded-md border border-border/60 bg-background px-3 py-2 shadow-xs">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', tone)}>{value}</div>
    </div>
  )
}

export function TaskPageCodeMergeWorkspace({
  onOpenCodeMergeComposer
}: {
  onOpenCodeMergeComposer: (action: CodeMergeAction) => void
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-t-0 border-border/50 bg-background shadow-sm">
      <div className="flex flex-none flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/35 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="outline" className="max-w-[280px] gap-1 rounded-md bg-background">
            <FileSpreadsheet className="size-3" />
            <span className="truncate">钉钉文档_合并清单_2026-07-27.xlsx</span>
          </Badge>
          <Badge variant="outline" className="rounded-md bg-background">
            16.1 → RC_2.16.1_250514
          </Badge>
          <Badge variant="outline" className="rounded-md bg-background">
            15.3 → release_2.15.3_250515
          </Badge>
          <Badge
            variant="outline"
            className="gap-1 rounded-md bg-status-success-background text-status-success"
          >
            <ShieldCheck className="size-3" />
            源仓库只读
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenCodeMergeComposer('import')}
          >
            <Upload className="size-3.5" />
            导入 Excel
          </Button>
          <Button type="button" size="sm" onClick={() => onOpenCodeMergeComposer('preflight')}>
            <RefreshCw className="size-3.5" />
            预检
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenCodeMergeComposer('start')}
          >
            <Play className="size-3.5" />
            开始合并
          </Button>
        </div>
      </div>

      <div className="flex flex-none flex-wrap items-center gap-3 border-b border-border/50 px-3 py-3">
        {codeMergeMetrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
        <div className="min-w-[260px] flex-1 rounded-md border border-border/60 bg-background px-3 py-2 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                当前批次
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">
                2026-07-27 清单 · 待导入 / 待预检
              </div>
            </div>
            <Progress value={0} className="w-24" />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto p-3 scrollbar-sleek">
        <div className="grid min-h-full min-w-[1070px] grid-cols-[250px_minmax(520px,1fr)_300px] gap-3">
          <aside className="flex min-h-0 flex-col rounded-md border border-border/60 bg-muted/25">
            <div className="flex h-10 flex-none items-center gap-2 border-b border-border/50 px-3 text-sm font-medium">
              <FolderTree className="size-4" />
              服务分组
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-sleek">
              {codeMergeServiceGroups.map((service) => (
                <div
                  key={service.name}
                  className={cn(
                    'mb-2 flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left',
                    service.status === 'conflict'
                      ? 'border-destructive/30 bg-destructive/5'
                      : 'border-border/50 bg-background'
                  )}
                >
                  <ServiceStatusDot status={service.status} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] text-muted-foreground">
                      {service.category}
                    </span>
                    <span className="block truncate text-sm font-medium">{service.name}</span>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {service.progress}
                  </span>
                </div>
              ))}
            </div>
          </aside>

          <main className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border/60">
            <div className="flex h-12 flex-none items-center gap-2 border-b border-border/50 bg-muted/25 px-3">
              <Button type="button" variant="secondary" size="xs" disabled>
                批次
              </Button>
              <Button type="button" variant="outline" size="xs" disabled>
                记录
              </Button>
              <Button type="button" variant="outline" size="xs" disabled>
                冲突
              </Button>
              <div className="ml-auto flex min-w-[220px] items-center gap-2">
                <Search className="size-3.5 text-muted-foreground" />
                <Input className="h-8" placeholder="搜索服务、分支或负责人" disabled />
              </div>
            </div>
            <div className="grid h-9 flex-none grid-cols-[52px_minmax(210px,1.6fr)_150px_80px_86px_72px] items-center gap-3 border-b border-border/50 bg-muted/35 px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <span>行号</span>
              <span>服务 / 分支</span>
              <span>目标</span>
              <span>状态</span>
              <span>负责人</span>
              <span className="text-right">操作</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
              {codeMergeRecords.length === 0 ? (
                <div className="flex h-full min-h-[220px] items-center justify-center px-6 text-center">
                  <div>
                    <FileSpreadsheet className="mx-auto size-6 text-muted-foreground" />
                    <div className="mt-3 text-sm font-medium">尚未导入清单</div>
                    <div className="mt-1 max-w-[320px] text-xs leading-5 text-muted-foreground">
                      点击导入或预检会创建 agent 任务；服务、分支、提交和冲突记录会由任务输出。
                    </div>
                  </div>
                </div>
              ) : (
                codeMergeRecords.map((record) => (
                  <div
                    key={record.row}
                    className={cn(
                      'grid min-h-[62px] grid-cols-[52px_minmax(210px,1.6fr)_150px_80px_86px_72px] items-center gap-3 border-b border-border/50 px-3',
                      record.status === 'conflict' ? 'bg-destructive/5' : 'bg-background'
                    )}
                  >
                    <span className="font-mono text-xs text-muted-foreground">{record.row}</span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">{record.service}</span>
                      </div>
                      <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                        <GitCommitHorizontal className="size-3 shrink-0" />
                        <span className="truncate">
                          {record.branch} · 候选提交 {record.commits}
                        </span>
                      </div>
                    </div>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {record.target}
                    </span>
                    <StatusBadge status={record.status} />
                    <span className="truncate text-xs text-muted-foreground">{record.owner}</span>
                    <div className="flex justify-end gap-1">
                      <IconButton label="打开记录">
                        <ExternalLink className="size-3.5" />
                      </IconButton>
                      <IconButton label="查看日志">
                        <Clock3 className="size-3.5" />
                      </IconButton>
                    </div>
                  </div>
                ))
              )}
            </div>
          </main>

          <aside className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border/60 bg-background">
            <div className="flex h-10 flex-none items-center justify-between border-b border-border/50 px-3">
              <div className="text-sm font-medium">当前记录</div>
              <StatusBadge status="pending" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-sleek">
              <div className="rounded-md border border-border/60 bg-muted/25 p-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Excel 行待确认
                </div>
                <div className="mt-2 text-sm font-medium">预检后显示当前记录</div>
                <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                  服务 / 分支 / 目标版本
                </div>
              </div>

              <div className="mt-3 rounded-md border border-border/60 bg-muted/25 p-3 text-foreground">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="size-4" />
                  等待预检结果
                </div>
                <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                  <div>预检会列出服务映射、目标分支、候选提交和冲突风险。</div>
                  <div>开始合并前不会修改 HIS 源码根目录。</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" size="sm" disabled>
                  打开冲突
                </Button>
                <Button type="button" variant="secondary" size="sm" disabled>
                  标记复核
                </Button>
              </div>

              <div className="mt-5 flex items-center gap-2 text-sm font-medium">
                <CircleDot className="size-4" />
                执行日志
              </div>
              <div className="mt-2 space-y-2">
                {codeMergeLogs.map(([time, message]) => (
                  <div key={time} className="grid grid-cols-[58px_1fr] gap-2 text-[11px]">
                    <span className="font-mono text-muted-foreground">{time}</span>
                    <span
                      className={cn(
                        message.includes('冲突') ? 'text-destructive' : 'text-muted-foreground'
                      )}
                    >
                      {message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-none items-center gap-2 border-t border-border/50 bg-muted/25 px-3 py-2 text-[11px] text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-muted-foreground" />
              隔离工作区会由 agent 任务创建
            </div>
          </aside>
        </div>
      </div>

      <div className="h-10 flex-none overflow-x-auto border-t border-border/50 bg-muted/25 scrollbar-sleek">
        <div className="flex h-full min-w-max items-center gap-3 px-3 text-[11px] text-muted-foreground">
          <GitMerge className="size-3.5" />
          <span>读取 Excel</span>
          <span>→</span>
          <span>服务映射</span>
          <span>→</span>
          <span>隔离克隆</span>
          <span>→</span>
          <span>预检报告</span>
          <span>→</span>
          <span>逐条合并</span>
          <span>→</span>
          <span>冲突复核</span>
        </div>
      </div>
    </div>
  )
}
