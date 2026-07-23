import { spawn } from 'node:child_process'
import type { McpJson, McpToolCallResult } from './mcp-http-transport'

const MCP_PROTOCOL_VERSION = '2025-03-26'

function getDefaultCommand(): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/c', 'npx', '-y', 'alibabacloud-devops-mcp-server']
    }
  }
  return { command: 'npx', args: ['-y', 'alibabacloud-devops-mcp-server'] }
}

function parseJsonLine(line: string): McpJson | null {
  try {
    const parsed = JSON.parse(line) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as McpJson) : null
  } catch {
    return null
  }
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
  return parts.length > 0 ? parts.join('\n') : JSON.stringify(response)
}

export async function callStdioTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
  timeoutMs: number
): Promise<McpToolCallResult> {
  const token = process.env.YUNXIAO_ACCESS_TOKEN?.trim()
  if (!token) {
    throw new Error('Set YUNXIAO_ACCESS_TOKEN before connecting to Yunxiao stdio MCP.')
  }
  const { command, args } = getDefaultCommand()
  const child = spawn(command, args, {
    env: { ...process.env, YUNXIAO_ACCESS_TOKEN: token },
    stdio: ['pipe', 'pipe', 'pipe']
  })
  let nextId = 1
  let stdoutBuffer = ''
  let stderrBuffer = ''
  const pending = new Map<
    number,
    { resolve: (value: McpJson) => void; reject: (error: Error) => void }
  >()
  const timer = setTimeout(() => {
    child.kill('SIGTERM')
    for (const waiter of pending.values()) {
      waiter.reject(new Error(`Yunxiao stdio MCP timed out: ${stderrBuffer.slice(-1000)}`))
    }
    pending.clear()
  }, timeoutMs)

  child.stdout.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split(/\r?\n/)
    stdoutBuffer = lines.pop() ?? ''
    for (const line of lines) {
      const message = parseJsonLine(line.trim())
      if (!message) {
        continue
      }
      const id = typeof message.id === 'number' ? message.id : null
      if (id === null) {
        continue
      }
      const waiter = pending.get(id)
      if (!waiter) {
        continue
      }
      pending.delete(id)
      const error = message.error
      if (error && typeof error === 'object') {
        waiter.reject(
          new Error(String((error as { message?: unknown }).message ?? JSON.stringify(error)))
        )
      } else {
        waiter.resolve(message)
      }
    }
  })
  child.stderr.on('data', (chunk: Buffer) => {
    stderrBuffer += chunk.toString()
  })

  function request(method: string, params?: Record<string, unknown>): Promise<McpJson> {
    const id = nextId
    nextId += 1
    const payload = { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      child.stdin.write(`${JSON.stringify(payload)}\n`)
    })
  }

  try {
    await request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'orca-yunxiao-stdio', version: '0.1' }
    })
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`
    )
    const response = await request('tools/call', {
      name: toolName,
      arguments: toolArgs
    })
    return { text: extractToolText(response) }
  } finally {
    clearTimeout(timer)
    child.kill('SIGTERM')
  }
}
