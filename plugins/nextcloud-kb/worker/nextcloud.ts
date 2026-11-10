/* eslint-disable max-lines -- Why: the whole dependency-free WebDAV/OCS client is one module so tests stub one surface */
// Pure Nextcloud WebDAV/OCS client: every function takes a connection and fetch,
// so tests stub `fetch` and nothing here touches Orca APIs.

import type { KbEntry, KbSearchEntry } from '../src/protocol'

export type NextcloudConnection = {
  serverUrl: string
  username: string
  appPassword: string
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export function normalizeServerUrl(raw: string): string {
  let url = raw.trim()
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`
  }
  url = url.replace(/\/+$/, '')
  return url
}

export function encodeDavPath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .map((segment) => segment.replace(/%2F/gi, '%252F'))
    .join('/')
}

function davFileUrl(connection: NextcloudConnection, path: string): string {
  const encoded = encodeDavPath(path)
  if (encoded === '') {
    return `${connection.serverUrl}/remote.php/dav/files/${encodeURIComponent(connection.username)}/`
  }
  return `${connection.serverUrl}/remote.php/dav/files/${encodeURIComponent(connection.username)}/${encoded}`
}

function authHeader(connection: NextcloudConnection): string {
  const bytes = new TextEncoder().encode(`${connection.username}:${connection.appPassword}`)
  let binary = ''
  const CHUNK = 0x8000
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK))
  }
  return `Basic ${btoa(binary)}`
}

export class NextcloudError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const PROPFIND_BODY =
  '<?xml version="1.0"?>' +
  '<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">' +
  '<d:prop>' +
  '<d:resourcetype/><d:getlastmodified/><d:getcontentlength/><d:getcontenttype/>' +
  '<d:getetag/><oc:fileid/><nc:has-preview/>' +
  '</d:prop>' +
  '</d:propfind>'

async function davFetch(
  fetchLike: FetchLike,
  connection: NextcloudConnection,
  url: string,
  init: RequestInit,
  /** Statuses the caller inspects itself; davFetch hands them back instead of throwing. */
  passThroughStatuses: readonly number[] = []
): Promise<Response> {
  const response = await fetchLike(url, {
    ...init,
    headers: { ...init.headers, Authorization: authHeader(connection) }
  })
  if (response.status === 401) {
    throw new NextcloudError('invalid_params', '认证失败：请检查用户名与应用密码')
  }
  if (response.status === 404) {
    throw new NextcloudError('not_found', '文件或目录不存在')
  }
  if (!response.ok && !passThroughStatuses.includes(response.status)) {
    throw new NextcloudError(
      'action_failed',
      `Nextcloud 返回 ${response.status} ${response.statusText}`
    )
  }
  return response
}

/** Decode a percent-encoded DAV href to a '/a/b' path relative to the user's files root. */
function hrefToPath(href: string, username: string): string | null {
  const marker = `/remote.php/dav/files/${encodeURIComponent(username)}/`
  const index = href.indexOf(marker)
  const tail = index !== -1 ? href.slice(index + marker.length) : ''
  if (index === -1) {
    const rootMarker = `/remote.php/dav/files/${encodeURIComponent(username)}`
    if (href.startsWith(rootMarker)) {
      return '/'
    }
    return null
  }
  const decoded = tail
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment))
    .join('/')
  return `/${decoded}`
}

const XML_ENTITIES: Record<string, string> = {
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'"
}

function xmlDecode(value: string): string {
  return value.replace(/&(quot|amp|lt|gt|apos|#\d+|#x[0-9a-fA-F]+);/g, (match, entity: string) => {
    if (entity in XML_ENTITIES) {
      return XML_ENTITIES[entity]
    }
    if (entity.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10))
    }
    return match
  })
}

function textBetween(xml: string, tag: string): string | null {
  const match = new RegExp(
    `<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`
  ).exec(xml)
  if (!match) {
    return null
  }
  return xmlDecode(match[1]).trim()
}

function parseIsoMs(value: string | null): number | null {
  if (!value) {
    return null
  }
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

/** Parse a PROPFIND multistatus body into entries, excluding the requested directory itself. */
export function parsePropfindBody(xml: string, username: string, selfPath: string): KbEntry[] {
  const entries: KbEntry[] = []
  const responseBlocks = xml.split(/<\/(?:[\w-]+:)?response>/)
  for (const block of responseBlocks) {
    const hrefMatch = /<(?:[\w-]+:)?href(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?href>/.exec(block)
    if (!hrefMatch) {
      continue
    }
    const path = hrefToPath(hrefMatch[1], username)
    if (path === null || path === selfPath) {
      continue
    }
    const name = path.slice(path.lastIndexOf('/') + 1)
    if (name.length === 0) {
      continue
    }
    const isCollection = /<(?:[\w-]+:)?collection(?:\s[^>]*)?\/?>/.test(block)
    const sizeText = textBetween(block, 'getcontentlength')
    entries.push({
      name,
      path: isCollection && !path.endsWith('/') ? path : path.replace(/\/+$/, ''),
      dir: isCollection,
      size: sizeText !== null && /^\d+$/.test(sizeText) ? Number(sizeText) : 0,
      modifiedMs: parseIsoMs(textBetween(block, 'getlastmodified')),
      etag: stripEtagQuotes(textBetween(block, 'getetag')),
      fileId: textBetween(block, 'fileid')
    })
  }
  entries.sort((a, b) =>
    a.dir === b.dir ? a.name.localeCompare(b.name, 'zh-Hans-CN') : a.dir ? -1 : 1
  )
  return entries
}

function stripEtagQuotes(etag: string | null): string | null {
  if (etag === null) {
    return null
  }
  return etag.replace(/^"|"$/g, '')
}

export async function listDirectory(
  fetchLike: FetchLike,
  connection: NextcloudConnection,
  path: string
): Promise<KbEntry[]> {
  const selfPath = path.replace(/\/+$/, '') || '/'
  const response = await davFetch(fetchLike, connection, davFileUrl(connection, selfPath), {
    method: 'PROPFIND',
    headers: { Depth: '1', 'Content-Type': 'application/xml' },
    body: PROPFIND_BODY
  })
  return parsePropfindBody(await response.text(), connection.username, selfPath)
}

export async function whoAmI(
  fetchLike: FetchLike,
  connection: NextcloudConnection
): Promise<{ id: string; displayName: string | null }> {
  const response = await fetchLike(`${connection.serverUrl}/ocs/v2.php/cloud/user?format=json`, {
    headers: {
      Authorization: authHeader(connection),
      'OCS-APIRequest': 'true',
      Accept: 'application/json'
    }
  })
  if (response.status === 401) {
    throw new NextcloudError('invalid_params', '认证失败：请检查用户名与应用密码')
  }
  if (!response.ok) {
    throw new NextcloudError(
      'action_failed',
      `Nextcloud 返回 ${response.status} ${response.statusText}`
    )
  }
  const payload = (await response.json()) as {
    ocs?: { data?: { id?: string; 'display-name'?: string } }
  }
  const data = payload.ocs?.data
  if (!data?.id) {
    throw new NextcloudError('action_failed', '无法读取用户信息：响应缺少 ocs.data.id')
  }
  return { id: data.id, displayName: data['display-name'] ?? null }
}

type OcsSearchPayload = {
  ocs?: {
    data?: {
      entries?: {
        title?: string
        subline?: string
        attributes?: { fileId?: string; path?: string; dir?: boolean }
      }[]
    }
  }
}

/** Parse a `Link: <...>; rel="next"` header's cursor out of a search response. */
export function parseSearchCursor(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null
  }
  for (const part of linkHeader.split(',')) {
    if (!/rel="next"/.test(part)) {
      continue
    }
    const match = /[?&]cursor=([^&>]+)/.exec(part)
    if (match) {
      return decodeURIComponent(match[1])
    }
  }
  return null
}

export function parseSearchPayload(payload: unknown): KbSearchEntry[] {
  const entries = (payload as OcsSearchPayload)?.ocs?.data?.entries ?? []
  const mapped: KbSearchEntry[] = []
  for (const entry of entries) {
    const title = entry.title
    if (typeof title !== 'string' || title.length === 0) {
      continue
    }
    const rawPath = entry.attributes?.path
    const path = typeof rawPath === 'string' ? rawPath : ''
    mapped.push({
      name: title,
      path,
      dir: entry.attributes?.dir === true,
      subline: entry.subline ?? ''
    })
  }
  return mapped
}

export async function searchFiles(
  fetchLike: FetchLike,
  connection: NextcloudConnection,
  term: string,
  cursor: string | null
): Promise<{ entries: KbSearchEntry[]; cursor: string | null }> {
  const params = new URLSearchParams({ term })
  if (cursor !== null) {
    params.set('cursor', cursor)
  }
  const response = await fetchLike(
    `${connection.serverUrl}/ocs/v2.php/search/providers/files/search?${params.toString()}`,
    {
      headers: {
        Authorization: authHeader(connection),
        'OCS-APIRequest': 'true',
        Accept: 'application/json'
      }
    }
  )
  if (response.status === 401) {
    throw new NextcloudError('invalid_params', '认证失败：请检查用户名与应用密码')
  }
  if (!response.ok) {
    throw new NextcloudError(
      'action_failed',
      `Nextcloud 返回 ${response.status} ${response.statusText}`
    )
  }
  return {
    entries: parseSearchPayload(await response.json()),
    cursor: parseSearchCursor(response.headers.get('link'))
  }
}

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.log',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.vue',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cs',
  '.php',
  '.sh',
  '.bash',
  '.zsh',
  '.sql',
  '.xml',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.gitignore',
  '.env',
  '.properties',
  '.conf'
])

export function isTextPath(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  if (name.startsWith('.') && !name.includes('.', 1)) {
    return true
  }
  const dot = name.lastIndexOf('.')
  return dot !== -1 && TEXT_EXTENSIONS.has(name.slice(dot))
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

export async function readFile(
  fetchLike: FetchLike,
  connection: NextcloudConnection,
  path: string,
  maxBytes: number
): Promise<
  | {
      kind: 'text'
      text: string
      truncated: boolean
      byteLength: number
      etag: string | null
      modifiedMs: number | null
    }
  | {
      kind: 'binary'
      byteLength: number
      contentType: string | null
      etag: string | null
      modifiedMs: number | null
    }
> {
  const response = await davFetch(fetchLike, connection, davFileUrl(connection, path), {
    method: 'GET'
  })
  const bytes = new Uint8Array(await response.arrayBuffer())
  const etag = stripEtagQuotes(response.headers.get('oc-etag') ?? response.headers.get('etag'))
  const modifiedMs = parseIsoMs(response.headers.get('last-modified'))
  if (!isTextPath(path) && response.headers.get('content-type')?.startsWith('text/') !== true) {
    return {
      kind: 'binary',
      byteLength: bytes.byteLength,
      contentType: response.headers.get('content-type'),
      etag,
      modifiedMs
    }
  }
  const slice = bytes.subarray(0, maxBytes)
  return {
    kind: 'text',
    text: decodeUtf8(slice),
    truncated: bytes.byteLength > maxBytes,
    byteLength: bytes.byteLength,
    etag,
    modifiedMs
  }
}

export async function writeFile(
  fetchLike: FetchLike,
  connection: NextcloudConnection,
  path: string,
  text: string,
  etag: string | null
): Promise<{ etag: string | null }> {
  const headers: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8' }
  if (etag !== null) {
    headers['If-Match'] = `"${etag}"`
  }
  const response = await fetchLike(davFileUrl(connection, path), {
    method: 'PUT',
    headers: { ...headers, Authorization: authHeader(connection) },
    body: text
  })
  if (response.status === 412) {
    throw new NextcloudError('conflict', '文件已在服务器上被修改，请重新加载后再保存')
  }
  if (response.status === 401) {
    throw new NextcloudError('invalid_params', '认证失败：请检查用户名与应用密码')
  }
  if (response.status === 404) {
    throw new NextcloudError('not_found', '文件不存在（父目录可能已被删除）')
  }
  if (!response.ok) {
    throw new NextcloudError(
      'action_failed',
      `Nextcloud 返回 ${response.status} ${response.statusText}`
    )
  }
  return {
    etag: stripEtagQuotes(response.headers.get('oc-etag') ?? response.headers.get('etag'))
  }
}

type OcsShare = { url?: string; token?: string; share_type?: number | string }

function shareUrlOf(share: OcsShare): string | null {
  return typeof share.url === 'string' && share.url !== '' ? share.url : null
}

/** Create a public link share (shareType 3); resolves the visit URL from OCS JSON. */
export async function createShareLink(
  fetchLike: FetchLike,
  connection: NextcloudConnection,
  path: string
): Promise<{ url: string; reused: boolean }> {
  const response = await fetchLike(
    `${connection.serverUrl}/ocs/v2.php/apps/files_sharing/api/v1/shares`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader(connection),
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ path, shareType: '3' }).toString()
    }
  )
  if (response.status === 401) {
    throw new NextcloudError('invalid_params', '认证失败：请检查用户名与应用密码')
  }
  if (!response.ok) {
    throw new NextcloudError('action_failed', `创建分享失败：Nextcloud 返回 ${response.status}`)
  }
  const payload: { ocs?: { meta?: { status?: string }; data?: OcsShare } } = await response.json()
  const url = shareUrlOf(payload.ocs?.data ?? {})
  if (url === null) {
    throw new NextcloudError('action_failed', '创建分享失败：响应缺少 ocs.data.url')
  }
  return { url, reused: false }
}

/** Reuse the person's own public share for `path` when one exists, so previews never mint duplicates. */
export async function ensureShareLink(
  fetchLike: FetchLike,
  connection: NextcloudConnection,
  path: string
): Promise<{ url: string; reused: boolean }> {
  const params = new URLSearchParams({ path, shared_with_me: 'false' })
  const list = await fetchLike(
    `${connection.serverUrl}/ocs/v2.php/apps/files_sharing/api/v1/shares?${params.toString()}`,
    {
      headers: {
        Authorization: authHeader(connection),
        'OCS-APIRequest': 'true',
        Accept: 'application/json'
      }
    }
  )
  if (list.status === 401) {
    throw new NextcloudError('invalid_params', '认证失败：请检查用户名与应用密码')
  }
  if (!list.ok) {
    return createShareLink(fetchLike, connection, path)
  }
  const payload: { ocs?: { data?: OcsShare[] | OcsShare } } = await list.json()
  const shares = Array.isArray(payload.ocs?.data) ? payload.ocs.data : []
  const existing = shares.find((share) => Number(share.share_type ?? -1) === 3)
  const url = existing ? shareUrlOf(existing) : null
  if (url !== null) {
    return { url, reused: true }
  }
  return createShareLink(fetchLike, connection, path)
}

export async function createDirectory(
  fetchLike: FetchLike,
  connection: NextcloudConnection,
  path: string
): Promise<{ ok: true }> {
  const response = await davFetch(
    fetchLike,
    connection,
    davFileUrl(connection, path),
    {
      method: 'MKCOL'
    },
    [405]
  )
  if (response.status === 405) {
    throw new NextcloudError('conflict', '同名文件或目录已存在')
  }
  if (!response.ok) {
    throw new NextcloudError('action_failed', `创建目录失败：Nextcloud 返回 ${response.status}`)
  }
  return { ok: true }
}

export async function deleteEntry(
  fetchLike: FetchLike,
  connection: NextcloudConnection,
  path: string
): Promise<{ ok: true }> {
  const response = await davFetch(
    fetchLike,
    connection,
    davFileUrl(connection, path),
    {
      method: 'DELETE'
    },
    [423]
  )
  if (response.status === 423) {
    throw new NextcloudError('conflict', '文件被锁定，无法删除')
  }
  if (!response.ok) {
    throw new NextcloudError('action_failed', `删除失败：Nextcloud 返回 ${response.status}`)
  }
  return { ok: true }
}

export async function moveEntry(
  fetchLike: FetchLike,
  connection: NextcloudConnection,
  fromPath: string,
  toPath: string
): Promise<{ ok: true }> {
  const response = await davFetch(
    fetchLike,
    connection,
    davFileUrl(connection, fromPath),
    {
      method: 'MOVE',
      headers: { Destination: davFileUrl(connection, toPath) }
    },
    [412]
  )
  if (response.status === 412) {
    throw new NextcloudError('conflict', '目标已存在，未移动')
  }
  if (!response.ok) {
    throw new NextcloudError('action_failed', `移动失败：Nextcloud 返回 ${response.status}`)
  }
  return { ok: true }
}

const BASE64_CHUNK = 0x8000

/** Small spreads: V8 throws "Maximum call stack size exceeded" past ~100k arguments. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + BASE64_CHUNK))
  }
  return btoa(binary)
}

export type BlobChunk = {
  base64: string
  byteLength: number
  total: number | null
  done: boolean
  etag: string | null
}

/** One Range GET, kept below the host's 1 MiB worker-response cap. */
export async function readBlobChunk(
  fetchLike: FetchLike,
  connection: NextcloudConnection,
  path: string,
  offset: number,
  length: number
): Promise<BlobChunk> {
  const response = await davFetch(
    fetchLike,
    connection,
    davFileUrl(connection, path),
    { method: 'GET', headers: { Range: `bytes=${offset}-${offset + length - 1}` } },
    [416]
  )
  if (response.status === 416) {
    return { base64: '', byteLength: 0, total: null, done: true, etag: null }
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (response.status === 200 && bytes.byteLength > length) {
    throw new NextcloudError('action_failed', '服务器忽略了分段请求，无法下载此文件')
  }
  const totalText = response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1]
  const total = totalText !== undefined ? Number(totalText) : null
  const done = total !== null ? offset + bytes.byteLength >= total : bytes.byteLength < length
  return {
    base64: bytesToBase64(bytes),
    byteLength: bytes.byteLength,
    total,
    done,
    etag: stripEtagQuotes(response.headers.get('oc-etag') ?? response.headers.get('etag'))
  }
}

export async function uploadBytes(
  fetchLike: FetchLike,
  connection: NextcloudConnection,
  path: string,
  bytes: Uint8Array,
  contentType: string
): Promise<{ etag: string | null }> {
  const response = await fetchLike(davFileUrl(connection, path), {
    method: 'PUT',
    headers: {
      Authorization: authHeader(connection),
      'Content-Type': contentType
    },
    body: bytes.slice().buffer
  })
  if (response.status === 412) {
    throw new NextcloudError('conflict', '目标已存在且被修改，未上传')
  }
  if (!response.ok) {
    throw new NextcloudError('action_failed', `上传失败：Nextcloud 返回 ${response.status}`)
  }
  return {
    etag: stripEtagQuotes(response.headers.get('oc-etag') ?? response.headers.get('etag'))
  }
}

export type NameIndexLimits = {
  maxDirs: number
  maxEntries: number
  deadlineMs: number
  /** PROPFINDs in flight at once. */
  concurrency: number
}

export const NAME_INDEX_LIMITS: NameIndexLimits = {
  maxDirs: 30_000,
  maxEntries: 200_000,
  deadlineMs: 240_000,
  concurrency: 12
}

export type NameIndexCrawl = {
  /** Grows as directories are walked; search can read it before `done` settles. */
  entries: KbEntry[]
  done: Promise<{ truncated: boolean }>
}

/** Crawl the tree with PROPFIND, exposing partial results while the walk is still running. */
export function crawlNameIndex(
  fetchLike: FetchLike,
  connection: NextcloudConnection,
  limits: NameIndexLimits = NAME_INDEX_LIMITS
): NameIndexCrawl {
  const entries: KbEntry[] = []
  const done = (async (): Promise<{ truncated: boolean }> => {
    const visited = new Set<string>(['/'])
    let queue: string[] = ['/']
    const deadline = Date.now() + limits.deadlineMs
    while (queue.length > 0 && entries.length < limits.maxEntries && Date.now() < deadline) {
      const batch = queue.splice(0, limits.concurrency)
      const levels = await Promise.all(
        batch.map(async (dir) => {
          try {
            return await listDirectory(fetchLike, connection, dir)
          } catch {
            return null
          }
        })
      )
      for (const level of levels) {
        if (level === null) {
          continue
        }
        for (const entry of level) {
          if (entries.length >= limits.maxEntries) {
            break
          }
          entries.push(entry)
          if (entry.dir && visited.size < limits.maxDirs && !visited.has(entry.path)) {
            visited.add(entry.path)
            queue.push(entry.path)
          }
        }
      }
    }
    return { truncated: queue.length > 0 }
  })()
  return { entries, done }
}
