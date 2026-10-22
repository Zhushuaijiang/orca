import type { YunxiaoCreateRequirementArgs } from '../../shared/yunxiao-types'

export function buildCreateRequirementMessage(args: YunxiaoCreateRequirementArgs): string {
  const parts = [
    '请在云效创建一条需求。',
    `标题：${args.title.trim()}`,
    args.description?.trim() ? `描述：\n${args.description.trim()}` : '',
    args.priority ? `优先级：${args.priority}` : '',
    args.businessPriority?.trim() ? `事务优先级：${args.businessPriority.trim()}` : '',
    args.system?.trim() ? `系统：${args.system.trim()}` : '',
    args.customer?.trim() ? `客户：${args.customer.trim()}` : '',
    args.labels?.length ? `标签：${args.labels.join(', ')}` : '',
    args.assignee?.trim() ? `负责人：${args.assignee.trim()}` : '',
    '创建完成后请返回需求编号、云效链接和简要状态。'
  ]
  return parts.filter(Boolean).join('\n\n')
}

export function parseOptionalJsonRecord(
  value: string | undefined
): Record<string, string> | undefined {
  if (!value?.trim()) {
    return undefined
  }
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('YUNXIAO_CUSTOM_FIELD_VALUES_JSON must be a JSON object.')
  }
  const entries = Object.entries(parsed).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export function parseCsv(value: string | undefined): string[] | undefined {
  const items = value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items?.length ? items : undefined
}
