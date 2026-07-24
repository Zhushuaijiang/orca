import { randomUUID } from 'node:crypto'
import type {
  YunxiaoArchiveRequirementArgs,
  YunxiaoArchiveRequirementResult,
  YunxiaoCreateRequirementArgs,
  YunxiaoRequirementResult
} from '../../shared/yunxiao-types'
import { callTool, type McpToolCallResult, openMcpSession } from './mcp-http-transport'
import { getHisMcpConnection, getOfficialYunxiaoConnection } from './mcp-connections'
import { callStdioTool } from './mcp-stdio-transport'
import { runDirectYunxiaoArchive } from './direct-archive-runner'
import {
  DEFAULT_YUNXIAO_ORGANIZATION_ID,
  DEFAULT_YUNXIAO_PROJECT_ID,
  DEFAULT_YUNXIAO_REQUIREMENT_TYPE_ID,
  getDefaultCustomFieldValues
} from './requirement-defaults'
import {
  extractWorkItemId,
  extractWorkItemIdFromValue,
  extractYunxiaoUrl,
  extractYunxiaoUrlFromValue,
  tryParseJson,
  valueFromPath
} from './work-item-result-extraction'

const DEFAULT_EXPERT = '云效需求归档专家'

function buildCreateRequirementMessage(args: YunxiaoCreateRequirementArgs): string {
  const parts = [
    '请在云效创建一条需求。',
    `标题：${args.title.trim()}`,
    args.description?.trim() ? `描述：\n${args.description.trim()}` : '',
    args.priority ? `优先级：${args.priority}` : '',
    args.labels?.length ? `标签：${args.labels.join(', ')}` : '',
    args.assignee?.trim() ? `负责人：${args.assignee.trim()}` : '',
    '创建完成后请返回需求编号、云效链接和简要状态。'
  ]
  return parts.filter(Boolean).join('\n\n')
}

function parseOptionalJsonRecord(value: string | undefined): Record<string, string> | undefined {
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

function parseCsv(value: string | undefined): string[] | undefined {
  const items = value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items?.length ? items : undefined
}

export async function callOfficialYunxiaoTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
  timeoutMs: number
): Promise<McpToolCallResult> {
  if (process.env.YUNXIAO_MCP_TRANSPORT?.trim().toLowerCase() === 'stdio') {
    return callStdioTool(toolName, toolArgs, timeoutMs)
  }
  const connection = getOfficialYunxiaoConnection()
  if (!connection) {
    throw new Error('Set YUNXIAO_ACCESS_TOKEN to create Yunxiao requirements via official MCP.')
  }
  const sessionId = await openMcpSession(connection, 'orca-official-yunxiao')
  return callTool(connection, sessionId, toolName, toolArgs, timeoutMs)
}

async function getOfficialYunxiaoDefaults(): Promise<{ organizationId: string; assignee: string }> {
  const configuredOrganizationId = process.env.YUNXIAO_ORGANIZATION_ID?.trim()
  const configuredAssignee = process.env.YUNXIAO_ASSIGNEE_ID?.trim()
  if (configuredOrganizationId && configuredAssignee) {
    return { organizationId: configuredOrganizationId, assignee: configuredAssignee }
  }

  const result = await callOfficialYunxiaoTool('get_current_organization_info', {}, 120_000)
  const parsed = tryParseJson(result.text)
  const organizationId =
    configuredOrganizationId ||
    valueFromPath(parsed, ['lastOrganization']) ||
    valueFromPath(parsed, ['organizationId']) ||
    DEFAULT_YUNXIAO_ORGANIZATION_ID
  const assignee =
    configuredAssignee || valueFromPath(parsed, ['userId']) || valueFromPath(parsed, ['id'])
  if (!organizationId || !assignee) {
    throw new Error(
      'Could not resolve Yunxiao organization or assignee; set YUNXIAO_ORGANIZATION_ID and YUNXIAO_ASSIGNEE_ID.'
    )
  }
  return { organizationId, assignee }
}

async function resolveCreatedWorkItem(
  organizationId: string,
  createResultText: string
): Promise<{ workItemId: string | null; url: string | null; message: string }> {
  const parsedCreateResult = tryParseJson(createResultText)
  const createdId = extractWorkItemIdFromValue(parsedCreateResult)
  if (!createdId) {
    return {
      workItemId: null,
      url: extractYunxiaoUrlFromValue(parsedCreateResult),
      message: createResultText
    }
  }
  const detail = await callOfficialYunxiaoTool(
    'get_work_item',
    { organizationId, workItemId: createdId },
    120_000
  )
  const parsedDetail = tryParseJson(detail.text)
  const workItemId = extractWorkItemIdFromValue(parsedDetail) ?? createdId
  return {
    workItemId,
    url:
      extractYunxiaoUrlFromValue(parsedDetail) ??
      (workItemId.startsWith('DFHIS-')
        ? `https://devops.aliyun.com/projex/req/${workItemId}`
        : null),
    message: detail.text
  }
}

