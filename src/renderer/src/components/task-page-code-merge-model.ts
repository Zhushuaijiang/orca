export type MergeStatus = 'done' | 'running' | 'conflict' | 'review' | 'pending' | 'skipped'

export type MergeRecord = {
  row: string
  service: string
  branch: string
  target: string
  owner: string
  commits: number
  conflicts: number
  status: MergeStatus
}

export type ServiceGroup = {
  category: string
  name: string
  progress: string
  status: MergeStatus
}

export const codeMergeMetrics = [
  { label: '清单入口', value: 'Excel', tone: 'text-foreground' },
  { label: '执行模式', value: '隔离', tone: 'text-foreground' },
  { label: '源仓库', value: '只读', tone: 'text-status-success' },
  { label: '目标版本', value: '2', tone: 'text-foreground' }
] as const

export const codeMergeServiceGroups: ServiceGroup[] = [
  { category: '待生成', name: '服务端仓库', progress: '导入后生成', status: 'pending' },
  { category: '待生成', name: '前端仓库', progress: '导入后生成', status: 'pending' },
  { category: '待生成', name: '待确认记录', progress: '预检后生成', status: 'pending' },
  { category: '待生成', name: '非代码项', progress: '预检后生成', status: 'pending' }
]

export const codeMergeRecords: MergeRecord[] = []

export const codeMergeLogs = [
  ['待执行', '选择导入 Excel、预检或开始合并后，将创建新工作区任务'],
  ['预检', 'agent 会先解析清单并输出服务映射与风险'],
  ['合并', '只有开始合并动作会在隔离目录里复制/克隆服务仓库'],
  ['复核', '遇到歧义或冲突时停止并等待人工确认']
] as const

export function getCodeMergeStatusLabel(status: MergeStatus): string {
  switch (status) {
    case 'done':
      return '已完成'
    case 'running':
      return '执行中'
    case 'conflict':
      return '冲突'
    case 'review':
      return '待确认'
    case 'skipped':
      return '非代码项'
    case 'pending':
      return '待执行'
  }
}

export function getCodeMergeStatusBadgeClass(status: MergeStatus): string {
  switch (status) {
    case 'done':
      return 'border-status-success-border bg-status-success-background text-status-success'
    case 'running':
      return 'border-ring/25 bg-primary/10 text-foreground'
    case 'conflict':
      return 'border-destructive/30 bg-destructive/10 text-destructive'
    case 'review':
      return 'border-border bg-muted text-foreground'
    case 'skipped':
    case 'pending':
      return 'border-border bg-background text-muted-foreground'
  }
}
