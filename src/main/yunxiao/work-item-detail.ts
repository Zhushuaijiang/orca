import type {
  YunxiaoUpdateWorkItemDescriptionArgs,
  YunxiaoUpdateWorkItemDescriptionResult,
  YunxiaoWorkItemDetailArgs,
  YunxiaoWorkItemDetailResult
} from '../../shared/yunxiao-types'
import { callOfficialYunxiaoTool, getOfficialYunxiaoDefaults } from './client'
import { normalizeYunxiaoWorkItemDescription } from './work-item-description'
import {
  extractWorkItemId,
  extractWorkItemIdFromValue,
  tryParseJson,
  valueFromPath
} from './work-item-result-extraction'

function resolveWorkItemUrl(parsed: unknown, workItemId: string): string | null {
  const direct = valueFromPath(parsed, ['workItemUrl']) ?? valueFromPath(parsed, ['url'])
  if (direct && /devops\.aliyun\.com\/projex\/(req|task|bug|risk)\b/i.test(direct)) {
    return direct
  }
  // Why: get_work_item carries no page URL, and the payload's only devops links are
  // attachment-file endpoints — deriving from the id is the only stable answer.
  return /^DFHIS-\d+$/i.test(workItemId)
    ? `https://devops.aliyun.com/projex/req/${workItemId}`
    : null
}

function resolveWorkItemId(workItemIdOrUrl: string): string {
  const target = workItemIdOrUrl.trim()
  return extractWorkItemId(target) ?? target
}

export async function getYunxiaoWorkItemDetail(
  args: YunxiaoWorkItemDetailArgs
): Promise<YunxiaoWorkItemDetailResult> {
  const workItemId = resolveWorkItemId(args.workItemIdOrUrl ?? '')
  if (!workItemId) {
    return { ok: false, error: 'Yunxiao work item id or URL is required.' }
  }
  try {
    const { organizationId } = await getOfficialYunxiaoDefaults()
    const result = await callOfficialYunxiaoTool(
      'get_work_item',
      { organizationId, workItemId },
      120_000
    )
    const parsed = tryParseJson(result.text)
    return {
      ok: true,
      workItemId: extractWorkItemIdFromValue(parsed) ?? workItemId,
      subject: valueFromPath(parsed, ['subject']) ?? valueFromPath(parsed, ['title']) ?? '',
      description: normalizeYunxiaoWorkItemDescription(
        typeof parsed === 'object' && parsed !== null && 'description' in parsed
          ? parsed.description
          : null
      ),
      url: resolveWorkItemUrl(parsed, workItemId)
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Overwrites the ticket description. Callers must keep the pre-deepening text inside the
 * payload; `composeDeepenedRequirementDescription` does that.
 */
export async function updateYunxiaoWorkItemDescription(
  args: YunxiaoUpdateWorkItemDescriptionArgs
): Promise<YunxiaoUpdateWorkItemDescriptionResult> {
  const workItemId = resolveWorkItemId(args.workItemIdOrUrl ?? '')
  if (!workItemId) {
    return { ok: false, error: 'Yunxiao work item id or URL is required.' }
  }
  const description = args.description?.trim() ?? ''
  if (!description) {
    return { ok: false, error: 'Description is required.' }
  }
  try {
    const { organizationId } = await getOfficialYunxiaoDefaults()
    await callOfficialYunxiaoTool(
      'update_work_item',
      {
        organizationId,
        workItemId,
        updateWorkItemFields: { description, formatType: 'MARKDOWN' }
      },
      120_000
    )
    return { ok: true, workItemId }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
