import { createServer, type Server } from 'node:http'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { FetchLike, NextcloudConnection } from './nextcloud'
import { listDirectory, readFile, searchFiles } from './nextcloud'
import type { KbEntry } from '../src/protocol'

const READ_MAX_BYTES = 512 * 1024
// A fixed port keeps the MCP URL stable across enables, so agent configs written once stay valid.
const MCP_PORT = 18099

const TOOLS: Record<string, { description: string; schema: Record<string, unknown> }> = {
  kb_list: {
    description: 'List files and folders under a Nextcloud knowledge base path',
    schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute path, e.g. /' } },
      required: ['path']
    }
  },
  kb_search: {
    description: 'Full-text search file names and contents in the knowledge base',
    schema: {
      type: 'object',
      properties: { term: { type: 'string', description: 'Search term' } },
      required: ['term']
    }
  },
  kb_read: {
    description: 'Read a text file (markdown, txt, csv...) from the knowledge base',
    schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute file path' } },
      required: ['path']
    }
  }
}

export type McpHandle = { port: number; url: string; close: () => void }

export function startMcpServer(
  fetchLike: FetchLike,
  getConnection: () => Promise<NextcloudConnection | null>
): Promise<McpHandle> {
  const runs: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
    kb_list: async (args) => {
      const conn = await requireConn(getConnection)
      const entries = await listDirectory(fetchLike, conn, String(args.path ?? '/'))
      return JSON.stringify(
        entries.map((e: KbEntry) => ({ path: e.path, name: e.name, dir: e.dir, size: e.size }))
      )
    },
    kb_search: async (args) => {
      const conn = await requireConn(getConnection)
      const result = await searchFiles(fetchLike, conn, String(args.term ?? ''), null)
      return JSON.stringify(result.entries)
    },
    kb_read: async (args) => {
      const conn = await requireConn(getConnection)
      const data = await readFile(fetchLike, conn, String(args.path ?? ''), READ_MAX_BYTES)
      return data.kind === 'text' ? data.text : `binary file (${data.byteLength} bytes)`
    }
  }

  const answer = async (msg: {
    id?: unknown
    method?: string
    params?: Record<string, unknown>
  }): Promise<unknown> => {
    if (msg.method === 'initialize') {
      return {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'nextcloud-kb', version: '0.1.0' }
      }
    }
    if (msg.method === 'ping') {
      return {}
    }
    if (msg.method === 'tools/list') {
      return {
        tools: Object.entries(TOOLS).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.schema
        }))
      }
    }
    if (msg.method === 'tools/call') {
      const name = String(msg.params?.name ?? '')
      const run = runs[name]
      if (!run) {
        throw new Error(`unknown tool ${name}`)
      }
      const text = await run((msg.params?.arguments as Record<string, unknown>) ?? {})
      return { content: [{ type: 'text', text }] }
    }
    throw new Error(`unsupported method ${String(msg.method)}`)
  }

  const server: Server = createServer((req, res) => {
    const send = (code: number, body: unknown): void => {
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.method !== 'POST' || req.url !== '/mcp') {
      send(404, { error: 'not found' })
      return
    }
    const chunks: Uint8Array[] = []
    req.on('data', (c: Uint8Array) => chunks.push(c))
    req.on('end', () => {
      void (async () => {
        try {
          const total = chunks.reduce((n, c) => n + c.length, 0)
          const bytes = new Uint8Array(total)
          let at = 0
          for (const c of chunks) {
            bytes.set(c, at)
            at += c.length
          }
          const msg = JSON.parse(new TextDecoder().decode(bytes))
          if (typeof msg?.method === 'string' && msg.id === undefined) {
            send(202, {})
            return
          }
          const result = await answer(msg)
          send(200, { jsonrpc: '2.0', id: msg.id ?? null, result })
        } catch (error) {
          send(200, {
            jsonrpc: '2.0',
            id: null,
            error: { code: -32603, message: error instanceof Error ? error.message : String(error) }
          })
        }
      })()
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(MCP_PORT, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({ port, url: `http://127.0.0.1:${port}/mcp`, close: () => server.close() })
    })
  })
}

async function requireConn(
  getConnection: () => Promise<NextcloudConnection | null>
): Promise<NextcloudConnection> {
  const conn = await getConnection()
  if (!conn) {
    throw new Error('Nextcloud is not configured')
  }
  return conn
}

/** Drop a ready-made MCP client config where agents and Orca can pick it up. */
export function writeMcpConfigFile(url: string): string {
  const dir = join(homedir(), '.orca')
  const file = join(dir, 'nextcloud-kb.mcp.json')
  mkdirSync(dir, { recursive: true })
  const json = { mcpServers: { 'nextcloud-kb': { type: 'http', url } } }
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, { mode: 0o600 })
  upsertClaudeUserServers(url)
  return file
}

// Claude Code reads ~/.claude.json mcpServers at user scope, making the tools visible to every
// Orca-managed claude session without per-project setup. Only our key is touched.
function upsertClaudeUserServers(url: string): void {
  const file = join(homedir(), '.claude.json')
  let doc: Record<string, unknown> = {}
  if (existsSync(file)) {
    try {
      doc = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    } catch {
      return
    }
  }
  const servers =
    typeof doc.mcpServers === 'object' && doc.mcpServers !== null
      ? (doc.mcpServers as Record<string, unknown>)
      : {}
  servers['nextcloud-kb'] = { type: 'http', url }
  doc.mcpServers = servers
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, { mode: 0o600 })
}
