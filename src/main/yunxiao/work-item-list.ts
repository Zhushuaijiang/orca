import type {
  YunxiaoListWorkItemsArgs,
  YunxiaoListWorkItemsResult,
  YunxiaoWorkItem
} from '../../shared/yunxiao-types'
import { DEFAULT_YUNXIAO_ORGANIZATION_ID, DEFAULT_YUNXIAO_PROJECT_ID } from './requirement-defaults'
import { callOfficialYunxiaoTool } from './client'
import { appendUniqueWorkItem, itemMatchesQuery, matchesParticipant } from './work-item-query'
import {
  extractWorkItemIdFromValue,
  tryParseJson,
  valueFromPath
} from './work-item-result-extraction'

const DEFAULT_YUNXIAO_WORK_ITEM_PAGE = 1
const DEFAULT_YUNXIAO_WORK_ITEM_PAGE_SIZE = 100
const YUNXIAO_SEARCH_SCAN_PAGE_SIZE = 100
const YUNXIAO_SEARCH_MAX_SCAN_PAGES = 60
const YUNXIAO_PROJEX_WEB_BASE_URL = 'https://devops.aliyun.com/projex'

function getYunxiaoWorkItemRouteSegment(category: string | null): string {
  if (category === 'Task') {
    return 'task'
  }
  if (category === 'Bug') {
    return 'bug'
  }
  return 'req'
}

