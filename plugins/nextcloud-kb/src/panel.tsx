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
  Link,
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
const downloading = atom(false)
const uploadPath = atom('kb.upload.path', '', { persist: 'plugin' })
const uploadBusy = atom(false)
const uploadDir = atom<string | null>('kb.upload.dir', null, { persist: 'plugin' })
const uploadMessage = atom<string | null>(null)

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

function fileUrl(serverUrl: string, entry: KbEntry): string | null {
  if (entry.fileId !== null && entry.fileId !== '') {
    return `${serverUrl}/f/${entry.fileId}`
  }
  return `${serverUrl}/apps/files/?dir=${encodeURIComponent(parentPath(entry.path))}`
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

async function refreshStatus(): Promise<void> {
  set(status, { phase: 'loading' })
  try {
    const result = await plugin.request('kb.status', {})
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

async function openFile(entry: KbEntry): Promise<void> {
  set(activeTab, 'preview')
  set(selectedKey, entry.path)
  set(shareUrl, null)
  set(editor, { editing: false, draft: '', saving: false, error: null })
  set(preview, { phase: 'loading', name: entry.name, path: entry.path })
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

function onSearchChange(value: string): void {
  set(term, value)
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
  searchTimer = setTimeout(() => {
    void runSearch(query, null, true)
  }, 350)
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


const DOWNLOAD_CHUNK_BYTES = 512 * 1024

async function shareCurrent(): Promise<void> {
  const state = read(preview)
  if (state.phase !== 'text' && state.phase !== 'binary') {
    return
  }
  try {
    const { url } = await plugin.request('kb.share', { path: state.entry.path })
    set(shareUrl, url)
  } catch (error) {
    set(lastError, `分享失败：${errorMessage(error)}`)
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

async function downloadCurrent(): Promise<void> {
  const state = read(preview)
  if (state.phase !== 'text' && state.phase !== 'binary' || read(downloading)) {
    return
  }
  const entry = state.entry
  set(downloading, true)
  try {
    const parts: Uint8Array<ArrayBuffer>[] = []
    let offset = 0
    let total: number | null = null
    for (;;) {
      const chunk = await plugin.request('kb.range', {
        path: entry.path,
        offset,
        length: DOWNLOAD_CHUNK_BYTES
      })
      const bytes = Uint8Array.from(atob(chunk.base64), (char) => char.charCodeAt(0))
      parts.push(bytes)
      offset += bytes.byteLength
      total = chunk.total ?? total
      if (chunk.done || bytes.byteLength === 0) {
        break
      }
    }
    const data = await new Blob(parts, { type: mimeFor(entry.name) }).arrayBuffer()
    const { status } = await files.saveAs({ suggestedName: entry.name, mimeType: mimeFor(entry.name), data })
    void status
  } catch (error) {
    set(lastError, `下载失败：${errorMessage(error)}`)
  } finally {
    set(downloading, false)
  }
}

async function uploadLocal(): Promise<void> {
  const localPath = read(uploadPath).trim()
  if (localPath === '' || read(uploadBusy)) {
    return
  }
  const name = localPath.split('/').filter(Boolean).pop() ?? ''
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

function onTreeToggle({ key, expanded }: { key: string; expanded: boolean }): void {
  update(expandedKeys, (keys) => (expanded ? [...new Set([...keys, key])] : keys.filter((k) => k !== key)))
  if (expanded) {
    set(uploadDir, key)
  }
  if (expanded && !read(dirEntries).has(key)) {
    void loadDir(key)
  }
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
          disabled={form.busy || form.serverUrl.trim() === '' || form.username.trim() === '' || form.appPassword === ''}
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
              void refreshStatus()
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
            <PreviewTab serverUrl={view.serverUrl} />
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
  return (
    <Stack gap="sm">
      <Row gap="xs">
        <Input
          label="上传本地文件"
          labelHidden
          value={read(uploadPath)}
          placeholder="上传本地文件，如 /Users/me/报告.pdf"
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
      </Row>
      {read(uploadMessage) !== null ? (
        <Text muted size="xs">
          {read(uploadMessage)}
        </Text>
      ) : null}
      <Tree
        label="知识库文件"
      items={rootItems}
      expanded={read(expandedKeys)}
      selected={read(selectedKey) ?? undefined}
      onToggle={onTreeToggle}
      onSelect={({ key }) => set(selectedKey, key)}
      onAction={({ key }) => {
        const entry = findEntry(key)
        if (entry && !entry.dir) {
          void openFile(entry)
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
  )
}

function PreviewTab({ serverUrl }: { serverUrl: string }) {
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
  const url = fileUrl(serverUrl, entry)
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
        <IconButton icon="link" label="分享链接" disabled={read(downloading)} onPress={() => void shareCurrent()} />
        <IconButton
          icon="download"
          label="下载"
          disabled={read(downloading)}
          onPress={() => void downloadCurrent()}
        />
        {url !== null ? <Link href={url}>在线打开</Link> : null}
      </Row>
    </Row>
  )
  if (state.phase === 'binary') {
    return (
      <Stack gap="sm">
        {header}
        {read(shareUrl) !== null ? <Code>{read(shareUrl)}</Code> : null}
        {read(downloading) ? <Spinner label="正在下载" /> : null}
        <EmptyState
          title="暂不支持此类型预览"
          description={`${entry.name}（${formatSize(entry.size)}）请在 Nextcloud 中查看。`}
          icon="file"
        />
      </Stack>
    )
  }
  const canEdit = !state.truncated && state.content.length <= EDIT_MAX_CHARS
  return (
    <Stack gap="sm">
      {header}
      {read(shareUrl) !== null ? <Code>{read(shareUrl)}</Code> : null}
      {read(downloading) ? <Spinner label="正在下载" /> : null}
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