async function createOfficialYunxiaoRequirement(
  args: YunxiaoCreateRequirementArgs
): Promise<YunxiaoRequirementResult> {
  const { organizationId, assignee } = await getOfficialYunxiaoDefaults()
  const spaceId =
    process.env.YUNXIAO_SPACE_ID?.trim() ||
    process.env.YUNXIAO_PROJECT_ID?.trim() ||
    DEFAULT_YUNXIAO_PROJECT_ID
  const workitemTypeId =
    process.env.YUNXIAO_WORKITEM_TYPE_ID?.trim() ||
    process.env.YUNXIAO_WORK_ITEM_TYPE_ID?.trim() ||
    process.env.YUNXIAO_REQUIREMENT_TYPE_ID?.trim() ||
    DEFAULT_YUNXIAO_REQUIREMENT_TYPE_ID
  if (!spaceId || !workitemTypeId) {
    throw new Error(
      'Set YUNXIAO_PROJECT_ID or YUNXIAO_SPACE_ID, plus YUNXIAO_WORKITEM_TYPE_ID, before creating Yunxiao requirements.'
    )
  }

  const labelIds = parseCsv(process.env.YUNXIAO_LABEL_IDS) ?? args.labels
  const customFieldValues = {
    ...getDefaultCustomFieldValues(args.priority),
    ...parseOptionalJsonRecord(process.env.YUNXIAO_CUSTOM_FIELD_VALUES_JSON)
  }
  const result = await callOfficialYunxiaoTool(
    'create_work_item',
    {
      organizationId,
      spaceId,
      subject: args.title.trim(),
      workitemTypeId,
      assignedTo: args.assignee?.trim() || assignee,
      ...(args.description?.trim()
        ? { description: args.description.trim(), formatType: 'MARKDOWN' }
        : {}),
      ...(labelIds?.length ? { labels: labelIds } : {}),
      customFieldValues
    },
    180_000
  )
  const created = await resolveCreatedWorkItem(organizationId, result.text)
  const archiveText =
    args.archiveAfterCreate && (created.workItemId || created.url)
      ? await archiveMessage(created.workItemId ?? created.url ?? '', true, 'deep')
      : undefined
  return {
    ok: true,
    workItemId: created.workItemId,
    url: created.url,
    message: created.message,
    ...(archiveText ? { archiveMessage: archiveText } : {})
  }
}

async function archiveMessage(workItemIdOrUrl: string, dispatch: boolean, reviewMode = 'deep') {
  const connection = getHisMcpConnection()
  if (!connection.bearerToken && !connection.hasQueryToken) {
    throw new Error(
      'Set HIS_MCP_TOKEN or set HIS_MCP_URL to a Yunxiao MCP URL with a t query token.'
    )
  }
  const sessionId = await openMcpSession(connection, 'orca-yunxiao-archiver')
  const agentSessionId = `orca-yunxiao-archive-${randomUUID()}`
  const message = dispatch
    ? `/expert ${DEFAULT_EXPERT} ${reviewMode === 'quick' ? '日报' : '深度审查'} 请归档 ${workItemIdOrUrl}`
    : `请归档 ${workItemIdOrUrl}`
  const result = await callTool(
    connection,
    sessionId,
    'dfhis_agent_chat',
    {
      message,
      session_id: agentSessionId,
      ...(dispatch ? {} : { expert: DEFAULT_EXPERT }),
      debug: false,
      timeout_seconds: dispatch ? 600 : 1800
    },
    dispatch ? 600_000 : 1_800_000
  )
  return result.text
}

export async function createYunxiaoRequirement(
  args: YunxiaoCreateRequirementArgs
): Promise<YunxiaoRequirementResult> {
  const title = args.title.trim()
  if (!title) {
    return { ok: false, error: 'Title is required.' }
  }
  try {
    if (getOfficialYunxiaoConnection()) {
      return await createOfficialYunxiaoRequirement({ ...args, title })
    }

    const connection = getHisMcpConnection()
    if (!connection.bearerToken && !connection.hasQueryToken) {
      throw new Error('Set YUNXIAO_ACCESS_TOKEN, or configure HIS_MCP_URL/HIS_MCP_TOKEN.')
    }
    const sessionId = await openMcpSession(connection, 'orca-yunxiao-requirement')
    const result = await callTool(
      connection,
      sessionId,
      'dfhis_agent_chat',
      {
        message: buildCreateRequirementMessage({ ...args, title }),
        session_id: `orca-yunxiao-create-${randomUUID()}`,
        expert: DEFAULT_EXPERT,
        debug: false,
        timeout_seconds: 1800
      },
      1_800_000
    )
    const workItemId = extractWorkItemId(result.text)
    const url = extractYunxiaoUrl(result.text)
    const archiveText =
      args.archiveAfterCreate && (workItemId || url)
        ? await archiveMessage(workItemId ?? url ?? '', true, 'deep')
        : undefined
    return {
      ok: true,
      workItemId,
      url,
      message: result.text,
      ...(archiveText ? { archiveMessage: archiveText } : {})
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function archiveYunxiaoRequirement(
  args: YunxiaoArchiveRequirementArgs
): Promise<YunxiaoArchiveRequirementResult> {
  const target = args.workItemIdOrUrl.trim()
  if (!target) {
    return { ok: false, error: 'Yunxiao work item id or URL is required.' }
  }
  try {
    let directError: Error | null = null
    if (getOfficialYunxiaoConnection()) {
      try {
        const direct = await runDirectYunxiaoArchive(target)
        if (direct.ok) {
          return {
            ok: true,
            workItemId: direct.work_item_id ?? extractWorkItemId(target),
            message: direct.message ?? ''
          }
        }
        directError = new Error(direct.error || 'Direct Yunxiao archive failed.')
      } catch (error) {
        directError = error instanceof Error ? error : new Error(String(error))
      }
    }
    let message: string
    try {
      message = await archiveMessage(target, args.dispatch ?? true, args.reviewMode ?? 'deep')
    } catch (error) {
      if (directError) {
        const fallbackError = error instanceof Error ? error.message : String(error)
        throw new Error(
          `Direct Yunxiao archive failed: ${directError.message}; HIS MCP fallback failed: ${fallbackError}`
        )
      }
      throw error
    }
    return {
      ok: true,
      workItemId: extractWorkItemId(message) ?? extractWorkItemId(target),
      message
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
