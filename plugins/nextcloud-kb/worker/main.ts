/* eslint-disable max-lines -- Why: all panel request handlers share the connection and index state in one activation scope */
// The plugin's worker: owns the Nextcloud connection (settings + secret) and answers
// every panel request. HTTP never runs in the panel; the frame's network is closed.

import type { OrcaWorkerApi } from 'orca/worker'
import type { KbEntry } from '../src/protocol'
import { mcpConfigFilePath, startMcpServer, writeMcpConfigFile } from './mcp-server'
import { readFile, stat } from 'node:fs/promises'
import {
  crawlNameIndex,
  createDirectory,
  ensureShareLink,
  deleteEntry,
  listDirectory,
  moveEntry,
  NextcloudError,
  normalizeServerUrl,
  readBlobChunk,
  searchFiles,
  uploadBytes,
  whoAmI,
  type FetchLike,
  type NextcloudConnection
} from './nextcloud.ts'

const fetchLike: FetchLike = (url, init) => fetch(url, init)

const MAX_UPLOAD_BYTES = 512 * 1024 * 1024
const MAX_BLOB_BYTES = 45 * 1024 * 1024
const MAX_BLOB_CHUNK_BYTES = 512 * 1024
const INDEX_TTL_MS = 30 * 60 * 1000

// In-memory filename index: the crawl exposes partial entries, so a search never waits for it.
type IndexState = {
  entries: KbEntry[]
  complete: boolean
  truncated: boolean
  builtAt: number
  done: Promise<{ truncated: boolean }>
}
let nameIndex: IndexState | null = null
let indexRefresh: IndexState | null = null

const UPLOAD_CONTENT_TYPES: Record<string, string> = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.json': 'application/json',
  '.csv': 'text/csv'
}

function baseName(name: string): string {
  // Windows file choosers and drops hand over backslash-separated paths.
  const clean =
    name
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() ?? ''
  if (clean === '' || clean === '.' || clean === '..' || /[\\/]/.test(clean)) {
    throw new NextcloudError('invalid_params', '名称不合法')
  }
  return clean
}

function contentTypeFor(name: string): string {
  const dot = name.toLowerCase().lastIndexOf('.')
  const ext = dot !== -1 ? name.slice(dot) : ''
  return UPLOAD_CONTENT_TYPES[ext] ?? 'application/octet-stream'
}

function requireConnection(connection: NextcloudConnection | null): NextcloudConnection | null {
  return connection
}

