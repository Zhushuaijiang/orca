#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir, rename } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir, platform, tmpdir } from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const HOST = '127.0.0.1'
const PORT = Number(process.env.ORCA_RELEASE_PUBLISHER_PORT || 18765)
const DEFAULT_REMOTE = 'root@192.168.1.10'
const DEFAULT_REMOTE_DIR =
  '/opt/workspace/github/hermes-agent-260623/bot_manager/static/downloads/orca'
const DOWNLOAD_BASE_URL = 'http://192.168.1.10:18800/downloads/orca'
const DEFAULT_REPO_ROOT = path.resolve(import.meta.dirname, '..', '..')

function jsonResponse(res, statusCode, value) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  res.end(JSON.stringify(value, null, 2))
}

function htmlResponse(res, value) {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store'
  })
  res.end(value)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      resolve(body ? JSON.parse(body) : {})
    })
    req.on('error', reject)
  })
}

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...options.env },
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: options.shell ?? false
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.status !== 0) {
    throw new Error(output || `${command} exited with ${result.status}`)
  }
  return output
}

function runText(command, args, cwd) {
  try {
    return run(command, args, cwd).trim()
  } catch {
    return ''
  }
}

function pnpmArgs(args) {
  if (process.env.ORCA_RELEASE_PNPM) {
    return { command: process.env.ORCA_RELEASE_PNPM, args }
  }
  return { command: 'npx', args: ['--yes', 'pnpm@10.24.0', ...args] }
}

function readPackageJson(repoRoot) {
  return JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
}

function isOrcaRepoRoot(candidate) {
  const packageJsonPath = path.join(candidate, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return false
  }
  try {
    return readPackageJson(candidate).name === 'orca'
  } catch {
    return false
  }
}

function resolveRepoRoot(input) {
  const candidates = [
    input,
    process.env.ORCA_RELEASE_REPO_ROOT,
    DEFAULT_REPO_ROOT,
    process.cwd(),
    path.join(homedir(), 'workspace', 'github', 'orca'),
    path.join(homedir(), 'workspace', 'orca')
  ].filter(Boolean)
  const repoRoot = candidates.find(isOrcaRepoRoot)
  if (!repoRoot) {
    throw new Error('未找到 Orca 仓库根目录，请在页面里填写 repo root。')
  }
  return path.resolve(repoRoot)
}

function fileInfo(filePath) {
  const info = statSync(filePath)
  return { size: info.size, mtimeMs: info.mtimeMs }
}

function macAppVersion(macApp, repoRoot) {
  if (platform() !== 'darwin') {
    return ''
  }
  return runText(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print :CFBundleShortVersionString', path.join(macApp, 'Contents', 'Info.plist')],
    repoRoot
  )
}

function macArtifact(repoRoot, candidatePath, expectedVersion) {
  if (!existsSync(candidatePath)) {
    return { path: candidatePath, kind: 'mac-app', status: 'missing' }
  }
  const version = macAppVersion(candidatePath, repoRoot)
  return {
    path: candidatePath,
    kind: 'mac-app',
    status: version === expectedVersion ? 'ready' : 'version-mismatch',
    version,
    ...fileInfo(candidatePath)
  }
}

function windowsArtifact(candidatePath) {
  if (!existsSync(candidatePath)) {
    return { path: candidatePath, kind: 'windows-exe', status: 'missing' }
  }
  return { path: candidatePath, kind: 'windows-exe', status: 'ready', ...fileInfo(candidatePath) }
}

function newestReady(candidates) {
  return candidates
    .filter((candidate) => candidate.status === 'ready')
    .sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0))[0]
}

function windowsCandidates(repoRoot, version) {
  const candidates = [
    path.join(repoRoot, 'dist', 'orca-desktop-release', version, 'orca-windows-setup.exe')
  ]
  const dist = path.join(repoRoot, 'dist')
  if (existsSync(dist)) {
    for (const entry of readdirSync(dist, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('windows-installer-')) {
        candidates.push(path.join(dist, entry.name, 'orca-windows-setup.exe'))
      }
    }
  }
  return candidates.map(windowsArtifact)
}

async function remoteLatest() {
  try {
    const response = await fetch(`${DOWNLOAD_BASE_URL}/latest.json`, { cache: 'no-store' })
    if (!response.ok) {
      return undefined
    }
    const json = await response.json()
    return {
      version: json.version,
      publishedAt: json.published_at,
      macSha256: json.downloads?.macos?.sha256,
      windowsSha256: json.downloads?.windows?.sha256
    }
  } catch {
    return undefined
  }
}

