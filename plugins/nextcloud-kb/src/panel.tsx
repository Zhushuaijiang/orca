/* eslint-disable max-lines -- Why: one declarative panel keeps its atoms, handlers and views together; splitting it would hide the panel state machine */
// The knowledge base panel: connect, browse (lazy tree), search, and open/download files.
// All data flows through `plugin.request` to the worker; the frame never touches the network.

import {
  atom,
  read,
  set,
  update,
  files,
  host,
  plugin,
  shell,
  Button,
  Callout,
  Field,
  Heading,
  IconButton,
  Input,
  Link,
  Row,
  Spinner,
  Stack,
  Table,
  Text,
  Tree,
  type IconName,
  type PanelContext,
  type TreeFilesDropEvent
} from 'orca'
import type { KbEntry, KbSearchEntry } from './protocol'

type Status =
  | { phase: 'loading' }
  | { phase: 'unconfigured' }
  | { phase: 'error'; message: string; serverUrl: string; username: string }
  | { phase: 'ready'; serverUrl: string; username: string }

type ConnectForm = {
  serverUrl: string
  username: string
  appPassword: string
  busy: boolean
  error: string | null
}

// `files.saveAs` carries 64 MiB; leave headroom for the base64 envelope.
const BLOB_MAX_BYTES = 45 * 1024 * 1024
const BLOB_CHUNK_BYTES = 512 * 1024
// Persisted atoms share one 640 KiB message; keep the newest folders within an entry budget.
const MAX_CACHED_DIRS = 24
const MAX_CACHED_ENTRIES = 1200

type DirCache = Readonly<Record<string, readonly KbEntry[]>>

/** Newest folder last; older ones are dropped once the folder or entry budget is spent. */
function cacheDir(cache: DirCache, path: string, entries: readonly KbEntry[]): DirCache {
  const older = Object.entries(cache).filter(([key]) => key !== path)
  let total = entries.length
  let from = older.length
  while (from > 0 && older.length - from + 1 < MAX_CACHED_DIRS) {
    const size = older[from - 1]?.[1].length ?? 0
    if (total + size > MAX_CACHED_ENTRIES) {
      break
    }
    total += size
    from -= 1
  }
  const kept: [string, readonly KbEntry[]][] = [...older.slice(from), [path, entries]]
  return Object.fromEntries(kept)
}

// Tab switches recreate the guest; plain-JSON plugin atoms keep the tree on screen without a refetch.
const status = atom<Status>('kb.status-view', { phase: 'loading' }, { persist: 'plugin' })
const dirEntries = atom<DirCache>('kb.dir-entries', {}, { persist: 'plugin' })
const busyDirs = atom<ReadonlySet<string>>(new Set())
const expandedKeys = atom<string[]>('kb.expanded', ['/'], { persist: 'plugin' })
const selectedKey = atom<string | null>('kb.selected', null, { persist: 'plugin' })
const term = atom('kb.search.term', '', { persist: 'plugin' })
const searchResults = atom<KbSearchEntry[]>([])
const searchCursor = atom<string | null>(null)
const searchLoading = atom(false)
const connectForm = atom<ConnectForm>({
  serverUrl: '',
  username: '',
  appPassword: '',
  busy: false,
  error: null
})
const lastError = atom<string | null>(null)
const sharePreparing = atom(false)
const downloading = atom(false)
const downloadHint = atom<string | null>(null)
const shareFallback = atom<{ path: string; url: string } | null>(null)
const mcpState = atom<{ running: boolean; url: string; configFile: string } | null>(null)
const mcpBusy = atom(false)
const searchIndexed = atom(true)
const searchSource = atom<'index' | 'ocs'>('index')
const searchIndexSize = atom(0)
const searchIndexTruncated = atom(false)
const uploadBusy = atom(false)
const uploadDir = atom<string | null>('kb.upload.dir', null, { persist: 'plugin' })
const uploadMessage = atom<string | null>(null)
const mkdirOpen = atom(false)
const mkdirName = atom('')
const mkdirBusy = atom(false)
const pendingDelete = atom<string | null>(null)
const deleteBusy = atom(false)
const renameOpen = atom(false)
const renameValue = atom('')
const renameBusy = atom(false)

