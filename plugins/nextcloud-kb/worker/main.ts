// The plugin's worker: owns the Nextcloud connection (settings + secret) and answers
// every panel request. HTTP never runs in the panel; the frame's network is closed.

import type { OrcaWorkerApi } from 'orca/worker'
import { readFile, stat } from 'node:fs/promises'
import {
  createDirectory,
  createShareLink,
  deleteEntry,
  listDirectory,
  moveEntry,
  NextcloudError,
  normalizeServerUrl,
  readFile as readDavFile,
  readRange,
  searchFiles,
  uploadBytes,
  whoAmI,
  writeFile,
  type FetchLike,
  type NextcloudConnection
} from './nextcloud.ts'

const fetchLike: FetchLike = (url, init) => fetch(url, init)

const MAX_READ_BYTES = 512 * 1024
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024

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
  const clean = name.replace(/\/+$/, '').split('/').pop() ?? ''
  if (clean === '' || clean === '.' || clean === '..' || clean.includes('/')) {
    throw new NextcloudError('invalid_params', '名称不合法')
  }
  return clean
}

function contentTypeFor(name: string): string {
  const dot = name.toLowerCase().lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot) : ''
  return UPLOAD_CONTENT_TYPES[ext] ?? 'application/octet-stream'
}

function requireConnection(
  connection: NextcloudConnection | null
): NextcloudConnection | null {
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

  orca.panels.handle('kb.status', async () => {
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
    async ({ serverUrl, username, appPassword }): Promise<{ ok: true; displayName: string | null }> => {
      const candidate: NextcloudConnection = {
        serverUrl: normalizeServerUrl(serverUrl),
        username: username.trim(),
        appPassword
      }
      if (!/^https?:\/\/[^/]+/i.test(candidate.serverUrl)) {
        throw new NextcloudError('invalid_params', '服务器地址不合法，例如 http://192.168.1.10:18100')
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

  orca.panels.handle('kb.search', async ({ term, cursor }) => {
    const connection = requireConnection(await currentConnection())
    if (!connection) {
      throw new NextcloudError('invalid_params', '尚未配置连接，请先保存服务器与凭据')
    }
    return searchFiles(fetchLike, connection, term, cursor)
  })

  orca.panels.handle('kb.read', async ({ path, maxBytes }) => {
    const connection = requireConnection(await currentConnection())
    if (!connection) {
      throw new NextcloudError('invalid_params', '尚未配置连接，请先保存服务器与凭据')
    }
    const capped = Math.min(Math.max(Math.floor(maxBytes), 1024), MAX_READ_BYTES)
    return readDavFile(fetchLike, connection, path, capped)
  })

  orca.panels.handle('kb.write', async ({ path, text, etag }) => {
    const connection = requireConnection(await currentConnection())
    if (!connection) {
      throw new NextcloudError('invalid_params', '尚未配置连接，请先保存服务器与凭据')
    }
    const result = await writeFile(fetchLike, connection, path, text, etag)
    return { ok: true as const, etag: result.etag }
  })
  orca.panels.handle('kb.share', async ({ path }) => {
    const connection = requireConnection(await currentConnection())
    if (!connection) {
      throw new NextcloudError('invalid_params', '尚未配置连接，请先保存服务器与凭据')
    }
    return createShareLink(fetchLike, connection, path)
  })

  orca.panels.handle('kb.mkdir', async ({ path }) => {
    const connection = requireConnection(await currentConnection())
    if (!connection) {
      throw new NextcloudError('invalid_params', '尚未配置连接，请先保存服务器与凭据')
    }
    return createDirectory(fetchLike, connection, path)
  })

  orca.panels.handle('kb.delete', async ({ path }) => {
    const connection = requireConnection(await currentConnection())
    if (!connection) {
      throw new NextcloudError('invalid_params', '尚未配置连接，请先保存服务器与凭据')
    }
    return deleteEntry(fetchLike, connection, path)
  })

  orca.panels.handle('kb.move', async ({ fromPath, toPath }) => {
    const connection = requireConnection(await currentConnection())
    if (!connection) {
      throw new NextcloudError('invalid_params', '尚未配置连接，请先保存服务器与凭据')
    }
    return moveEntry(fetchLike, connection, fromPath, toPath)
  })

  orca.panels.handle('kb.range', async ({ path, offset, length }) => {
    const connection = requireConnection(await currentConnection())
    if (!connection) {
      throw new NextcloudError('invalid_params', '尚未配置连接，请先保存服务器与凭据')
    }
    return readRange(fetchLike, connection, path, offset, length)
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
    const result = await uploadBytes(fetchLike, connection, target, bytes, contentTypeFor(cleanName))
    return { ok: true as const, etag: result.etag, size: info.size }
  })
}
