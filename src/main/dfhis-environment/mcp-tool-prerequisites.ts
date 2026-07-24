import type { DfHisEnvironmentPrerequisiteResult } from '../../shared/dfhis-environment-types'
import { getHisMcpConnection, getOfficialYunxiaoConnection } from '../yunxiao/mcp-connections'
import { listTools, openMcpSession, type McpConnection } from '../yunxiao/mcp-http-transport'

const REQUIRED_HIS_MCP_TOOLS = [
  'dfhis_agent_chat',
  'download_yunxiao_archive',
  'comment_yunxiao_workitem',
  'git_inspect'
] as const

const REQUIRED_YUNXIAO_MCP_TOOLS = [
  'get_current_organization_info',
  'get_current_user',
  'get_work_item',
  'list_workitem_attachments',
  'get_workitem_file',
  'list_work_item_comments',
  'create_work_item_comment',
  'get_work_item_type_field_config',
  'get_work_item_workflow',
  'update_work_item'
] as const

async function checkRequiredMcpTools(args: {
  id: DfHisEnvironmentPrerequisiteResult['id']
  label: string
  missingTokenSummary: string
  connection: McpConnection | null
  clientName: string
  requiredTools: readonly string[]
  optionalWhenMissing?: boolean
}): Promise<DfHisEnvironmentPrerequisiteResult> {
  if (!args.connection || (!args.connection.bearerToken && !args.connection.hasQueryToken)) {
    if (args.optionalWhenMissing) {
      return {
        id: args.id,
        label: args.label,
        status: 'ok',
        summary: 'Optional fallback is not configured',
        detail:
          'Direct Yunxiao archive uses the official Yunxiao MCP. Configure HIS MCP only for legacy fallback.',
        fixable: true
      }
    }
    return {
      id: args.id,
      label: args.label,
      status: 'missing',
      summary: args.missingTokenSummary,
      fixable: false
    }
  }
  try {
    const sessionId = await openMcpSession(args.connection, args.clientName)
    const availableTools = new Set(await listTools(args.connection, sessionId, 60_000))
    const missingTools = args.requiredTools.filter((tool) => !availableTools.has(tool))
    if (missingTools.length > 0) {
      return {
        id: args.id,
        label: args.label,
        status: 'invalid',
        summary: 'MCP server is reachable but required tools are missing',
        detail: `Missing: ${missingTools.join(', ')}`,
        fixable: false
      }
    }
    return {
      id: args.id,
      label: args.label,
      status: 'ok',
      summary: 'Required MCP tools are available',
      detail: args.requiredTools.join(', '),
      fixable: false
    }
  } catch (error) {
    return {
      id: args.id,
      label: args.label,
      status: 'invalid',
      summary: 'MCP tools could not be verified',
      detail: error instanceof Error ? error.message : String(error),
      fixable: false
    }
  }
}

export function checkHisMcpToolsPrerequisite(): Promise<DfHisEnvironmentPrerequisiteResult> {
  return checkRequiredMcpTools({
    id: 'his-mcp-tools',
    label: 'HIS MCP fallback tools',
    missingTokenSummary: 'HIS MCP token is not set',
    connection: getHisMcpConnection(),
    clientName: 'orca-dfhis-his-mcp-check',
    requiredTools: REQUIRED_HIS_MCP_TOOLS,
    optionalWhenMissing: true
  })
}

export function checkYunxiaoMcpToolsPrerequisite(): Promise<DfHisEnvironmentPrerequisiteResult> {
  return checkRequiredMcpTools({
    id: 'yunxiao-mcp-tools',
    label: 'Yunxiao MCP tools',
    missingTokenSummary: 'Yunxiao access token is not set',
    connection: getOfficialYunxiaoConnection(),
    clientName: 'orca-dfhis-yunxiao-mcp-check',
    requiredTools: REQUIRED_YUNXIAO_MCP_TOOLS
  })
}