export default async function activate(orca: OrcaWorkerApi): Promise<void> {
  async function currentConnection(): Promise<NextcloudConnection | null> {
    const serverUrl = await orca.settings.get('serverUrl')
    const username = await orca.settings.get('username')
    const appPassword = await orca.secrets.get('appPassword')
    if (
      typeof serverUrl !== 'string' ||
      serverUrl.trim() === '' ||
      typeof username !== 'string' ||
      username.trim() === '' ||
      typeof appPassword !== 'string' ||
      appPassword === ''
    ) {
      return null
    }
    return {
      serverUrl: normalizeServerUrl(serverUrl),
      username: username.trim(),
      appPassword
    }
  }

  let indexGeneration = 0

  function indexSize(): number {
    return nameIndex?.entries.length ?? 0
  }

  function startIndex(connection: NextcloudConnection): IndexState {
    const crawl = crawlNameIndex(fetchLike, connection)
    const generation = indexGeneration
    const state: IndexState = {
      entries: crawl.entries,
      complete: false,
      truncated: false,
      builtAt: Date.now(),
      done: crawl.done
    }
    void crawl.done
      .then(({ truncated }) => {
        if (generation === indexGeneration) {
          state.complete = true
          state.truncated = truncated
          state.builtAt = Date.now()
        }
      })
      .catch(() => {
        if (generation === indexGeneration && nameIndex === state) {
          nameIndex = null
        }
      })
    return state
  }

  /** Starts or advances the crawl but never awaits it; the caller reads live partial entries. */
  function ensureIndex(connection: NextcloudConnection): IndexState {
    if (nameIndex === null) {
      nameIndex = startIndex(connection)
    } else if (
      nameIndex.complete &&
      Date.now() - nameIndex.builtAt >= INDEX_TTL_MS &&
      indexRefresh === null
    ) {
      const generation = indexGeneration
      const next = startIndex(connection)
      indexRefresh = next
      void next.done
        .then(() => {
          if (generation === indexGeneration) {
            nameIndex = next
          }
        })
        .catch(() => {})
        .finally(() => {
          if (indexRefresh === next) {
            indexRefresh = null
          }
        })
    }
    return nameIndex
  }

  function invalidateIndex(): void {
    indexGeneration += 1
    nameIndex = null
    indexRefresh = null
  }

  orca.panels.handle('kb.status', async ({ refreshIndex }) => {
    const connection = await currentConnection()
    if (!connection) {
      return {
        configured: false,
        serverUrl: '',
        username: '',
        ok: false,
        error: null
      }
    }
    try {
      await listDirectory(fetchLike, connection, '/')
    } catch (error) {
      return {
        configured: true,
        serverUrl: connection.serverUrl,
        username: connection.username,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
    if (refreshIndex === true) {
      invalidateIndex()
    }
    // Warm the name index in the background so the first search is already local.
    ensureIndex(connection)
    return {
      configured: true,
      serverUrl: connection.serverUrl,
      username: connection.username,
      ok: true,
      error: null
    }
  })

  orca.panels.handle(
    'kb.connect',
    async ({
      serverUrl,
      username,
      appPassword
    }): Promise<{ ok: true; displayName: string | null }> => {
      const candidate: NextcloudConnection = {
        serverUrl: normalizeServerUrl(serverUrl),
        username: username.trim(),
        appPassword
      }
      if (!/^https?:\/\/[^/]+/i.test(candidate.serverUrl)) {
        throw new NextcloudError(
          'invalid_params',
          '服务器地址不合法，例如 http://192.168.1.10:18100'
        )
      }
      const user = await whoAmI(fetchLike, candidate)
      await listDirectory(fetchLike, candidate, '/')
      if (user.id !== candidate.username) {
        throw new NextcloudError(
          'invalid_params',
          `应用密码属于账号 ${user.id}，与用户名 ${candidate.username} 不一致`
        )
      }
      await orca.settings.set('serverUrl', candidate.serverUrl)
      await orca.settings.set('username', candidate.username)
      await orca.secrets.set('appPassword', candidate.appPassword)
      return { ok: true, displayName: user.displayName }
    }
  )

  orca.panels.handle('kb.list', async ({ path }) => {
    const connection = requireConnection(await currentConnection())
    if (!connection) {
      throw new NextcloudError('invalid_params', '尚未配置连接，请先保存服务器与凭据')
    }
    return { entries: await listDirectory(fetchLike, connection, path) }
  })

  orca.panels.handle('kb.search', async ({ term, cursor, refresh }) => {
    const connection = requireConnection(await currentConnection())
    if (!connection) {
      throw new NextcloudError('invalid_params', '尚未配置连接，请先保存服务器与凭据')
    }
    const clean = term.trim()
    if (clean === '') {
      return {
        entries: [],
        cursor: null,
        indexed: true,
        source: 'index' as const,
        indexSize: indexSize(),
        indexTruncated: nameIndex?.truncated ?? false
      }
    }
    if (refresh === true) {
      invalidateIndex()
    }
    const index = ensureIndex(connection)
    if (index.entries.length === 0) {
      // The crawl has not produced its first directory yet; keep this one query on the server.
      const fallback = await searchFiles(fetchLike, connection, clean, cursor)
      return {
        ...fallback,
        indexed: false,
        source: 'ocs' as const,
        indexSize: 0,
        indexTruncated: false
      }
    }
    const needle = clean.toLowerCase()
    const scored: { entry: KbEntry; score: number }[] = []
    for (const entry of index.entries) {
      const name = entry.name.toLowerCase()
      const score = name.startsWith(needle)
        ? 0
        : name.includes(needle)
          ? 1
          : entry.path.toLowerCase().includes(needle)
            ? 2
            : -1
      if (score >= 0) {
        scored.push({ entry, score })
      }
    }
    scored.sort(
      (a, b) => a.score - b.score || a.entry.name.localeCompare(b.entry.name, 'zh-Hans-CN')
    )
    if (scored.length === 0 && (!index.complete || index.truncated)) {
      // A partial index may not have reached the match yet; ask the server once for this query.
      const fallback = await searchFiles(fetchLike, connection, clean, cursor)
      return {
        ...fallback,
        indexed: index.complete,
        source: 'ocs' as const,
        indexSize: index.entries.length,
        indexTruncated: index.truncated
      }
    }
    return {
      entries: scored.slice(0, 60).map(({ entry }) => ({
        name: entry.name,
        path: entry.path,
        dir: entry.dir,
        subline: entry.path
      })),
      cursor: null,
      indexed: index.complete,
      source: 'index' as const,
      indexSize: index.entries.length,
      indexTruncated: index.truncated
    }
  })

  // Orca reaps a worker after 5 minutes without host traffic, and the MCP server's own HTTP
  // requests never reach the host. A cheap host call keeps the endpoint alive for agents.
  const MCP_HEARTBEAT_MS = 2 * 60_000
  let mcp: { port: number; url: string; close: () => void } | null = null
  let mcpHeartbeat: ReturnType<typeof setInterval> | null = null

  async function enableMcp(): Promise<{ port: number; url: string; configFile: string }> {
    mcp ??= await startMcpServer(fetchLike, currentConnection)
    mcpHeartbeat ??= setInterval(() => void orca.settings.get('serverUrl'), MCP_HEARTBEAT_MS)
    return { port: mcp.port, url: mcp.url, configFile: writeMcpConfigFile(mcp.url) }
  }

  orca.panels.handle('kb.mcp.start', async () => enableMcp())
  orca.panels.handle('kb.mcp.stop', async () => {
    if (mcpHeartbeat) {
      clearInterval(mcpHeartbeat)
      mcpHeartbeat = null
    }
    mcp?.close()
    mcp = null
    return { stopped: true }
  })
  orca.panels.handle('kb.mcp.status', async () =>
    mcp
      ? { running: true, port: mcp.port, url: mcp.url, configFile: mcpConfigFilePath() }
      : { running: false }
  )

  orca.panels.handle('kb.share', async ({ path }) => {
    const connection = requireConnection(await currentConnection())
    if (!connection) {
      throw new NextcloudError('invalid_params', '尚未配置连接，请先保存服务器与凭据')
    }
    return ensureShareLink(fetchLike, connection, path)
  })

  orca.panels.handle('kb.blobChunk', async ({ path, offset, length }) => {
    const connection = requireConnection(await currentConnection())
    if (!connection) {
      throw new NextcloudError('invalid_params', '尚未配置连接，请先保存服务器与凭据')
    }
    const from = Math.max(Math.floor(offset), 0)
    const size = Math.min(Math.max(Math.floor(length), 1), MAX_BLOB_CHUNK_BYTES)
    if (from + size > MAX_BLOB_BYTES) {
      throw new NextcloudError(
        'too_large',
        `文件超过 ${(MAX_BLOB_BYTES / (1024 * 1024)).toFixed(0)} MiB，请在线打开后下载`
      )
    }
    return readBlobChunk(fetchLike, connection, path, from, size)
  })

  orca.panels.handle('kb.mkdir', async ({ path }) => {
    const connection = requireConnection(await currentConnection())
    if (!connection) {
      throw new NextcloudError('invalid_params', '尚未配置连接，请先保存服务器与凭据')
    }
    const result = await createDirectory(fetchLike, connection, path)
    invalidateIndex()
    return result
  })

  orca.panels.handle('kb.delete', async ({ path }) => {
    const connection = requireConnection(await currentConnection())
    if (!connection) {
      throw new NextcloudError('invalid_params', '尚未配置连接，请先保存服务器与凭据')
    }
    const result = await deleteEntry(fetchLike, connection, path)
    invalidateIndex()
    return result
  })

  orca.panels.handle('kb.move', async ({ fromPath, toPath }) => {
    const connection = requireConnection(await currentConnection())
    if (!connection) {
      throw new NextcloudError('invalid_params', '尚未配置连接，请先保存服务器与凭据')
    }
    const result = await moveEntry(fetchLike, connection, fromPath, toPath)
    invalidateIndex()
    return result
  })

  orca.panels.handle('kb.uploadLocal', async ({ localPath, dirPath, name }) => {
    const connection = requireConnection(await currentConnection())
    if (!connection) {
      throw new NextcloudError('invalid_params', '尚未配置连接，请先保存服务器与凭据')
    }
    const cleanName = baseName(name)
    let info
    try {
      info = await stat(localPath)
    } catch {
      throw new NextcloudError('invalid_params', `本地文件不存在：${localPath}`)
    }
    if (!info.isFile()) {
      throw new NextcloudError('invalid_params', '本地路径不是文件')
    }
    if (info.size > MAX_UPLOAD_BYTES) {
      throw new NextcloudError('invalid_params', `文件超过 512 MiB 上传上限（${info.size} 字节）`)
    }
    const bytes = await readFile(localPath)
    const target = `${dirPath.replace(/\/+$/, '')}/${cleanName}`
    const result = await uploadBytes(
      fetchLike,
      connection,
      target,
      bytes,
      contentTypeFor(cleanName)
    )
    invalidateIndex()
    return { ok: true as const, etag: result.etag, size: info.size }
  })

  // Enabled plugins serve MCP without a button press. A second instance may already own the
  // fixed port; its endpoint serves the same URL, so losing the race is harmless. Await so the
  // worker isn't ready before the endpoint is listening and panel status can't race a start.
  await enableMcp().catch(() => undefined)
}
