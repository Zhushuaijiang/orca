/* eslint-disable max-lines -- Why: one declarative panel keeps its atoms, handlers and views together; splitting it would hide the panel state machine */
// The knowledge base panel: connect, browse (lazy tree), search, preview and edit text
// files. All data flows through `plugin.request` to the worker; the frame never touches
// the network.

import {
  atom,
  read,
  set,
  update,
  files,
  plugin,
  shell,
  ui,
  Badge,
  Button,
  Callout,
  Code,
  CodeView,
  EmptyState,
  Field,
  Heading,
  IconButton,
  Input,
  Markdown,
  RelativeTime,
  Row,
  Spinner,
  Stack,
  Tab,
  Table,
  Tabs,
  Text,
  Textarea,
  Tree,
  type IconName,
  type PanelContext
} from 'orca'
import type { KbEntry, KbSearchEntry } from './protocol'

type Status =
  | { phase: 'loading' }
  | { phase: 'unconfigured' }
  | { phase: 'error'; message: string; serverUrl: string; username: string }
  | { phase: 'ready'; serverUrl: string; username: string }

type Preview =
  | { phase: 'idle' }
  | { phase: 'loading'; name: string; path: string }
  | { phase: 'text'; entry: KbEntry; content: string; truncated: boolean; etag: string | null }
  | { phase: 'binary'; entry: KbEntry }
  | { phase: 'error'; entry: KbEntry; message: string }

type EditorState = {
  editing: boolean
  draft: string
  saving: boolean
  error: { code: string; message: string } | null
}

type ConnectForm = {
  serverUrl: string
  username: string
  appPassword: string
  busy: boolean
  error: string | null
}

const EDIT_MAX_CHARS = 60_000
const PREVIEW_MAX_CHARS = 64_000
// `files.saveAs` carries 64 MiB; leave headroom for the base64 envelope.
const BLOB_MAX_BYTES = 45 * 1024 * 1024
const BLOB_CHUNK_BYTES = 512 * 1024

const status = atom<Status>('kb.status-view', { phase: 'loading' })
const dirEntries = atom<ReadonlyMap<string, readonly KbEntry[]>>(new Map())
const busyDirs = atom<ReadonlySet<string>>(new Set())
const expandedKeys = atom<string[]>('kb.expanded', ['/'], { persist: 'plugin' })
const selectedKey = atom<string | null>('kb.selected', null, { persist: 'plugin' })
const activeTab = atom<'files' | 'preview'>('kb.tab', 'files', { persist: 'plugin' })
const preview = atom<Preview>({ phase: 'idle' })
const editor = atom<EditorState>({ editing: false, draft: '', saving: false, error: null })
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
const shareUrl = atom<string | null>(null)
const sharePreparing = atom(false)
const downloading = atom(false)
const downloadHint = atom<string | null>(null)
const searchIndexed = atom(true)
const searchSource = atom<'index' | 'ocs'>('index')
const searchIndexSize = atom(0)
const searchIndexTruncated = atom(false)
const uploadPath = atom('kb.upload.path', '', { persist: 'plugin' })
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

// The save dialog must run inside a one-shot press grant (about one second), so file
// bytes are prefetched while the preview opens and the 下载 press only writes them out.
let blobCache: { path: string; data: ArrayBuffer } | null = null
let blobPrefetch: { path: string; promise: Promise<void> } | null = null
// The share link is also prefetched: 在线打开 then opens the browser with no round trip.
let shareCache: { path: string; url: string } | null = null
let sharePrefetch: { path: string; promise: Promise<void> } | null = null

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string') {
      return code
    }
  }
  return 'action_failed'
}

function parentPath(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const index = trimmed.lastIndexOf('/')
  return index <= 0 ? '/' : trimmed.slice(0, index)
}

function isMarkdown(name: string): boolean {
  return /\.(md|markdown)$/i.test(name)
}

