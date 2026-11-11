import { createServer, type Server } from 'node:http'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { env as processEnv } from 'node:process'
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

export function mcpConfigFilePath(): string {
  return join(homedir(), '.orca', 'nextcloud-kb.mcp.json')
}

/** Drop a ready-made MCP client config where agents and Orca can pick it up. */
export function writeMcpConfigFile(url: string): string {
  const file = mcpConfigFilePath()
  mkdirSync(join(homedir(), '.orca'), { recursive: true })
  const json = { mcpServers: { 'nextcloud-kb': { type: 'http', url } } }
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, { mode: 0o600 })
  upsertAgentConfigs(url)
  return file
}

// Orca has no agent-agnostic MCP injection yet, so each managed harness gets its own
// user-level entry. Only the nextcloud-kb key/table is touched. A missing config is
// created only when the harness's data dir exists, so this stays a no-op where it isn't
// installed.
const HTTP_JSON_ENTRY = { type: 'http' } as const

type JsonMcpTarget = {
  file: string
  key: string
  entry: Record<string, unknown>
  createWhenDirExists?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function upsertJsonServers(target: JsonMcpTarget, url: string): void {
  let doc: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(readFileSync(target.file, 'utf8'))
    doc = isRecord(parsed) ? parsed : {}
  } catch {
    if (!target.createWhenDirExists || !existsSync(target.createWhenDirExists)) {
      return
    }
    doc = {}
  }
  const current = doc[target.key]
  const servers: Record<string, unknown> = isRecord(current) ? current : {}
  servers['nextcloud-kb'] = { ...target.entry, url }
  doc[target.key] = servers
  writeFileSync(target.file, `${JSON.stringify(doc, null, 2)}\n`, { mode: 0o600 })
}

// Codex keeps mcp_servers in TOML; rewrite just our table instead of parsing the file.
function upsertCodexToml(file: string, url: string): void {
  let doc: string
  try {
    doc = readFileSync(file, 'utf8')
  } catch {
    return
  }
  const stripped = doc.replace(/\n?#?\s*\[mcp_servers\.nextcloud-kb][^[]*/g, '')
  const entry = `\n[mcp_servers.nextcloud-kb]\nurl = ${JSON.stringify(url)}\n`
  writeFileSync(file, `${stripped.replace(/\n+$/, '')}${entry}`, { mode: 0o600 })
}

function upsertCodeBuddyConfig(url: string): void {
  const dir = join(homedir(), '.codebuddy')
  // User scope reads only the first existing file; creating a higher-priority one would
  // hide servers the user already configured in a lower-priority file.
  const candidates = [
    join(dir, '.mcp.json'),
    join(dir, 'mcp.json'),
    join(homedir(), '.codebuddy.json')
  ]
  const existing = candidates.find((file) => existsSync(file))
  upsertJsonServers(
    {
      file: existing ?? candidates[0],
      key: 'mcpServers',
      entry: HTTP_JSON_ENTRY,
      createWhenDirExists: existing ? undefined : dir
    },
    url
  )
}

function upsertKimiConfig(url: string): void {
  const dir = processEnv.KIMI_CODE_HOME?.trim() || join(homedir(), '.kimi-code')
  // Kimi infers an http server from `url`; `type` is not part of its mcp.json entry shape.
  upsertJsonServers(
    { file: join(dir, 'mcp.json'), key: 'mcpServers', entry: {}, createWhenDirExists: dir },
    url
  )
}

function upsertDevinConfig(url: string): void {
  const dir = processEnv.APPDATA
    ? join(processEnv.APPDATA, 'devin')
    : join(homedir(), '.config', 'devin')
  // v3000.3+ reads the dedicated file; older builds read mcpServers from config.json and
  // newer ones migrate that key on startup, so both stay covered.
  upsertJsonServers(
    {
      file: join(dir, 'mcp_config.json'),
      key: 'mcpServers',
      entry: { transport: 'http' },
      createWhenDirExists: dir
    },
    url
  )
  upsertJsonServers(
    { file: join(dir, 'config.json'), key: 'mcpServers', entry: { transport: 'http' } },
    url
  )
}

function upsertAgentConfigs(url: string): void {
  const home = homedir()
  upsertJsonServers(
    { file: join(home, '.claude.json'), key: 'mcpServers', entry: HTTP_JSON_ENTRY },
    url
  )
  upsertJsonServers(
    { file: join(home, '.gemini', 'settings.json'), key: 'mcpServers', entry: HTTP_JSON_ENTRY },
    url
  )
  // OpenCode's config uses `mcp` with remote entries, not Claude's mcpServers/http shape.
  upsertJsonServers(
    {
      file: join(home, '.config', 'opencode', 'opencode.json'),
      key: 'mcp',
      entry: { type: 'remote', enabled: true }
    },
    url
  )
  upsertCodexToml(join(home, '.codex', 'config.toml'), url)
  upsertCodeBuddyConfig(url)
  upsertKimiConfig(url)
  upsertDevinConfig(url)
}
