#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir, rename } from 'node:fs/promises'
import { createServer } from 'node:http'
import { pageHtml } from './orca-release-publisher-page.mjs'
import { readAutoRelease, startAutoRelease } from './orca-release-publisher-auto-release.mjs'
import {
  commitAndPushReleaseVersion,
  prepareNextReleaseVersion,
  versionGreaterThan
} from './orca-release-versioning.mjs'
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

function isElectronProcess() {
  return Boolean(process.versions.electron)
}

function resolveElectronBinary() {
  const binaryName = platform() === 'win32' ? 'electron.cmd' : 'electron'
  return path.join(DEFAULT_REPO_ROOT, 'node_modules', '.bin', binaryName)
}

function launchElectronApp() {
  const electronBinary = resolveElectronBinary()
  if (!existsSync(electronBinary)) {
    throw new Error('Electron binary not found. Run pnpm install before opening the publisher app.')
  }
  const child = spawn(electronBinary, [import.meta.filename], {
    cwd: DEFAULT_REPO_ROOT,
    detached: true,
    env: {
      ...process.env,
      ORCA_RELEASE_PUBLISHER_ELECTRON: '1'
    },
    stdio: 'ignore'
  })
  child.unref()
}

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

function parseRemoteLatestJson(json) {
  return {
    version: json.version,
    publishedAt: json.published_at,
    macSha256: json.downloads?.macos?.sha256,
    windowsSha256: json.downloads?.windows?.sha256
  }
}

function remoteLatestViaSsh({
  repoRoot,
  remote = DEFAULT_REMOTE,
  remoteDir = DEFAULT_REMOTE_DIR,
  sshPassword
}) {
  if (!sshPassword && !process.env.ORCA_RELEASE_SSH_PASSWORD) {
    return undefined
  }
  const password = sshPassword || process.env.ORCA_RELEASE_SSH_PASSWORD
  const commandArgs = [
    '-p',
    password,
    'ssh',
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'UserKnownHostsFile=/dev/null',
    '-o',
    'PreferredAuthentications=password',
    '-o',
    'PubkeyAuthentication=no',
    remote,
    `cat ${JSON.stringify(`${remoteDir}/latest.json`)}`
  ]
  try {
    const result = spawnSync('sshpass', commandArgs, {
      cwd: repoRoot,
      env: process.env,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024
    })
    if (result.status !== 0) {
      return undefined
    }
    return parseRemoteLatestJson(JSON.parse(result.stdout))
  } catch {
    return undefined
  }
}

async function remoteLatest(options) {
  const sshLatest = remoteLatestViaSsh(options)
  if (sshLatest) {
    return sshLatest
  }
  try {
    const response = await fetch(`${DOWNLOAD_BASE_URL}/latest.json`, { cache: 'no-store' })
    if (!response.ok) {
      return undefined
    }
    return parseRemoteLatestJson(await response.json())
  } catch {
    return undefined
  }
}