function languageFor(name: string): string | undefined {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase()
  switch (ext) {
    case 'ts':
      return 'typescript'
    case 'tsx':
      return 'tsx'
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    case 'jsx':
      return 'jsx'
    case 'json':
      return 'json'
    case 'py':
      return 'python'
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'shell'
    case 'sql':
      return 'sql'
    case 'yml':
    case 'yaml':
      return 'yaml'
    case 'html':
      return 'html'
    case 'css':
      return 'css'
    case 'xml':
      return 'xml'
    default:
      return undefined
  }
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
    if (read(dirEntries).has(key)) {
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
    update(dirEntries, (map) => {
      const next = new Map(map)
      next.set(path, entries)
      return next
    })
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

async function openFile(entry: KbEntry): Promise<void> {
  set(activeTab, 'preview')
  set(selectedKey, entry.path)
  set(shareUrl, null)
  set(downloadHint, null)
  set(editor, { editing: false, draft: '', saving: false, error: null })
  set(preview, { phase: 'loading', name: entry.name, path: entry.path })
  // Both run while the person reads the preview, so the buttons act instantly on press.
  startBlobPrefetch(entry)
  startSharePrefetch(entry)
  try {
    const result = await plugin.request('kb.read', { path: entry.path, maxBytes: 256 * 1024 })
    if (read(selectedKey) !== entry.path) {
      return
    }
    if (result.kind === 'text') {
      set(preview, {
        phase: 'text',
        entry,
        content: result.text,
        truncated: result.truncated,
        etag: result.etag
      })
    } else {
      set(preview, { phase: 'binary', entry })
    }
  } catch (error) {
    if (read(selectedKey) === entry.path) {
      set(preview, { phase: 'error', entry, message: errorMessage(error) })
    }
  }
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
  const entries = read(dirEntries).get(parentPath(path))
  return entries?.find((entry) => entry.path === path) ?? null
}

async function revealPath(target: KbSearchEntry): Promise<void> {
  const filePath = target.dir ? null : target.path
  if (filePath === null || target.path === '') {
    // A folder (or an entry without a path): switch to browse with its parent loaded.
    const dir = target.path === '' ? '/' : parentPath(target.path)
    if (!read(dirEntries).has(dir)) {
      await loadDir(dir)
    }
    set(activeTab, 'files')
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
    if (!read(dirEntries).has(ancestor)) {
      await loadDir(ancestor)
    }
  }
  update(expandedKeys, (keys) => [...new Set([...keys, ...ancestors])])
  const entry = findEntry(filePath)
  if (entry) {
    await openFile(entry)
  } else {
    set(lastError, `找不到 ${target.path}（可能已被移动或删除）`)
  }
}

async function saveEdit(force: boolean): Promise<void> {
  const current = read(preview)
  if (current.phase !== 'text') {
    return
  }
  update(editor, (state) => ({ ...state, saving: true, error: null }))
  try {
    const result = await plugin.request('kb.write', {
      path: current.entry.path,
      text: read(editor).draft,
      etag: force ? null : current.etag
    })
    set(preview, {
      ...current,
      content: read(editor).draft,
      truncated: false,
      etag: result.etag
    })
    set(editor, { editing: false, draft: '', saving: false, error: null })
    update(dirEntries, (map) => {
      if (!map.has(parentPath(current.entry.path))) {
        return map
      }
      const next = new Map(map)
      next.delete(parentPath(current.entry.path))
      return next
    })
    void loadDir(parentPath(current.entry.path))
  } catch (error) {
    update(editor, (state) => ({
      ...state,
      saving: false,
      error: { code: errorCode(error), message: errorMessage(error) }
    }))
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
    set(dirEntries, new Map())
    set(expandedKeys, ['/'])
    set(preview, { phase: 'idle' })
    await refreshStatus()
  } catch (error) {
    update(connectForm, (state) => ({ ...state, busy: false, error: errorMessage(error) }))
  }
}

async function downloadCurrent(): Promise<void> {
  const state = read(preview)
  if (state.phase !== 'text' && state.phase !== 'binary') {
    return
  }
  await downloadEntry(state.entry)
}

/** Works for any entry: the tree's action bar and the preview header share it. */
async function downloadEntry(entry: KbEntry): Promise<void> {
  if (entry.dir || read(downloading)) {
    return
  }
  if (entry.size > BLOB_MAX_BYTES) {
    set(
      downloadHint,
      entry.dir ? '文件夹请在浏览器中打开后下载。' : '文件超过 45 MB，请在线打开后在浏览器下载。'
    )
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

async function shareCurrent(): Promise<void> {
  const state = read(preview)
  if (state.phase !== 'text' && state.phase !== 'binary') {
    return
  }
  const url = await ensureShare(state.entry)
  if (url !== null) {
    set(shareUrl, url)
  } else {
    set(lastError, '分享失败：服务器可能禁止了公开链接分享')
  }
}

/** 在线打开：share link renders in the browser without a Nextcloud login. */
async function openOnline(): Promise<void> {
  const state = read(preview)
  if ((state.phase !== 'text' && state.phase !== 'binary') || read(sharePreparing)) {
    return
  }
  const url = await ensureShare(state.entry)
  if (url === null) {
    set(lastError, '获取在线链接失败：服务器可能禁止了公开链接分享')
    return
  }
  try {
    await shell.openExternal(url)
  } catch (error) {
    set(lastError, `在线打开失败：${errorMessage(error)}（若为交互超时，请再次点击）`)
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

async function uploadLocal(): Promise<void> {
  const localPath = read(uploadPath).trim()
  if (localPath === '' || read(uploadBusy)) {
    return
  }
  const trimmed = localPath.replace(/\/+$/, '')
  const name = trimmed.slice(trimmed.lastIndexOf('/') + 1)
  if (name === '') {
    set(uploadMessage, '本地路径不合法')
    return
  }
  const dirPath = read(uploadDir) ?? '/'
  set(uploadBusy, true)
  set(uploadMessage, null)
  try {
    const result = await plugin.request('kb.uploadLocal', { localPath, dirPath, name })
    set(uploadPath, '')
    set(uploadMessage, `已上传 ${name}（${formatSize(result.size)}）`)
    void loadDir(dirPath)
  } catch (error) {
    set(uploadMessage, `上传失败：${errorMessage(error)}`)
  } finally {
    set(uploadBusy, false)
  }
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
    const previewState = read(preview)
    if (
      (previewState.phase === 'text' || previewState.phase === 'binary') &&
      previewState.entry.path === target
    ) {
      set(preview, { phase: 'idle' })
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
    const previewState = read(preview)
    if (
      (previewState.phase === 'text' || previewState.phase === 'binary') &&
      previewState.entry.path === target
    ) {
      set(preview, { phase: 'idle' })
    }
    void loadDir(parentPath(toPath))
  } catch (error) {
    set(lastError, `重命名失败：${errorMessage(error)}`)
  } finally {
    set(renameBusy, false)
  }
}

export function setup(_ctx: PanelContext): void {
  void refreshStatus()
}

type TreeItemData = {
  key: string
  label: string
  icon: IconName
  hasChildren?: boolean
  children?: TreeItemData[]
}

function treeItemsFor(dir: string): TreeItemData[] {
  const entries = read(dirEntries).get(dir)
  if (!entries) {
    return []
  }
  return entries.map((entry) => ({
    key: entry.path,
    label: entry.name,
    icon: entry.dir ? 'folder' : 'file',
    hasChildren: entry.dir,
    // Undefined children keep the lazy contract (loading row until loaded); [] would read as empty.
    children: entry.dir && read(dirEntries).has(entry.path) ? treeItemsFor(entry.path) : undefined
  }))
}

/** Double-click and the action bar's 打开: the browser shows the file, no preview detour. */
async function openEntryOnline(entry: KbEntry): Promise<void> {
  set(selectedKey, entry.path)
  set(downloadHint, null)
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
    set(lastError, `在线打开失败：${errorMessage(error)}（若为交互超时，请再次双击）`)
  }
}

// The right-click menu needs Orca's catalog 5 (`ui.catalog` 5); older builds drop the props.
const TREE_CONTEXT_MENU = ui.has('Tree', 'contextMenu')

const TREE_CONTEXT_ITEMS = [
  { key: 'upload-here', label: '上传文件到此处', icon: 'upload' },
  { key: 'new-folder', label: '新建文件夹', icon: 'folder' },
  { key: 'rename', label: '重命名', icon: 'edit' },
  { key: 'delete', label: '删除', icon: 'delete', danger: true }
] as const

function onTreeContextAction({ item, action }: { item: string; action: string }): void {
  const entry = item === '/' ? null : findEntry(item)
  // A file's "here" is its parent directory.
  const dir = item === '/' ? '/' : entry?.dir ? entry.path : entry ? parentPath(entry.path) : null
  set(selectedKey, item)
  if (action === 'upload-here') {
    if (dir === null) {
      return
    }
    set(uploadDir, dir)
    set(renameOpen, false)
    set(pendingDelete, null)
    set(
      uploadMessage,
      `已切换上传目标到 ${dir === '/' ? '根目录' : dir}，请在上方输入本地文件路径。`
    )
    return
  }
  if (action === 'new-folder') {
    if (dir === null) {
      return
    }
    set(uploadDir, dir)
    set(mkdirOpen, true)
    set(mkdirName, '')
    set(renameOpen, false)
    set(pendingDelete, null)
    return
  }
  if (action === 'rename') {
    if (entry === null) {
      return
    }
    set(renameValue, entry.name)
    set(renameOpen, true)
    set(pendingDelete, null)
    return
  }
  if (action === 'delete' && item !== '/') {
    set(pendingDelete, item)
    set(renameOpen, false)
  }
}

function onTreeToggle({ key, expanded }: { key: string; expanded: boolean }): void {
  update(expandedKeys, (keys) =>
    expanded ? [...new Set([...keys, key])] : keys.filter((k) => k !== key)
  )
  if (expanded) {
    set(uploadDir, key)
  }
  if (expanded && !read(dirEntries).has(key)) {
    void loadDir(key)
  }
}

function onTreeSelect({ key }: { key: string }): void {
  set(selectedKey, key)
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
              <IconButton icon="file-text" label="预览" onPress={() => void openFile(entry)} />
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
              set(dirEntries, new Map())
              set(preview, { phase: 'idle' })
              void refreshStatus(true)
            }}
          />
        </Row>
        <Tabs
          label="知识库视图"
          value={read(activeTab)}
          onChange={(value) => set(activeTab, value === 'preview' ? 'preview' : 'files')}
        >
          <Tab value="files" label="文件" icon="folder">
            <FilesTab serverUrl={view.serverUrl} />
          </Tab>
          <Tab value="preview" label="预览" icon="file">
            <PreviewTab />
          </Tab>
        </Tabs>
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
  const upload = read(uploadPath).trim()
  const mkdirTarget = read(uploadDir) ?? '/'
  return (
    <Stack gap="sm">
      <Row gap="xs">
        <Input
          label="上传本地文件"
          labelHidden
          value={read(uploadPath)}
          placeholder={`上传本地文件到 /${mkdirTarget === '/' ? '' : mkdirTarget.replace(/^\//, '')}，如 /Users/me/报告.pdf`}
          disabled={read(uploadBusy)}
          onChange={(value) => set(uploadPath, value)}
          onSubmit={() => void uploadLocal()}
        />
        <IconButton
          icon="add"
          label="上传本地文件"
          disabled={read(uploadBusy) || upload === ''}
          onPress={() => void uploadLocal()}
        />
        <IconButton
          icon="folder"
          label="新建文件夹"
          disabled={read(mkdirBusy)}
          onPress={() => {
            set(mkdirOpen, !read(mkdirOpen))
            set(pendingDelete, null)
            set(renameOpen, false)
          }}
        />
      </Row>
      {read(mkdirOpen) ? (
        <Row gap="xs">
          <Input
            label="文件夹名称"
            labelHidden
            value={read(mkdirName)}
            placeholder={`在 ${mkdirTarget} 下新建文件夹`}
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
        {...(TREE_CONTEXT_MENU
          ? { contextMenu: TREE_CONTEXT_ITEMS, onContextAction: onTreeContextAction }
          : {})}
        onAction={({ key }) => {
          const entry = findEntry(key)
          if (entry && !entry.dir) {
            void openEntryOnline(entry)
          } else if (key !== '/' && !read(dirEntries).has(key)) {
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

function PreviewTab() {
  const state = read(preview)
  const edit = read(editor)
  if (state.phase === 'idle') {
    return (
      <EmptyState
        title="未选择文件"
        description="在文件树或搜索结果中选择一个文件即可预览。"
        icon="file"
      />
    )
  }
  if (state.phase === 'loading') {
    return <Spinner label="正在读取文件" />
  }
  if (state.phase === 'error') {
    return (
      <Stack gap="sm">
        <Callout tone="danger" title="读取失败">
          {state.message}
        </Callout>
        <Button variant="outline" icon="refresh" onPress={() => void openFile(state.entry)}>
          重试
        </Button>
      </Stack>
    )
  }
  const entry = state.entry
  const header = (
    <Row justify="between" gap="xs" wrap>
      <Stack gap="none">
        <Text weight="semibold" truncate>
          {entry.name}
        </Text>
        <Text muted size="xs">
          {formatSize(entry.size)}
          {entry.modifiedMs !== null ? ' · ' : null}
          {entry.modifiedMs !== null ? <RelativeTime at={entry.modifiedMs} format="short" /> : null}
          {state.phase === 'text' && state.truncated ? ' · ' : null}
          {state.phase === 'text' && state.truncated ? <Badge tone="warning">已截断</Badge> : null}
        </Text>
      </Stack>
      <Row gap="xs">
        <IconButton
          icon="link"
          label="分享链接"
          disabled={read(sharePreparing)}
          onPress={() => void shareCurrent()}
        />
        <IconButton
          icon="download"
          label="下载"
          disabled={read(downloading)}
          onPress={() => void downloadCurrent()}
        />
        <IconButton
          icon="open-external"
          label="在线打开"
          disabled={read(sharePreparing)}
          onPress={() => void openOnline()}
        />
      </Row>
    </Row>
  )
  const hint = read(downloadHint)
  const hints =
    hint !== null || read(shareUrl) !== null ? (
      <Stack gap="xs">
        {read(shareUrl) !== null ? <Code>{read(shareUrl)}</Code> : null}
        {hint !== null ? (
          <Text muted size="xs">
            {hint}
          </Text>
        ) : null}
      </Stack>
    ) : null
  if (state.phase === 'binary') {
    return (
      <Stack gap="sm">
        {header}
        {hints}
        {read(downloading) ? <Spinner label="正在准备下载" /> : null}
        <Stack gap="sm">
          <Text muted>
            此类型在面板内不内建预览：在线打开会使用浏览器预览（PDF、图片、Office
            等，已自动登录），下载保存到本地。
          </Text>
          <Row gap="sm">
            <Button
              variant="solid"
              icon="open-external"
              disabled={read(sharePreparing)}
              onPress={() => void openOnline()}
            >
              {read(sharePreparing) ? '正在准备链接…' : '在线打开'}
            </Button>
            <Button
              variant="outline"
              icon="download"
              disabled={read(downloading)}
              onPress={() => void downloadCurrent()}
            >
              下载
            </Button>
          </Row>
        </Stack>
      </Stack>
    )
  }
  const canEdit = !state.truncated && state.content.length <= EDIT_MAX_CHARS
  return (
    <Stack gap="sm">
      {header}
      {hints}
      {read(downloading) ? <Spinner label="正在准备下载" /> : null}
      {edit.error !== null ? (
        <Callout tone={edit.error.code === 'conflict' ? 'warning' : 'danger'} title="保存失败">
          {edit.error.message}
          {edit.error.code === 'conflict' ? (
            <Row gap="xs">
              <Button
                variant="outline"
                onPress={() => {
                  set(editor, { editing: false, draft: '', saving: false, error: null })
                  void openFile(entry)
                }}
              >
                重新加载
              </Button>
              <Button variant="solid" disabled={edit.saving} onPress={() => void saveEdit(true)}>
                强制覆盖
              </Button>
            </Row>
          ) : null}
        </Callout>
      ) : null}
      {edit.editing ? (
        <Stack gap="sm">
          <Textarea
            label="编辑内容"
            labelHidden
            rows={16}
            value={edit.draft}
            onChange={(value) => update(editor, (state) => ({ ...state, draft: value }))}
          />
          <Row gap="xs">
            <Button
              variant="solid"
              icon="check"
              disabled={edit.saving}
              onPress={() => void saveEdit(false)}
            >
              {edit.saving ? '保存中…' : '保存'}
            </Button>
            <Button
              variant="ghost"
              disabled={edit.saving}
              onPress={() => set(editor, { editing: false, draft: '', saving: false, error: null })}
            >
              取消
            </Button>
          </Row>
        </Stack>
      ) : (
        <Stack gap="xs">
          {canEdit ? (
            <Row justify="end" gap="xs">
              <Button
                variant="ghost"
                icon="edit"
                onPress={() =>
                  set(editor, { editing: true, draft: state.content, saving: false, error: null })
                }
              >
                编辑
              </Button>
            </Row>
          ) : null}
          {isMarkdown(entry.name) ? (
            <Markdown content={state.content.slice(0, PREVIEW_MAX_CHARS)} />
          ) : (
            <CodeView
              label={entry.name}
              code={state.content.slice(0, PREVIEW_MAX_CHARS)}
              language={languageFor(entry.name)}
              wrap
            />
          )}
        </Stack>
      )}
    </Stack>
  )
}