async function getStatus(repoRootInput) {
  const repoRoot = resolveRepoRoot(repoRootInput)
  const version = readPackageJson(repoRoot).version ?? ''
  const branch = runText('git', ['branch', '--show-current'], repoRoot)
  const headSha = runText('git', ['rev-parse', 'HEAD'], repoRoot)
  const isDirty = runText('git', ['status', '--porcelain'], repoRoot).length > 0
  const macCandidates = [
    macArtifact(repoRoot, path.join(repoRoot, 'dist', 'mac-arm64', 'Orca.app'), version),
    macArtifact(repoRoot, '/Applications/Orca.app', version)
  ]
  const windows = windowsCandidates(repoRoot, version)
  const warnings = []
  if (isDirty) {
    warnings.push('工作区有未提交修改，发布前建议先提交并推送。')
  }
  if (!newestReady(macCandidates)) {
    warnings.push('当前版本没有可发布的 macOS app。')
  }
  if (!newestReady(windows)) {
    warnings.push('当前版本没有可发布的 Windows installer。')
  }
  return {
    repoRoot,
    version,
    branch,
    headSha,
    isDirty,
    checkedAt: new Date().toISOString(),
    macCandidates,
    windowsCandidates: windows,
    selectedMacAppPath: newestReady(macCandidates)?.path,
    selectedWindowsExePath: newestReady(windows)?.path,
    remoteLatest: await remoteLatest(),
    warnings
  }
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function buildMacApp(repoRoot) {
  if (platform() !== 'darwin') {
    throw new Error('macOS app 只能在 macOS 上构建。')
  }
  const steps = [
    ['run', 'build:desktop'],
    ['run', 'build:computer-macos'],
    ['run', 'build:notification-status-macos'],
    ['run', 'ensure:electron-runtime']
  ]
  const logs = []
  for (const args of steps) {
    const pnpm = pnpmArgs(args)
    logs.push(`$ ${pnpm.command} ${pnpm.args.join(' ')}`)
    logs.push(run(pnpm.command, pnpm.args, repoRoot))
  }
  const electronBuilder = pnpmArgs([
    'exec',
    'electron-builder',
    '--config',
    'config/electron-builder.config.cjs',
    '--mac',
    'dir',
    '--arm64'
  ])
  logs.push(`$ ${electronBuilder.command} ${electronBuilder.args.join(' ')}`)
  logs.push(run(electronBuilder.command, electronBuilder.args, repoRoot))
  return logs.join('\n')
}

function runPublish(args, repoRoot) {
  const env = {}
  if (args.sshPassword) {
    env.ORCA_RELEASE_SSH_PASSWORD = args.sshPassword
  }
  return run(
    process.env.ORCA_RELEASE_NODE || 'node',
    [
      'config/scripts/publish-orca-desktop-release.mjs',
      '--skip-build',
      '--mac-app',
      args.macAppPath,
      '--windows-exe',
      args.windowsExePath,
      '--remote',
      args.remote || DEFAULT_REMOTE,
      '--remote-dir',
      args.remoteDir || DEFAULT_REMOTE_DIR,
      '--notes',
      args.notes || ''
    ],
    repoRoot,
    { env }
  )
}

function runRemoteCleanup(args, repoRoot, version) {
  const remote = args.remote || DEFAULT_REMOTE
  const remoteDir = args.remoteDir || DEFAULT_REMOTE_DIR
  const script = [
    'python3 - << "PY"',
    'from pathlib import Path',
    'import shutil',
    `root = Path(${JSON.stringify(`${remoteDir}/releases`)})`,
    `keep = ${JSON.stringify(version)}`,
    'for path in root.iterdir():',
    '    if path.is_dir() and path.name != keep:',
    '        print(f"removing {path.name}")',
    '        shutil.rmtree(path)',
    'PY'
  ].join('\n')
  const baseArgs = [
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'UserKnownHostsFile=/dev/null',
    '-o',
    'PreferredAuthentications=password',
    '-o',
    'PubkeyAuthentication=no',
    remote,
    script
  ]
  const env = {}
  const command = args.sshPassword ? 'sshpass' : 'ssh'
  const commandArgs = args.sshPassword ? ['-p', args.sshPassword, 'ssh', ...baseArgs] : baseArgs
  return run(command, commandArgs, repoRoot, { env })
}

async function moveOldLocalReleasesToTrash(repoRoot, version) {
  const root = path.join(repoRoot, 'dist', 'orca-desktop-release')
  if (!existsSync(root)) {
    return ''
  }
  const trashRoot =
    platform() === 'darwin'
      ? path.join(homedir(), '.Trash', `orca-release-publisher-${Date.now()}`)
      : path.join(tmpdir(), `orca-release-publisher-trash-${Date.now()}`)
  const moved = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === version) {
      continue
    }
    const source = path.join(root, entry.name)
    const target = path.join(trashRoot, 'dist', 'orca-desktop-release', entry.name)
    await mkdir(path.dirname(target), { recursive: true })
    await rename(source, target)
    moved.push(`${source} -> ${target}`)
  }
  return moved.join('\n')
}

