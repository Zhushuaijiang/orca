import type { YunxiaoWorkItem, YunxiaoWorkItemPerson } from '../../shared/yunxiao-types'

export function matchesParticipant(
  participants: YunxiaoWorkItemPerson[],
  participantId: string | null | undefined
): boolean {
  if (!participantId) {
    return true
  }
  return participants.some(
    (participant) => participant.id === participantId || participant.name === participantId
  )
}

function normalizedSearchTokens(query: string | null | undefined): string[] {
  return (query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)
}

export function itemMatchesQuery(item: YunxiaoWorkItem, query: string): boolean {
  const tokens = normalizedSearchTokens(query)
  if (tokens.length === 0) {
    return true
  }
  const fields = [
    item.id,
    item.serialNumber,
    item.title,
    item.typeName,
    item.statusName,
    item.customer,
    item.priority,
    item.assignee?.name,
    item.sprint?.name,
    ...item.participants.map((participant) => participant.name)
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase())
  return tokens.every((token) => fields.some((field) => field.includes(token)))
}

export function appendUniqueWorkItem(
  itemsById: Map<string, YunxiaoWorkItem>,
  item: YunxiaoWorkItem
): void {
  itemsById.set(item.serialNumber ?? item.id, item)
}
