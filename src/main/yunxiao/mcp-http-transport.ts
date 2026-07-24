const MCP_PROTOCOL_VERSION = '2025-03-26'

export type McpJson = Record<string, unknown>
export type McpConnection = { url: string; bearerToken: string | null; hasQueryToken: boolean }
export type McpToolCallResult = { text: string }

function extractMcpJson(body: string): McpJson {
  try {
    const parsed = JSON.parse(body)
    return parsed && typeof parsed === 'object' ? (parsed as McpJson) : {}
  } catch {
    // Streamable HTTP endpoints may return text/event-stream frames.
  }
  const lines = body.split(/\r?\n/)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim() ?? ''
    if (!line.startsWith('data:')) {
      continue
    }
    const data = line.slice(5).trim()
    if (!data) {
      continue
    }
    try {
      const parsed = JSON.parse(data)
      return parsed && typeof parsed === 'object' ? (parsed as McpJson) : {}
    } catch {
      continue
    }
  }
  return {}
}

function getResponseError(response: McpJson): string | null {
  const error = response.error
  if (!error || typeof error !== 'object') {
    return null
  }
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' ? message : JSON.stringify(error)
}

function extractToolText(response: McpJson): string {
  const result = response.result && typeof response.result === 'object' ? response.result : {}
  const content = 'content' in result && Array.isArray(result.content) ? result.content : []
  const parts = content
    .map((item) =>
      item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string'
        ? (item as { text: string }).text
        : ''
    )
    .filter(Boolean)
  if (parts.length > 0) {
    return parts.join('\n')
  }
  const structured =
    'structuredContent' in result &&
    result.structuredContent &&
    typeof result.structuredContent === 'object'
      ? (result.structuredContent as { result?: unknown })
      : null
  if (structured?.result !== undefined) {
    return String(structured.result)
  }
  return JSON.stringify(response)
}

async function mcpPost(
  connection: McpConnection,
  payload: McpJson,
  timeoutMs: number,
  sessionId?: string
): Promise<{ response: McpJson; sessionId: string }> {
  if (!connection.bearerToken && !connection.hasQueryToken) {
    throw new Error('Set an MCP token before connecting to Yunxiao.')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(connection.url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        ...(connection.bearerToken ? { Authorization: `Bearer ${connection.bearerToken}` } : {}),
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {})
      },
      body: JSON.stringify(payload)
    })
    const body = await response.text()
    if (!response.ok) {
      throw new Error(`MCP HTTP ${response.status}: ${body.slice(0, 1000)}`)
    }
    const parsed = extractMcpJson(body)
    const responseError = getResponseError(parsed)
    if (responseError) {
      throw new Error(responseError)
    }
    return {
      response: parsed,
      sessionId: response.headers.get('Mcp-Session-Id') ?? ''
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function openMcpSession(
  connection: McpConnection,
  clientName: string
): Promise<string> {
  const { response, sessionId } = await mcpPost(
    connection,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: clientName, version: '0.1' }
      }
    },
    60_000
  )
  if (connection.hasQueryToken && !sessionId) {
    throw new Error(`MCP initialize did not return Mcp-Session-Id: ${JSON.stringify(response)}`)
  }
  if (sessionId) {
    await mcpPost(
      connection,
      { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
      60_000,
      sessionId
    )
  }
  return sessionId
}

export async function callTool(
  connection: McpConnection,
  sessionId: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  timeoutMs: number
): Promise<McpToolCallResult> {
  const { response } = await mcpPost(
    connection,
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: toolArgs
      }
    },
    timeoutMs,
    sessionId
  )
  return { text: extractToolText(response) }
}

export async function listTools(
  connection: McpConnection,
  sessionId: string,
  timeoutMs: number
): Promise<string[]> {
  const { response } = await mcpPost(
    connection,
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
      params: {}
    },
    timeoutMs,
    sessionId
  )
  const result = response.result && typeof response.result === 'object' ? response.result : {}
  const tools = 'tools' in result && Array.isArray(result.tools) ? result.tools : []
  return tools
    .map((tool) =>
      tool && typeof tool === 'object' && typeof (tool as { name?: unknown }).name === 'string'
        ? (tool as { name: string }).name
        : ''
    )
    .filter(Boolean)
}