async function publishRelease(args) {
  const repoRoot = resolveRepoRoot(args.repoRoot)
  const version = readPackageJson(repoRoot).version ?? ''
  const output = [runPublish(args, repoRoot)]
  if (args.cleanOldReleases) {
    output.push(runRemoteCleanup(args, repoRoot, version))
  }
  if (args.cleanLocalOldReleases) {
    output.push(await moveOldLocalReleasesToTrash(repoRoot, version))
  }
  output.push(`Windows SHA256: ${sha256(args.windowsExePath)}`)
  return {
    version,
    macosUrl: `${DOWNLOAD_BASE_URL}/macos`,
    windowsUrl: `${DOWNLOAD_BASE_URL}/windows`,
    output: output.filter(Boolean).join('\n'),
    status: await getStatus(repoRoot)
  }
}

function triggerWindowsCi(repoRoot) {
  const branch = runText('git', ['branch', '--show-current'], repoRoot)
  if (!branch) {
    throw new Error('当前不是普通分支，无法自动触发 Windows CI。')
  }
  const output = run(
    'gh',
    ['workflow', 'run', 'win-update-survival-e2e.yml', '--ref', branch],
    repoRoot
  )
  return { branch, output }
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === 'GET' && pathname === '/api/status') {
      const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)
      jsonResponse(res, 200, await getStatus(url.searchParams.get('repoRoot') || undefined))
      return
    }
    if (req.method === 'POST' && pathname === '/api/build-macos') {
      const body = await readBody(req)
      const repoRoot = resolveRepoRoot(body.repoRoot)
      const output = buildMacApp(repoRoot)
      jsonResponse(res, 200, { output, status: await getStatus(repoRoot) })
      return
    }
    if (req.method === 'POST' && pathname === '/api/trigger-windows-ci') {
      const body = await readBody(req)
      const repoRoot = resolveRepoRoot(body.repoRoot)
      jsonResponse(res, 200, triggerWindowsCi(repoRoot))
      return
    }
    if (req.method === 'POST' && pathname === '/api/publish') {
      jsonResponse(res, 200, await publishRelease(await readBody(req)))
      return
    }
    jsonResponse(res, 404, { error: 'Not found' })
  } catch (error) {
    jsonResponse(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
}

function pageHtml() {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Orca Release Publisher</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 56px; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    p { margin: 0; color: color-mix(in srgb, CanvasText 68%, Canvas); }
    section { margin-top: 18px; border: 1px solid color-mix(in srgb, CanvasText 18%, Canvas); border-radius: 10px; padding: 16px; }
    .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    label { display: grid; gap: 6px; font-size: 12px; font-weight: 600; }
    input, textarea { box-sizing: border-box; width: 100%; border: 1px solid color-mix(in srgb, CanvasText 20%, Canvas); border-radius: 8px; padding: 9px 10px; background: Canvas; color: CanvasText; font: inherit; }
    textarea { min-height: 72px; resize: vertical; }
    button { border: 1px solid color-mix(in srgb, CanvasText 20%, Canvas); border-radius: 8px; padding: 9px 12px; background: Canvas; color: CanvasText; font: inherit; cursor: pointer; }
    button.primary { background: CanvasText; color: Canvas; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    pre { white-space: pre-wrap; word-break: break-word; max-height: 340px; overflow: auto; border-radius: 8px; padding: 12px; background: color-mix(in srgb, CanvasText 7%, Canvas); }
    .muted { color: color-mix(in srgb, CanvasText 62%, Canvas); }
    .pill { display: inline-flex; border: 1px solid color-mix(in srgb, CanvasText 18%, Canvas); border-radius: 999px; padding: 2px 8px; font-size: 12px; }
    .artifact { border-top: 1px solid color-mix(in srgb, CanvasText 12%, Canvas); padding: 10px 0; }
    .artifact:first-child { border-top: 0; padding-top: 0; }
    .warn { color: #b45309; }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<main>
  <h1>Orca Release Publisher</h1>
  <p>独立的本地构建、打包、发布工具。不属于 Orca app 设置页。</p>

  <section class="grid">
    <label>Repo root <input id="repoRoot" /></label>
    <label>SSH password <input id="sshPassword" type="password" placeholder="留空则使用 SSH key" /></label>
    <label class="grid" style="grid-column: 1 / -1;">Release notes <textarea id="notes">Release Orca desktop build.</textarea></label>
  </section>

  <section>
    <div class="row">
      <button id="refresh">刷新状态</button>
      <button id="buildMac">构建 macOS app</button>
      <button id="triggerWin">触发 Windows CI</button>
      <button id="publish" class="primary">发布到服务器</button>
      <span id="busy" class="muted"></span>
    </div>
  </section>

  <section>
    <div id="summary" class="grid"></div>
    <div id="warnings"></div>
  </section>

  <section class="grid">
    <div>
      <h3>macOS candidates</h3>
      <div id="macCandidates"></div>
    </div>
    <div>
      <h3>Windows candidates</h3>
      <div id="windowsCandidates"></div>
    </div>
  </section>

  <section>
    <h3>Output</h3>
    <pre id="output">Ready.</pre>
  </section>
</main>
<script>
let status = null
const el = (id) => document.getElementById(id)
const setBusy = (text) => { el('busy').textContent = text; for (const id of ['refresh','buildMac','triggerWin','publish']) el(id).disabled = Boolean(text) }
const post = async (url, body) => {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = await response.json()
  if (!response.ok || json.error) throw new Error(json.error || response.statusText)
  return json
}
const fmt = (size) => size ? ((size / 1024 / 1024).toFixed(size > 100 * 1024 * 1024 ? 0 : 1) + ' MB') : ''
const artifactHtml = (a) => '<div class="artifact"><span class="pill">' + a.status + '</span> <span class="muted">' + (a.version || '') + ' ' + fmt(a.size) + '</span><br><code>' + a.path + '</code></div>'
async function refresh() {
  setBusy('刷新中...')
  try {
    const repo = encodeURIComponent(el('repoRoot').value)
    status = await (await fetch('/api/status?repoRoot=' + repo)).json()
    if (status.error) throw new Error(status.error)
    el('repoRoot').value = status.repoRoot
    el('summary').innerHTML =
      '<div><b>Version</b><br><span class="muted">' + status.version + '</span></div>' +
      '<div><b>Branch</b><br><span class="muted">' + (status.branch || 'detached') + ' · ' + status.headSha.slice(0, 10) + '</span></div>' +
      '<div><b>Working tree</b><br><span class="muted">' + (status.isDirty ? 'Dirty' : 'Clean') + '</span></div>' +
      '<div><b>Server latest</b><br><span class="muted">' + (status.remoteLatest?.version || 'Unavailable') + '</span></div>'
    el('warnings').innerHTML = status.warnings.map((w) => '<p class="warn">' + w + '</p>').join('')
    el('macCandidates').innerHTML = status.macCandidates.map(artifactHtml).join('')
    el('windowsCandidates').innerHTML = status.windowsCandidates.map(artifactHtml).join('')
  } catch (error) {
    el('output').textContent = error.message
  } finally {
    setBusy('')
  }
}
el('refresh').onclick = refresh
el('buildMac').onclick = async () => {
  setBusy('构建 macOS 中...')
  try {
    const result = await post('/api/build-macos', { repoRoot: el('repoRoot').value })
    status = result.status
    el('output').textContent = result.output
    await refresh()
  } catch (error) { el('output').textContent = error.message } finally { setBusy('') }
}
el('triggerWin').onclick = async () => {
  setBusy('触发 Windows CI...')
  try {
    const result = await post('/api/trigger-windows-ci', { repoRoot: el('repoRoot').value })
    el('output').textContent = 'Triggered Windows CI on ' + result.branch + '\\n' + result.output
  } catch (error) { el('output').textContent = error.message } finally { setBusy('') }
}
el('publish').onclick = async () => {
  if (!status?.selectedMacAppPath || !status?.selectedWindowsExePath) {
    el('output').textContent = '缺少 ready macOS app 或 Windows installer。'
    return
  }
  setBusy('发布中...')
  try {
    const result = await post('/api/publish', {
      repoRoot: el('repoRoot').value,
      macAppPath: status.selectedMacAppPath,
      windowsExePath: status.selectedWindowsExePath,
      sshPassword: el('sshPassword').value,
      notes: el('notes').value,
      cleanOldReleases: true,
      cleanLocalOldReleases: true
    })
    status = result.status
    el('output').textContent = result.output + '\\nmacOS: ' + result.macosUrl + '\\nWindows: ' + result.windowsUrl
    await refresh()
  } catch (error) { el('output').textContent = error.message } finally { setBusy('') }
}
refresh()
</script>
</body>
</html>`
}

const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? '/', `http://${HOST}:${PORT}`).pathname
  if (pathname.startsWith('/api/')) {
    void handleApi(req, res, pathname)
    return
  }
  htmlResponse(res, pageHtml())
})

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`
  console.log(`Orca Release Publisher: ${url}`)
  if (process.env.ORCA_RELEASE_PUBLISHER_NO_OPEN !== '1') {
    const opener = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'cmd' : 'xdg-open'
    const args = platform() === 'win32' ? ['/c', 'start', '', url] : [url]
    spawn(opener, args, { detached: true, stdio: 'ignore' }).unref()
  }
})
