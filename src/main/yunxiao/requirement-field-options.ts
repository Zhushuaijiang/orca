import type {
  YunxiaoRequirementFieldOption,
  YunxiaoRequirementFieldOptionsResult
} from '../../shared/yunxiao-types'
import { callOfficialYunxiaoTool } from './client'
import { getOfficialYunxiaoConnection } from './mcp-connections'
import {
  DEFAULT_YUNXIAO_BUSINESS_PRIORITY,
  DEFAULT_YUNXIAO_CUSTOMER,
  DEFAULT_YUNXIAO_ORGANIZATION_ID,
  DEFAULT_YUNXIAO_PRIORITY,
  DEFAULT_YUNXIAO_PROJECT_ID,
  DEFAULT_YUNXIAO_REQUIREMENT_TYPE_ID,
  DEFAULT_YUNXIAO_SYSTEM,
  YUNXIAO_BUSINESS_PRIORITY_FIELD_ID,
  YUNXIAO_CUSTOMER_FIELD_ID,
  YUNXIAO_SYSTEM_FIELD_ID
} from './requirement-defaults'
import { tryParseJson, valueFromPath } from './work-item-result-extraction'

const PRIORITY_OPTIONS: YunxiaoRequirementFieldOption[] = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'urgent', label: '紧急' }
]

type FetchedFieldOptions = {
  businessPriorities?: YunxiaoRequirementFieldOption[]
  systems?: YunxiaoRequirementFieldOption[]
  customers?: YunxiaoRequirementFieldOption[]
}

function fallbackOptions(fieldOptions?: FetchedFieldOptions): YunxiaoRequirementFieldOptionsResult {
  return {
    ok: true,
    priorities: PRIORITY_OPTIONS,
    businessPriorities: fieldOptions?.businessPriorities ?? [
      { value: DEFAULT_YUNXIAO_BUSINESS_PRIORITY, label: DEFAULT_YUNXIAO_BUSINESS_PRIORITY }
    ],
    systems: fieldOptions?.systems ?? [
      { value: DEFAULT_YUNXIAO_SYSTEM, label: DEFAULT_YUNXIAO_SYSTEM }
    ],
    customers: fieldOptions?.customers ?? [
      { value: DEFAULT_YUNXIAO_CUSTOMER, label: DEFAULT_YUNXIAO_CUSTOMER }
    ],
    defaults: {
      priority: DEFAULT_YUNXIAO_PRIORITY,
      businessPriority: DEFAULT_YUNXIAO_BUSINESS_PRIORITY,
      system: DEFAULT_YUNXIAO_SYSTEM,
      customer: DEFAULT_YUNXIAO_CUSTOMER
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function fieldConfigEntries(value: unknown): Record<string, unknown>[] {
  const list = Array.isArray(value)
    ? value
    : (() => {
        const record = asRecord(value)
        for (const key of ['result', 'data', 'fields', 'items', 'list']) {
          const nested = record?.[key]
          if (Array.isArray(nested)) {
            return nested
          }
        }
        return []
      })()
  return list
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
}

function fieldOptionLabel(value: unknown): string | null {
  const record = asRecord(value)
  if (!record) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }
  for (const key of ['displayValue', 'name', 'value', 'identifier', 'id']) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }
  return null
}

function optionsForField(
  fields: Record<string, unknown>[],
  fieldId: string
): YunxiaoRequirementFieldOption[] | null {
  const field = fields.find((entry) => entry.fieldId === fieldId || entry.id === fieldId)
  const rawOptions = Array.isArray(field?.options) ? field.options : []
  const seen = new Set<string>()
  const options: YunxiaoRequirementFieldOption[] = []
  for (const raw of rawOptions) {
    const label = fieldOptionLabel(raw)
    if (label && !seen.has(label)) {
      seen.add(label)
      options.push({ value: label, label })
    }
  }
  return options.length > 0 ? options : null
}

async function resolveOrganizationId(): Promise<string> {
  const configured = process.env.YUNXIAO_ORGANIZATION_ID?.trim()
  if (configured) {
    return configured
  }
  const result = await callOfficialYunxiaoTool('get_current_organization_info', {}, 120_000)
  const parsed = tryParseJson(result.text)
  return (
    valueFromPath(parsed, ['lastOrganization']) ||
    valueFromPath(parsed, ['organizationId']) ||
    DEFAULT_YUNXIAO_ORGANIZATION_ID
  )
}

export async function listYunxiaoRequirementFieldOptions(): Promise<YunxiaoRequirementFieldOptionsResult> {
  if (!getOfficialYunxiaoConnection()) {
    return fallbackOptions()
  }
  try {
    const organizationId = await resolveOrganizationId()
    const projectId =
      process.env.YUNXIAO_SPACE_ID?.trim() ||
      process.env.YUNXIAO_PROJECT_ID?.trim() ||
      DEFAULT_YUNXIAO_PROJECT_ID
    const workItemTypeId =
      process.env.YUNXIAO_WORKITEM_TYPE_ID?.trim() ||
      process.env.YUNXIAO_WORK_ITEM_TYPE_ID?.trim() ||
      process.env.YUNXIAO_REQUIREMENT_TYPE_ID?.trim() ||
      DEFAULT_YUNXIAO_REQUIREMENT_TYPE_ID
    const result = await callOfficialYunxiaoTool(
      'get_work_item_type_field_config',
      { organizationId, projectId, workItemTypeId },
      120_000
    )
    const fields = fieldConfigEntries(tryParseJson(result.text))
    return fallbackOptions({
      businessPriorities: optionsForField(fields, YUNXIAO_BUSINESS_PRIORITY_FIELD_ID) ?? undefined,
      systems: optionsForField(fields, YUNXIAO_SYSTEM_FIELD_ID) ?? undefined,
      customers: optionsForField(fields, YUNXIAO_CUSTOMER_FIELD_ID) ?? undefined
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