// The save dialog must run inside a one-shot press grant (a few seconds), so file
// bytes are prefetched while the person aims and the 下载 press only writes them out.
let blobCache: { path: string; data: ArrayBuffer } | null = null
let blobPrefetch: { path: string; promise: Promise<void> } | null = null
// The share link is also prefetched: 在线打开 then opens the browser with no round trip.
let shareCache: { path: string; url: string } | null = null
let sharePrefetch: { path: string; promise: Promise<void> } | null = null

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parentPath(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const index = trimmed.lastIndexOf('/')
  return index <= 0 ? '/' : trimmed.slice(0, index)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function hostOf(serverUrl: string): string {
  return /^https?:\/\/([^/]+)/i.exec(serverUrl)?.[1] ?? serverUrl
}

function depthOf(path: string): number {
  return path === '/' ? 0 : path.split('/').filter(Boolean).length
}

/** Persisted-expanded folders have no toggle event on mount; load them parent-first. */
async function hydrateExpanded(): Promise<void> {
  const keys = [...read(expandedKeys)].sort((a, b) => depthOf(a) - depthOf(b))
  for (const key of keys) {
    if (Object.hasOwn(read(dirEntries), key)) {
      continue
    }
    await loadDir(key)
  }
}

async function refreshStatus(refreshIndex = false): Promise<void> {
  set(status, { phase: 'loading' })
  try {
    const result = await plugin.request('kb.status', { refreshIndex })
    if (!result.configured) {
      set(status, { phase: 'unconfigured' })
      return
    }
    if (result.ok) {
      set(status, { phase: 'ready', serverUrl: result.serverUrl, username: result.username })
      void hydrateExpanded()
    } else {
      set(status, {
        phase: 'error',
        message: result.error ?? '连接失败',
        serverUrl: result.serverUrl,
        username: result.username
      })
    }
  } catch (error) {
    set(status, { phase: 'error', message: errorMessage(error), serverUrl: '', username: '' })
  }
}

async function loadDir(path: string): Promise<void> {
  update(busyDirs, (dirs) => new Set(dirs).add(path))
  try {
    const { entries } = await plugin.request('kb.list', { path })
    update(dirEntries, (cache) => cacheDir(cache, path, entries))
  } catch (error) {
    set(lastError, `读取 ${path} 失败：${errorMessage(error)}`)
  } finally {
    update(busyDirs, (dirs) => {
      const next = new Set(dirs)
      next.delete(path)
      return next
    })
  }
}

function startBlobPrefetch(entry: KbEntry): void {
  if (entry.dir || entry.size > BLOB_MAX_BYTES) {
    return
  }
  const request: { path: string; promise: Promise<void> } = {
    path: entry.path,
    promise: Promise.resolve()
  }
  request.promise = (async () => {
    try {
      const chunks: string[] = []
      let offset = 0
      for (;;) {
        const chunk = await plugin.request('kb.blobChunk', {
          path: entry.path,
          offset,
          length: BLOB_CHUNK_BYTES
        })
        if (blobPrefetch !== request) {
          return
        }
        if (chunk.byteLength === 0) {
          break
        }
        chunks.push(chunk.base64)
        offset += chunk.byteLength
        if (chunk.done || (chunk.total !== null && offset >= chunk.total)) {
          break
        }
      }
      // Decode while there is no press to race: 下载 then hands bytes straight to the save dialog.
      const data = await decodeBlob(chunks.join(''))
      if (blobPrefetch === request) {
        blobCache = { path: entry.path, data }
      }
    } catch {
      // A failed prefetch must be restartable by the next 下载 press.
      if (blobPrefetch === request) {
        blobPrefetch = null
      }
    }
  })()
  blobPrefetch = request
}

function startSharePrefetch(entry: KbEntry): void {
  const request: { path: string; promise: Promise<void> } = {
    path: entry.path,
    promise: Promise.resolve()
  }
  request.promise = (async () => {
    try {
      const { url } = await plugin.request('kb.share', { path: entry.path })
      if (sharePrefetch === request) {
        shareCache = { path: entry.path, url }
      }
    } catch {
      if (sharePrefetch === request) {
        sharePrefetch = null
      }
    }
  })()
  sharePrefetch = request
}

/** Reuse-or-fetch the public share URL; null when the server refuses or the fetch failed. */
async function ensureShare(entry: KbEntry): Promise<string | null> {
  if (shareCache?.path === entry.path) {
    return shareCache.url
  }
  set(sharePreparing, true)
  try {
    if (sharePrefetch?.path === entry.path) {
      await sharePrefetch.promise
    } else {
      startSharePrefetch(entry)
      await sharePrefetch?.promise
    }
  } finally {
    set(sharePreparing, false)
  }
  return shareCache?.path === entry.path ? shareCache.url : null
}

async function decodeBlob(base64: string): Promise<ArrayBuffer> {
  // No network in the hidden guest; decode here during the prefetch, away from the press grant.
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
let indexPollTimer: ReturnType<typeof setTimeout> | null = null

function stopIndexPoll(): void {
  if (indexPollTimer !== null) {
    clearTimeout(indexPollTimer)
    indexPollTimer = null
  }
}

function onSearchChange(value: string): void {
  set(term, value)
  stopIndexPoll()
  if (searchTimer !== null) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  if (value.trim() === '') {
    set(searchResults, [])
    set(searchCursor, null)
    return
  }
  const query = value.trim()
  // Local index filtering is one fast round trip; keep typing responsive.
  searchTimer = setTimeout(() => {
    void runSearch(query, null, true)
  }, 120)
}

async function runSearch(query: string, cursor: string | null, reset: boolean): Promise<void> {
  set(searchLoading, true)
  try {
    const result = await plugin.request('kb.search', { term: query, cursor })
    if (read(term).trim() !== query) {
      return
    }
    set(searchResults, reset ? result.entries : [...read(searchResults), ...result.entries])
    set(searchCursor, result.cursor)
    set(searchIndexed, result.indexed)
    set(searchSource, result.source)
    set(searchIndexSize, result.indexSize)
    set(searchIndexTruncated, result.indexTruncated)
    stopIndexPoll()
    if (!result.indexed && reset) {
      // The crawl keeps filling in the background; re-filter the same query until it completes.
      indexPollTimer = setTimeout(() => {
        indexPollTimer = null
        if (read(term).trim() === query) {
          void runSearch(query, null, true)
        }
      }, 1500)
    }
  } catch (error) {
    set(lastError, `搜索失败：${errorMessage(error)}`)
  } finally {
    set(searchLoading, false)
  }
}

function findEntry(path: string): KbEntry | null {
  const entries = read(dirEntries)[parentPath(path)]
  return entries?.find((entry) => entry.path === path) ?? null
}

async function revealPath(target: KbSearchEntry): Promise<void> {
  const filePath = target.dir ? null : target.path
  if (filePath === null || target.path === '') {
    // A folder (or an entry without a path): browse it with its parent loaded.
    const dir = target.path === '' ? '/' : parentPath(target.path)
    if (!Object.hasOwn(read(dirEntries), dir)) {
      await loadDir(dir)
    }
    set(selectedKey, target.path === '' ? '/' : target.path)
    return
  }
  const ancestors: string[] = []
  let current = parentPath(filePath)
  while (current !== '/') {
    ancestors.unshift(current)
    current = parentPath(current)
  }
  for (const ancestor of ['/'].concat(ancestors)) {
    if (!Object.hasOwn(read(dirEntries), ancestor)) {
      await loadDir(ancestor)
    }
  }
  update(expandedKeys, (keys) => [...new Set([...keys, ...ancestors])])
  const entry = findEntry(filePath)
  if (entry) {
    await openEntryOnline(entry)
  } else {
    set(lastError, `找不到 ${target.path}（可能已被移动或删除）`)
  }
}

async function connect(): Promise<void> {
  const form = read(connectForm)
  update(connectForm, (state) => ({ ...state, busy: true, error: null }))
  try {
    await plugin.request('kb.connect', {
      serverUrl: form.serverUrl,
      username: form.username,
      appPassword: form.appPassword
    })
    set(connectForm, { serverUrl: '', username: '', appPassword: '', busy: false, error: null })
    set(dirEntries, {})
    set(expandedKeys, ['/'])
    await refreshStatus()
  } catch (error) {
    update(connectForm, (state) => ({ ...state, busy: false, error: errorMessage(error) }))
  }
}

/** Works for any entry: the tree's action bar and search results share it. */
async function downloadEntry(entry: KbEntry): Promise<void> {
  if (entry.dir || read(downloading)) {
    return
  }
  if (entry.size > BLOB_MAX_BYTES) {
    set(downloadHint, '文件超过 45 MB，请在线打开后在浏览器下载。')
    return
  }
  if (blobCache?.path !== entry.path) {
    set(downloadHint, null)
    set(downloading, true)
    if (blobPrefetch?.path === entry.path) {
      await blobPrefetch.promise
    } else {
      startBlobPrefetch(entry)
      await blobPrefetch?.promise
    }
    set(downloading, false)
    if (blobCache?.path !== entry.path) {
      set(downloadHint, '文件尚未就绪，请再次点击「下载」。')
      return
    }
  }
  const cached = blobCache
  try {
    await files.saveAs({
      suggestedName: entry.name,
      mimeType: mimeFor(entry.name),
      data: cached.data
    })
    set(downloadHint, null)
  } catch (error) {
    set(lastError, `下载失败：${errorMessage(error)}（文件已就绪，可再次点击「下载」重试）`)
  }
}

function mimeFor(name: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase()
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'pdf':
      return 'application/pdf'
    case 'zip':
      return 'application/zip'
    case 'md':
      return 'text/markdown'
    default:
      return 'application/octet-stream'
  }
}

const MAX_UPLOAD_FILES = 64

function baseNameOf(localPath: string): string {
  const trimmed = localPath.replace(/[\\/]+$/, '')
  return trimmed.slice(Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\')) + 1)
}

function targetDirFor(item: string | null): string {
  if (item === null || item === '/') {
    return '/'
  }
  const entry = findEntry(item)
  return entry ? (entry.dir ? entry.path : parentPath(entry.path)) : '/'
}

async function uploadPaths(
  paths: readonly string[],
  names: readonly string[] | null,
  dirPath: string
): Promise<void> {
  const batch = paths.slice(0, MAX_UPLOAD_FILES)
  if (read(uploadBusy) || batch.length === 0) {
    return
  }
  set(uploadBusy, true)
  set(uploadMessage, null)
  let uploaded = 0
  const failures: string[] = []
  try {
    for (let index = 0; index < batch.length; index += 1) {
      const localPath = batch[index]
      const name = names?.[index] || baseNameOf(localPath)
      if (!localPath || name === '') {
        failures.push(`第 ${index + 1} 个文件路径不合法`)
        continue
      }
      set(uploadMessage, `正在上传 ${index + 1}/${batch.length}：${name}`)
      try {
        await plugin.request('kb.uploadLocal', { localPath, dirPath, name })
        uploaded += 1
      } catch (error) {
        failures.push(`${name}：${errorMessage(error)}`)
      }
    }
    const destination = dirPath === '/' ? '根目录' : dirPath
    const failureNote = failures.length > 0 ? `；失败：${failures.slice(0, 3).join('；')}` : ''
    set(uploadMessage, `已上传 ${uploaded}/${batch.length} 个文件到 ${destination}${failureNote}`)
    void loadDir(dirPath)
  } finally {
    set(uploadBusy, false)
  }
}

function chosenPaths(result: unknown): string[] {
  if (
    typeof result !== 'object' ||
    result === null ||
    !('status' in result) ||
    !('paths' in result) ||
    result.status !== 'picked' ||
    !Array.isArray(result.paths)
  ) {
    return []
  }
  return result.paths.filter((path): path is string => typeof path === 'string' && path !== '')
}

async function pickFilesTo(dirPath: string): Promise<void> {
  if (read(uploadBusy)) {
    return
  }
  if (!host.has('files.pick')) {
    set(uploadMessage, '当前 Orca 不支持系统文件选择，请升级 Orca 后再上传。')
    return
  }
  // The chooser needs the press grant; host.call survives a guest runtime older than files.pick.
  let paths: string[]
  try {
    paths = chosenPaths(await host.call('files.pick', { multiple: true }))
  } catch (error) {
    set(uploadMessage, `选择文件失败，请再次右键上传：${errorMessage(error)}`)
    return
  }
  if (paths.length === 0) {
    return
  }
  await uploadPaths(paths, null, dirPath)
}

function onTreeFilesDrop(event: TreeFilesDropEvent): void {
  const dirPath = targetDirFor(event.item)
  void uploadPaths(
    event.files.map((file) => file.path),
    event.files.map((file) => file.name),
    dirPath
  )
}

function joinPath(dir: string, name: string): string {
  const clean = name.trim()
  return `${dir.replace(/\/+$/, '')}/${clean}`
}

async function createFolder(): Promise<void> {
  const name = read(mkdirName).trim()
  if (name === '' || name.includes('/') || read(mkdirBusy)) {
    return
  }
  const parent = read(uploadDir) ?? '/'
  const target = joinPath(parent, name)
  set(mkdirBusy, true)
  try {
    await plugin.request('kb.mkdir', { path: target })
    set(mkdirOpen, false)
    set(mkdirName, '')
    // A folder made under a collapsed row would be invisible until the person expands it.
    update(expandedKeys, (keys) => [...new Set([...keys, parent])])
    set(selectedKey, target)
    set(uploadDir, target)
    void loadDir(parent)
  } catch (error) {
    set(lastError, `新建文件夹失败：${errorMessage(error)}`)
  } finally {
    set(mkdirBusy, false)
  }
}

async function deleteSelected(): Promise<void> {
  const target = read(pendingDelete)
  if (target === null || read(deleteBusy)) {
    return
  }
  set(deleteBusy, true)
  try {
    await plugin.request('kb.delete', { path: target })
    set(pendingDelete, null)
    if (read(selectedKey) === target) {
      set(selectedKey, null)
    }
    void loadDir(parentPath(target))
  } catch (error) {
    set(lastError, `删除失败：${errorMessage(error)}`)
  } finally {
    set(deleteBusy, false)
  }
}

async function renameSelected(): Promise<void> {
  const target = read(selectedKey)
  if (target === null || target === '/') {
    return
  }
  const entry = findEntry(target)
  const name = read(renameValue).trim()
  if (entry === null || name === '' || name.includes('/') || read(renameBusy)) {
    return
  }
  if (name === entry.name) {
    set(renameOpen, false)
    return
  }
  const toPath = joinPath(parentPath(target), name)
  const wasSelected = read(selectedKey) === target
  set(renameBusy, true)
  try {
    await plugin.request('kb.move', { fromPath: target, toPath })
    set(renameOpen, false)
    set(renameValue, '')
    if (wasSelected) {
      set(selectedKey, toPath)
    }
    void loadDir(parentPath(toPath))
  } catch (error) {
    set(lastError, `重命名失败：${errorMessage(error)}`)
  } finally {
    set(renameBusy, false)
  }
}

export function setup(_ctx: PanelContext): void {
  // Switching sidebar tabs recreates the guest; the persisted tree renders without a network call.
  const view = read(status)
  if (
    view.phase === 'loading' ||
    (view.phase === 'ready' && !Object.hasOwn(read(dirEntries), '/'))
  ) {
    void refreshStatus()
  } else if (view.phase === 'ready') {
    // Fetches only expanded folders the cache has dropped; a complete cache makes no request.
    void hydrateExpanded()
  }
}

type TreeItemData = {
  key: string
  label: string
  icon: IconName
  hasChildren?: boolean
  children?: TreeItemData[]
}

function treeItemsFor(dir: string, branch: ReadonlySet<string> = new Set()): TreeItemData[] {
  const entries = read(dirEntries)[dir]
  if (!entries || branch.has(dir)) {
    return []
  }
  const next = new Set(branch).add(dir)
  // One repeated key would make Orca drop the whole items list.
  return entries
    .filter((entry) => !next.has(entry.path))
    .map((entry) => ({
      key: entry.path,
      label: entry.name,
      icon: entry.dir ? 'folder' : 'file',
      hasChildren: entry.dir,
      // Undefined children keep the lazy contract (loading row until loaded); [] would read as empty.
      children:
        entry.dir && Object.hasOwn(read(dirEntries), entry.path)
          ? treeItemsFor(entry.path, next)
          : undefined
    }))
}

async function toggleMcp(): Promise<void> {
  set(mcpBusy, true)
  try {
    if (read(mcpState)?.running) {
      await plugin.request('kb.mcp.stop')
      set(mcpState, null)
    } else {
      const result = (await plugin.request('kb.mcp.start')) as {
        url: string
        configFile: string
      }
      set(mcpState, { running: true, url: result.url, configFile: result.configFile })
    }
  } catch (error) {
    set(lastError, `MCP 启停失败：${errorMessage(error)}`)
  } finally {
    set(mcpBusy, false)
  }
}

/** Double-click and the action bar's 打开: the browser shows the file, no preview detour. */
async function openEntryOnline(entry: KbEntry): Promise<void> {
  set(selectedKey, entry.path)
  set(downloadHint, null)
  set(shareFallback, null)
  startBlobPrefetch(entry)
  startSharePrefetch(entry)
  const url = await ensureShare(entry)
  if (url === null) {
    set(lastError, '获取在线链接失败：服务器可能禁止了公开链接分享')
    return
  }
  try {
    await shell.openExternal(url)
  } catch (error) {
    // The press grant may expire waiting for the share fetch; a settled Link press has no window.
    set(shareFallback, { path: entry.path, url })
    set(lastError, `在线打开失败：${errorMessage(error)}（请再次双击，或点击下方链接）`)
  }
}

// Older hosts drop unknown Tree props with a warning.
const TREE_CONTEXT_ITEMS = [
  { key: 'open-online', label: '打开', icon: 'open-external' },
  { key: 'download', label: '下载', icon: 'download' },
  { key: 'upload-here', label: '上传文件到此处…', icon: 'upload' },
  { key: 'new-folder', label: '新建文件夹', icon: 'folder' },
  { key: 'rename', label: '重命名', icon: 'edit' },
  { key: 'delete', label: '删除', icon: 'delete', danger: true }
] as const

function contextDirFor(item: string): string {
  if (item === '/') {
    return '/'
  }
  const entry = findEntry(item)
  if (entry) {
    return entry.dir ? entry.path : parentPath(entry.path)
  }
  // A cached directory key is still a directory even after its parent list was pruned.
  return Object.hasOwn(read(dirEntries), item) ? item : parentPath(item)
}

function onTreeContextAction({ item, action }: { item: string; action: string }): void {
  const entry = item === '/' ? null : findEntry(item)
  const dir = contextDirFor(item)
  set(selectedKey, item)
  set(renameOpen, false)
  set(pendingDelete, null)
  if (action === 'open-online') {
    if (entry === null) {
      return
    }
    void openEntryOnline(entry)
    return
  }
  if (action === 'download') {
    if (entry === null) {
      return
    }
    if (entry.dir) {
      set(downloadHint, '文件夹暂不支持下载，请使用「打开」在浏览器中查看。')
      return
    }
    void downloadEntry(entry)
    return
  }
  if (action === 'upload-here') {
    set(uploadDir, dir)
    void pickFilesTo(dir)
    return
  }
  if (action === 'new-folder') {
    set(uploadDir, dir)
    set(mkdirOpen, true)
    set(mkdirName, '')
    return
  }
  if (action === 'rename') {
    if (entry === null) {
      return
    }
    set(renameValue, entry.name)
    set(renameOpen, true)
    return
  }
  if (action === 'delete' && item !== '/') {
    set(pendingDelete, item)
  }
}

function onTreeToggle({ key, expanded }: { key: string; expanded: boolean }): void {
  update(expandedKeys, (keys) =>
    expanded ? [...new Set([...keys, key])] : keys.filter((k) => k !== key)
  )
  if (expanded) {
    set(uploadDir, key)
  }
  if (expanded && !Object.hasOwn(read(dirEntries), key)) {
    void loadDir(key)
  }
}

function onTreeSelect({ key }: { key: string }): void {
  set(selectedKey, key)
  set(shareFallback, null)
  const entry = findEntry(key)
  if (entry?.dir) {
    set(uploadDir, key)
    return
  }
  if (entry) {
    // Warm both caches while the person aims, so 打开/下载 land inside the one-shot press grant.
    startBlobPrefetch(entry)
    startSharePrefetch(entry)
  }
}

/** The action bar under the tree: open, download, rename and delete for the selected entry. */
function SelectionActions() {
  const selected = read(selectedKey)
  const entry = selected !== null && selected !== '/' ? findEntry(selected) : null
  if (entry === null) {
    return null
  }
  const rename = read(renameOpen)
  const deleting = read(pendingDelete) === entry.path
  const fallback = read(shareFallback)
  return (
    <Stack gap="xs">
      <Row justify="between" gap="xs" wrap>
        <Text muted size="xs" truncate>
          {entry.dir ? `${entry.name}/` : `${entry.name}（${formatSize(entry.size)}）`}
        </Text>
        <Row gap="xs">
          {!entry.dir ? (
            <>
              <Button
                variant="outline"
                icon="open-external"
                disabled={read(sharePreparing)}
                onPress={() => void openEntryOnline(entry)}
              >
                打开
              </Button>
              <Button
                variant="outline"
                icon="download"
                disabled={read(downloading)}
                onPress={() => void downloadEntry(entry)}
              >
                下载
              </Button>
            </>
          ) : null}
          <IconButton
            icon="edit"
            label="重命名"
            disabled={read(renameBusy)}
            onPress={() => {
              set(renameValue, entry.name)
              set(renameOpen, !rename)
              set(pendingDelete, null)
            }}
          />
          <IconButton
            icon="delete"
            label="删除"
            disabled={read(deleteBusy)}
            onPress={() => {
              set(pendingDelete, deleting ? null : entry.path)
              set(renameOpen, false)
            }}
          />
        </Row>
      </Row>
      {fallback !== null && fallback.path === entry.path ? (
        <Row gap="xs">
          <Link href={fallback.url}>在浏览器中打开 {entry.name}</Link>
        </Row>
      ) : null}
      {rename ? (
        <Row gap="xs">
          <Input
            label="新名称"
            labelHidden
            value={read(renameValue)}
            placeholder="新名称"
            disabled={read(renameBusy)}
            onChange={(value) => set(renameValue, value)}
            onSubmit={() => void renameSelected()}
          />
          <IconButton
            icon="check"
            label="确认重命名"
            disabled={read(renameBusy)}
            onPress={() => void renameSelected()}
          />
          <IconButton
            icon="close"
            label="取消重命名"
            disabled={read(renameBusy)}
            onPress={() => set(renameOpen, false)}
          />
        </Row>
      ) : null}
      {deleting ? (
        <Row gap="xs">
          <Text size="xs">
            确认删除{entry.dir ? '文件夹' : '文件'}「{entry.name}」？
            {entry.dir ? '（含全部内容）' : ''}
          </Text>
          <Button variant="solid" disabled={read(deleteBusy)} onPress={() => void deleteSelected()}>
            {read(deleteBusy) ? '删除中…' : '确认删除'}
          </Button>
          <Button
            variant="ghost"
            disabled={read(deleteBusy)}
            onPress={() => set(pendingDelete, null)}
          >
            取消
          </Button>
        </Row>
      ) : null}
      {read(downloadHint) !== null ? (
        <Text muted size="xs">
          {read(downloadHint)}
        </Text>
      ) : null}
      <Row gap="xs">
        <Button
          variant="outline"
          icon="settings"
          disabled={read(mcpBusy)}
          onPress={() => void toggleMcp()}
        >
          {read(mcpState)?.running ? '停用 MCP' : '启用 MCP'}
        </Button>
        {read(mcpState)?.running ? (
          <Text muted size="xs" truncate>
            {read(mcpState)?.url}
          </Text>
        ) : null}
      </Row>
      {read(mcpState)?.running ? (
        <Text muted size="xs">
          已自动写入各编码 agent 的用户级 MCP 配置（Claude/Codex/Gemini/OpenCode），新会话即可调用
          kb_list/kb_search/kb_read；备用配置：{read(mcpState)?.configFile}
        </Text>
      ) : null}
    </Stack>
  )
}

function ConnectView() {
  const form = read(connectForm)
  return (
    <Stack gap="md">
      <Heading>连接 Nextcloud</Heading>
      <Text muted>
        填入站点地址、用户名与应用密码。应用密码请在 Nextcloud 的「设置 → 安全 →
        设备与浏览器会话」中创建，不要使用登录密码。
      </Text>
      <Field label="服务器地址" required>
        <Input
          label="服务器地址"
          value={form.serverUrl}
          placeholder="http://192.168.1.10:18100"
          onChange={(value) => update(connectForm, (state) => ({ ...state, serverUrl: value }))}
        />
      </Field>
      <Field label="用户名" required>
        <Input
          label="用户名"
          value={form.username}
          placeholder="ncadmin"
          onChange={(value) => update(connectForm, (state) => ({ ...state, username: value }))}
        />
      </Field>
      <Field label="应用密码" required error={form.error ?? undefined}>
        <Input
          label="应用密码"
          type="password"
          value={form.appPassword}
          onChange={(value) => update(connectForm, (state) => ({ ...state, appPassword: value }))}
        />
      </Field>
      <Row gap="sm">
        <Button
          variant="solid"
          disabled={
            form.busy ||
            form.serverUrl.trim() === '' ||
            form.username.trim() === '' ||
            form.appPassword === ''
          }
          onPress={() => void connect()}
        >
          {form.busy ? '连接中…' : '连接并保存'}
        </Button>
      </Row>
    </Stack>
  )
}

export default function Panel() {
  const view = read(status)
  const error = read(lastError)
  const body = (() => {
    if (view.phase === 'loading') {
      return <Spinner label="正在连接知识库" />
    }
    if (view.phase === 'unconfigured') {
      return <ConnectView />
    }
    if (view.phase === 'error') {
      return (
        <Stack gap="md">
          <Callout tone="danger" title="连接失败">
            {view.message}
          </Callout>
          <Row gap="sm">
            <Button variant="outline" icon="refresh" onPress={() => void refreshStatus()}>
              重试
            </Button>
            <Button variant="ghost" onPress={() => set(status, { phase: 'unconfigured' })}>
              重新配置
            </Button>
          </Row>
        </Stack>
      )
    }
    return (
      <Stack gap="sm">
        <Row justify="between" gap="xs">
          <Input
            label="搜索文件"
            labelHidden
            type="search"
            value={read(term)}
            placeholder="搜索文件名…"
            onChange={onSearchChange}
          />
          <IconButton
            icon="refresh"
            label="刷新"
            variant="ghost"
            onPress={() => {
              set(dirEntries, {})
              void refreshStatus(true)
            }}
          />
        </Row>
        <FilesTab serverUrl={view.serverUrl} />
      </Stack>
    )
  })()
  return (
    <Stack gap="md">
      {error !== null ? (
        <Callout tone="warning" title="操作失败">
          {error}
        </Callout>
      ) : null}
      {body}
    </Stack>
  )
}

function FilesTab({ serverUrl }: { serverUrl: string }) {
  const query = read(term).trim()
  if (query !== '') {
    return <SearchResults />
  }
  const rootItems: TreeItemData[] = [
    {
      key: '/',
      label: hostOf(serverUrl),
      icon: 'database',
      hasChildren: true,
      children: treeItemsFor('/')
    }
  ]
  const mkdirTarget = read(uploadDir) ?? '/'
  return (
    <Stack gap="sm">
      {read(mkdirOpen) ? (
        <Stack gap="xs">
          <Text muted size="xs" truncate>
            在 {mkdirTarget} 下新建文件夹
          </Text>
          <Row gap="xs">
            <Input
              label="文件夹名称"
              labelHidden
              value={read(mkdirName)}
              placeholder="输入文件夹名称"
              disabled={read(mkdirBusy)}
              onChange={(value) => set(mkdirName, value)}
              onSubmit={() => void createFolder()}
            />
            <IconButton
              icon="check"
              label="创建文件夹"
              disabled={read(mkdirBusy)}
              onPress={() => void createFolder()}
            />
            <IconButton
              icon="close"
              label="取消新建"
              disabled={read(mkdirBusy)}
              onPress={() => set(mkdirOpen, false)}
            />
          </Row>
        </Stack>
      ) : null}
      {read(uploadMessage) !== null ? (
        <Text muted size="xs">
          {read(uploadMessage)}
        </Text>
      ) : null}
      <SelectionActions />
      <Tree
        label="知识库文件"
        items={rootItems}
        expanded={read(expandedKeys)}
        selected={read(selectedKey) ?? undefined}
        onToggle={onTreeToggle}
        onSelect={onTreeSelect}
        contextMenu={TREE_CONTEXT_ITEMS}
        onContextAction={onTreeContextAction}
        onFilesDrop={onTreeFilesDrop}
        onAction={({ key }) => {
          const entry = findEntry(key)
          if (entry && !entry.dir) {
            void openEntryOnline(entry)
          } else if (key !== '/' && !Object.hasOwn(read(dirEntries), key)) {
            void loadDir(key)
          }
        }}
      />
    </Stack>
  )
}

function SearchResults() {
  const query = read(term).trim()
  const results = read(searchResults)
  const rows = results.map((result, index) => ({
    key: `${index}|${result.path}|${result.name}`,
    cells: {
      name: result.dir ? `${result.name}/` : result.name,
      path: result.path !== '' ? result.path : result.subline
    }
  }))
  return (
    <Stack gap="xs">
      {!read(searchIndexed) ? (
        <Text muted size="xs">
          {read(searchSource) === 'index'
            ? `正在建立本地文件索引（已扫描 ${read(searchIndexSize)} 项），结果会逐步补全；完成后每次检索即时返回。`
            : '本地索引尚未覆盖该结果，本次为服务器搜索；索引就绪后搜索会明显变快。'}
        </Text>
      ) : null}
      {read(searchIndexed) && read(searchIndexTruncated) ? (
        <Text muted size="xs">
          索引已达扫描上限，深层目录中的文件可能未被收录；零结果时会自动改用服务器搜索。
        </Text>
      ) : null}
      <Table
        label="搜索结果"
        columns={[
          { key: 'name', label: '名称', minWidth: 'sm' },
          { key: 'path', label: '位置', hideBelow: 'md' }
        ]}
        rows={rows}
        emptyText="没有匹配的文件"
        loading={read(searchLoading) && rows.length === 0}
        hasMore={read(searchCursor) !== null}
        onLoadMore={() => void runSearch(query, read(searchCursor), false)}
        onRowAction={({ key }) => {
          const index = Number(key.slice(0, key.indexOf('|')))
          const target = results[index]
          if (target) {
            void revealPath(target)
          }
        }}
      />
    </Stack>
  )
}