function buildYunxiaoWorkItemUrl(
  serialNumber: string | null,
  category: string | null
): string | null {
  if (!serialNumber) {
    return null
  }
  return `${YUNXIAO_PROJEX_WEB_BASE_URL}/${getYunxiaoWorkItemRouteSegment(
    category
  )}/${encodeURIComponent(serialNumber)}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function arrayFromResult(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value
  }
  const record = asRecord(value)
  if (!record) {
    return []
  }
  for (const key of ['data', 'items', 'list', 'result', 'records']) {
    const nested = record[key]
    if (Array.isArray(nested)) {
      return nested
    }
  }
  return []
}

function cleanPositiveInteger(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback
  }
  return Math.min(parsed, max)
}

function compactPerson(value: unknown): { id: string | null; name: string } | null {
  const record = asRecord(value)
  if (!record) {
    const name = asString(value)
    return name ? { id: null, name } : null
  }
  const id = asString(record.id) ?? asString(record.userId) ?? asString(record.memberId)
  const name =
    asString(record.name) ??
    asString(record.displayName) ??
    asString(record.nickName) ??
    asString(record.realName) ??
    id
  return name ? { id, name } : null
}

function compactPeople(value: unknown): { id: string | null; name: string }[] {
  return Array.isArray(value)
    ? value
        .map((entry) => compactPerson(entry))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : []
}

function customFieldDisplay(item: Record<string, unknown>, fieldName: string): string | null {
  const fields = Array.isArray(item.customFieldValues) ? item.customFieldValues : []
  for (const field of fields) {
    const fieldRecord = asRecord(field)
    if (!fieldRecord || asString(fieldRecord.fieldName) !== fieldName) {
      continue
    }
    const values = Array.isArray(fieldRecord.values) ? fieldRecord.values : []
    const displayValues = values
      .map((value) => {
        const valueRecord = asRecord(value)
        return (
          asString(valueRecord?.displayValue) ??
          asString(valueRecord?.identifier) ??
          asString(value)
        )
      })
      .filter((value): value is string => Boolean(value))
    return displayValues.length > 0 ? displayValues.join(', ') : null
  }
  return null
}

export function compactYunxiaoWorkItem(value: unknown): YunxiaoWorkItem | null {
  const item = asRecord(value)
  if (!item) {
    return null
  }
  const id = asString(item.id) ?? asString(item.identifier) ?? asString(item.workItemId)
  const title = asString(item.subject) ?? asString(item.title)
  if (!id || !title) {
    return null
  }
  const status = asRecord(item.status)
  const workitemType = asRecord(item.workitemType) ?? asRecord(item.workItemType)
  const sprint = asRecord(item.sprint)
  const serialNumber = asString(item.serialNumber) ?? extractWorkItemIdFromValue(item)
  const category = asString(item.categoryId) ?? asString(item.category) ?? 'Req'
  const updatedMillis =
    asNumber(item.gmtModified) ?? asNumber(item.updatedAt) ?? asNumber(item.updateStatusAt)
  return {
    id,
    serialNumber,
    title,
    category,
    typeName: asString(workitemType?.name),
    statusId: asString(status?.id) ?? asString(item.statusId),
    statusName: asString(status?.displayName) ?? asString(status?.name) ?? asString(item.status),
    customer: customFieldDisplay(item, '客户'),
    priority:
      customFieldDisplay(item, '优先级') ??
      asString(asRecord(item.priority)?.name) ??
      asString(item.priority),
    assignee: compactPerson(item.assignedTo),
    participants: compactPeople(item.participants),
    sprint:
      sprint && (asString(sprint.id) || asString(sprint.name))
        ? {
            id: asString(sprint.id) ?? asString(sprint.name) ?? '',
            name: asString(sprint.name) ?? asString(sprint.id) ?? ''
          }
        : null,
    updatedAt: updatedMillis ? new Date(updatedMillis).toISOString() : asString(item.updatedAt),
    url: buildYunxiaoWorkItemUrl(serialNumber, category)
  }
}

function addFacet(
  facets: Map<string, { id: string; name: string; count: number }>,
  id: string | null,
  name: string | null
): void {
  const facetId = id || name
  const facetName = name || id
  if (!facetId || !facetName) {
    return
  }
  const current = facets.get(facetId)
  facets.set(facetId, { id: facetId, name: facetName, count: (current?.count ?? 0) + 1 })
}

function sortedFacets(facets: Map<string, { id: string; name: string; count: number }>) {
  return [...facets.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

async function getOfficialYunxiaoOrganizationId(): Promise<string> {
  const configuredOrganizationId = process.env.YUNXIAO_ORGANIZATION_ID?.trim()
  if (configuredOrganizationId) {
    return configuredOrganizationId
  }
  const result = await callOfficialYunxiaoTool('get_current_organization_info', {}, 120_000)
  const parsed = tryParseJson(result.text)
  return (
    valueFromPath(parsed, ['lastOrganization']) ||
    valueFromPath(parsed, ['organizationId']) ||
    DEFAULT_YUNXIAO_ORGANIZATION_ID
  )
}

async function resolveOfficialYunxiaoUserId(): Promise<string | null> {
  const configuredAssignee = process.env.YUNXIAO_ASSIGNEE_ID?.trim()
  if (configuredAssignee) {
    return configuredAssignee
  }
  const result = await callOfficialYunxiaoTool('get_current_organization_info', {}, 120_000)
  const parsed = tryParseJson(result.text)
  return valueFromPath(parsed, ['userId']) || valueFromPath(parsed, ['id'])
}

export async function listYunxiaoWorkItems(
  args: YunxiaoListWorkItemsArgs
): Promise<YunxiaoListWorkItemsResult> {
  try {
    const organizationId = await getOfficialYunxiaoOrganizationId()
    const filters = args.filters ?? {}
    const page = cleanPositiveInteger(
      filters.page,
      DEFAULT_YUNXIAO_WORK_ITEM_PAGE,
      Number.MAX_SAFE_INTEGER
    )
    const perPage = cleanPositiveInteger(filters.perPage, DEFAULT_YUNXIAO_WORK_ITEM_PAGE_SIZE, 200)
    const category =
      filters.category && filters.category !== 'all' ? filters.category : 'Req,Task,Bug'
    const participantId =
      filters.participantId === 'self'
        ? await resolveOfficialYunxiaoUserId()
        : (filters.participantId ?? null)
    const query = filters.query?.trim() ?? ''
    const toolArgs = {
      organizationId,
      category,
      spaceId: process.env.YUNXIAO_SPACE_ID?.trim() || DEFAULT_YUNXIAO_PROJECT_ID,
      spaceType: 'Project',
      ...(query ? { subjectDescription: query } : {}),
      ...(filters.statusIds?.length ? { status: filters.statusIds.join(',') } : {}),
      ...(filters.sprintId ? { sprint: filters.sprintId } : {}),
      ...(filters.assigneeId ? { assignedTo: filters.assigneeId } : {}),
      includeDetails: true,
      orderBy: 'gmtModified',
      sort: 'desc'
    }

    const scannedItemsById = new Map<string, YunxiaoWorkItem>()
    const matchingItems: YunxiaoWorkItem[] = []
    const requestedMatchCount = page * perPage
    const scanPageSize = query ? YUNXIAO_SEARCH_SCAN_PAGE_SIZE : perPage
    const scanStartPage = query ? 1 : page
    const maxScanPages = query ? Math.max(page, YUNXIAO_SEARCH_MAX_SCAN_PAGES) : page
    let lastRawItemsLength = 0
    for (let scanPage = scanStartPage; scanPage <= maxScanPages; scanPage += 1) {
      const result = await callOfficialYunxiaoTool(
        'search_workitems',
        { ...toolArgs, page: scanPage, perPage: scanPageSize },
        180_000
      )
      const rawItems = arrayFromResult(tryParseJson(result.text))
      lastRawItemsLength = rawItems.length
      const compactItems = rawItems
        .map((item) => compactYunxiaoWorkItem(item))
        .filter((item): item is NonNullable<typeof item> => item !== null)
      for (const item of compactItems) {
        appendUniqueWorkItem(scannedItemsById, item)
        if (itemMatchesQuery(item, query) && matchesParticipant(item.participants, participantId)) {
          matchingItems.push(item)
        }
      }
      if (!query || rawItems.length === 0 || matchingItems.length > requestedMatchCount) {
        break
      }
    }

    const compactItems = [...scannedItemsById.values()]
    const items = compactItems.filter(
      (item) =>
        itemMatchesQuery(item, query) && matchesParticipant(item.participants, participantId)
    )
    const pagedItems = query ? items.slice((page - 1) * perPage, page * perPage) : items
    const people = new Map<string, { id: string; name: string; count: number }>()
    const sprints = new Map<string, { id: string; name: string; count: number }>()
    const statuses = new Map<string, { id: string; name: string; count: number }>()
    for (const item of compactItems) {
      addFacet(people, item.assignee?.id ?? null, item.assignee?.name ?? null)
      for (const participant of item.participants) {
        addFacet(people, participant.id, participant.name)
      }
      addFacet(sprints, item.sprint?.id ?? null, item.sprint?.name ?? null)
      addFacet(statuses, item.statusId, item.statusName)
    }
    return {
      ok: true,
      items: pagedItems,
      people: sortedFacets(people),
      sprints: sortedFacets(sprints),
      statuses: sortedFacets(statuses),
      page,
      perPage,
      hasMore: query ? items.length > page * perPage : lastRawItemsLength >= perPage
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