async function getStatus(repoRootInput, options = {}) {
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
  const latest = await remoteLatest({ ...options, repoRoot })
  if (latest?.version && !versionGreaterThan(version, latest.version)) {
    warnings.push(
      version === latest.version
        ? `当前版本 ${version} 已经是服务器 latest；再次发布前应先准备下一版。`
        : `当前版本 ${version} 低于服务器 latest ${latest.version}，发布前应先自动升版。`
    )
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
    remoteLatest: latest,
    autoRelease: readAutoRelease(repoRoot),
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

async function prepareRelease(args, { commitAndPush = false, force = false } = {}) {
  const repoRoot = resolveRepoRoot(args.repoRoot)
  const latest = await remoteLatest({
    repoRoot,
    sshPassword: args.sshPassword
  })
  const result = await prepareNextReleaseVersion(repoRoot, latest?.version, { force })
  const output = [result.output]
  if (result.changed && commitAndPush) {
    output.push(commitAndPushReleaseVersion(repoRoot, result.nextVersion))
  }
  return {
    ...result,
    output: output.join('\n'),
    status: await getStatus(repoRoot, { sshPassword: args.sshPassword })
  }
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
  const latest = await remoteLatest({
    repoRoot,
    sshPassword: args.sshPassword
  })
  if (latest?.version && !versionGreaterThan(version, latest.version)) {
    throw new Error(`当前版本 ${version} 不高于服务器 latest ${latest.version}，请先准备下一版。`)
  }
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

async function triggerWindowsCi(args) {
  const repoRoot = resolveRepoRoot(args.repoRoot)
  const prepareOutput = await prepareRelease(args, { commitAndPush: true })
  const branch = runText('git', ['branch', '--show-current'], repoRoot)
  if (!branch) {
    throw new Error('当前不是普通分支，无法自动触发 Windows CI。')
  }
  const output = run(
    'gh',
    ['workflow', 'run', 'win-update-survival-e2e.yml', '--ref', branch],
    repoRoot
  )
  return { branch, output: `${prepareOutput.output}\n${output}` }
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === 'GET' && pathname === '/api/status') {
      const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)
      jsonResponse(
        res,
        200,
        await getStatus(url.searchParams.get('repoRoot') || undefined, {
          sshPassword: url.searchParams.get('sshPassword') || undefined
        })
      )
      return
    }
    if (req.method === 'POST' && pathname === '/api/build-macos') {
      const body = await readBody(req)
      const repoRoot = resolveRepoRoot(body.repoRoot)
      const prepared = await prepareRelease(body)
      const output = `${prepared.output}\n${buildMacApp(repoRoot)}`
      jsonResponse(res, 200, { output, status: await getStatus(repoRoot) })
      return
    }
    if (req.method === 'POST' && pathname === '/api/prepare-release') {
      jsonResponse(res, 200, await prepareRelease(await readBody(req), { force: true }))
      return
    }
    if (req.method === 'POST' && pathname === '/api/trigger-windows-ci') {
      jsonResponse(res, 200, await triggerWindowsCi(await readBody(req)))
      return
    }
    if (req.method === 'POST' && pathname === '/api/release-all') {
      const body = await readBody(req)
      jsonResponse(
        res,
        200,
        startAutoRelease({
          repoRoot: resolveRepoRoot(body.repoRoot),
          sshPassword: body.sshPassword
        })
      )
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

const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? '/', `http://${HOST}:${PORT}`).pathname
  if (pathname.startsWith('/api/')) {
    void handleApi(req, res, pathname)
    return
  }
  htmlResponse(res, pageHtml())
})

function startServer() {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(PORT, HOST, () => {
      resolve(`http://${HOST}:${PORT}`)
    })
  })
}

let mainWindow = null

async function openElectronWindow(url) {
  const { app, BrowserWindow } = await import('electron')
  app.setName('Orca Release Publisher')
  // Why: the server binds a fixed port, so a second launch would crash with
  // EADDRINUSE. Single-instance: re-launching just focuses the open window.
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
  })
  await app.whenReady()
  const window = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 860,
    minHeight: 620,
    title: 'Orca Release Publisher',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWindow = window
  await window.loadURL(url)
  window.setTitle('Orca Release Publisher')
  window.webContents.on('page-title-updated', (event) => {
    event.preventDefault()
    window.setTitle('Orca Release Publisher')
  })
  window.on('closed', () => {
    mainWindow = null
    server.close()
  })
  app.on('window-all-closed', () => {
    app.quit()
  })
}

async function main() {
  if (!isElectronProcess() && process.env.ORCA_RELEASE_PUBLISHER_SERVER_ONLY !== '1') {
    launchElectronApp()
    return
  }

  let url = `http://${HOST}:${PORT}`
  try {
    url = await startServer()
    console.log(`Orca Release Publisher: ${url}`)
  } catch (error) {
    // Why: a leftover publisher process may already hold the port; reuse it
    // instead of crashing with an EADDRINUSE dialog.
    if (!String(error).includes('EADDRINUSE')) {
      throw error
    }
    console.log(`Orca Release Publisher already running: ${url}`)
  }
  if (isElectronProcess()) {
    await openElectronWindow(url)
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
