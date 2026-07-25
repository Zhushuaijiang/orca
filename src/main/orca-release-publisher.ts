import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import type {
  OrcaReleaseArtifact,
  OrcaReleasePublisherPublishArgs,
  OrcaReleasePublisherPublishResult,
  OrcaReleasePublisherStatus
} from '../shared/orca-release-publisher-types'

const DEFAULT_REMOTE = 'root@192.168.1.10'
const DEFAULT_REMOTE_DIR =
  '/opt/workspace/github/hermes-agent-260623/bot_manager/static/downloads/orca'
const DOWNLOAD_BASE_URL = 'http://192.168.1.10:18800/downloads/orca'

function runText(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    return ''
  }
  return result.stdout.trim()
}

function readPackageVersion(repoRoot: string): string {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    version?: string
  }
  return packageJson.version ?? ''
}

function isOrcaRepoRoot(candidate: string): boolean {
  const packageJsonPath = path.join(candidate, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return false
  }
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: string }
    return packageJson.name === 'orca'
  } catch {
    return false
  }
}

function resolveRepoRoot(input?: string): string {
  const candidates = [
    input,
    process.env.ORCA_RELEASE_REPO_ROOT,
    process.cwd(),
    path.join(homedir(), 'workspace', 'github', 'orca'),
    path.join(homedir(), 'workspace', 'orca')
  ].filter((candidate): candidate is string => Boolean(candidate))
  const repoRoot = candidates.find(isOrcaRepoRoot)
  if (!repoRoot) {
    throw new Error('Orca repository root was not found. Set the repo root in Release Publisher.')
  }
  return repoRoot
}

function fileInfo(filePath: string): Pick<OrcaReleaseArtifact, 'size' | 'mtimeMs'> {
  const info = statSync(filePath)
  return { size: info.size, mtimeMs: info.mtimeMs }
}

function macAppVersion(macApp: string, repoRoot: string): string {
  if (process.platform !== 'darwin') {
    return ''
  }
  const plist = path.join(macApp, 'Contents', 'Info.plist')
  return runText(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print :CFBundleShortVersionString', plist],
    repoRoot
  )
}

function macArtifact(
  repoRoot: string,
  candidatePath: string,
  expectedVersion: string
): OrcaReleaseArtifact {
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

function windowsArtifact(candidatePath: string): OrcaReleaseArtifact {
  if (!existsSync(candidatePath)) {
    return { path: candidatePath, kind: 'windows-exe', status: 'missing' }
  }
  return {
    path: candidatePath,
    kind: 'windows-exe',
    status: 'ready',
    ...fileInfo(candidatePath)
  }
}

function newestReady(candidates: OrcaReleaseArtifact[]): OrcaReleaseArtifact | undefined {
  return candidates
    .filter((candidate) => candidate.status === 'ready')
    .sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0))[0]
}

function windowsCandidates(repoRoot: string, version: string): OrcaReleaseArtifact[] {
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

async function remoteLatest(): Promise<OrcaReleasePublisherStatus['remoteLatest']> {
  try {
    const response = await fetch(`${DOWNLOAD_BASE_URL}/latest.json`, { cache: 'no-store' })
    if (!response.ok) {
      return undefined
    }
    const json = (await response.json()) as {
      version?: string
      published_at?: string
      downloads?: {
        macos?: { sha256?: string }
        windows?: { sha256?: string }
      }
    }
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

export async function getOrcaReleasePublisherStatus(
  repoRootInput?: string
): Promise<OrcaReleasePublisherStatus> {
  const repoRoot = resolveRepoRoot(repoRootInput)
  const version = readPackageVersion(repoRoot)
  const branch = runText('git', ['branch', '--show-current'], repoRoot)
  const headSha = runText('git', ['rev-parse', 'HEAD'], repoRoot)
  const isDirty = runText('git', ['status', '--porcelain'], repoRoot).length > 0
  const macCandidates = [
    macArtifact(repoRoot, path.join(repoRoot, 'dist', 'mac-arm64', 'Orca.app'), version),
    macArtifact(repoRoot, '/Applications/Orca.app', version)
  ]
  const windows = windowsCandidates(repoRoot, version)
  const warnings: string[] = []
  if (isDirty) {
    warnings.push('Working tree has uncommitted changes.')
  }
  if (!newestReady(macCandidates)) {
    warnings.push('No ready macOS app artifact for the current version.')
  }
  if (!newestReady(windows)) {
    warnings.push('No ready Windows installer artifact for the current version.')
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

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function runPublish(args: OrcaReleasePublisherPublishArgs, repoRoot: string): string {
  const env = { ...process.env }
  if (args.sshPassword) {
    env.ORCA_RELEASE_SSH_PASSWORD = args.sshPassword
  }
  const result = spawnSync(
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
    { cwd: repoRoot, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  )
  const output = `${result.stdout}${result.stderr}`
  if (result.status !== 0) {
    throw new Error(output || `Publish failed with exit code ${result.status}`)
  }
  return output
}

function runRemoteCleanup(
  args: OrcaReleasePublisherPublishArgs,
  repoRoot: string,
  version: string
): void {
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
    '        shutil.rmtree(path)',
    'PY'
  ].join('\n')
  const baseArgs = [
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'UserKnownHostsFile=/dev/null',
    remote,
    script
  ]
  const env = { ...process.env }
  const commandArgs = args.sshPassword ? ['-e', 'ssh', ...baseArgs] : baseArgs
  const command = args.sshPassword ? 'sshpass' : 'ssh'
  if (args.sshPassword) {
    env.SSHPASS = args.sshPassword
  }
  spawnSync(command, commandArgs, { cwd: repoRoot, env, encoding: 'utf8' })
}

async function cleanLocalOldReleaseDirs(repoRoot: string, version: string): Promise<void> {
  const root = path.join(repoRoot, 'dist', 'orca-desktop-release')
  if (!existsSync(root)) {
    return
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== version) {
      await rm(path.join(root, entry.name), { recursive: true, force: true })
    }
  }
}

export async function publishOrcaDesktopRelease(
  args: OrcaReleasePublisherPublishArgs
): Promise<OrcaReleasePublisherPublishResult> {
  const repoRoot = resolveRepoRoot(args.repoRoot)
  const version = readPackageVersion(repoRoot)
  const output = runPublish(args, repoRoot)
  if (args.cleanOldReleases) {
    runRemoteCleanup(args, repoRoot, version)
  }
  if (args.cleanLocalOldReleases) {
    await cleanLocalOldReleaseDirs(repoRoot, version)
  }
  return {
    version,
    macosUrl: `${DOWNLOAD_BASE_URL}/macos`,
    windowsUrl: `${DOWNLOAD_BASE_URL}/windows`,
    output: `${output}\nWindows SHA256: ${sha256(args.windowsExePath)}`,
    status: await getOrcaReleasePublisherStatus(repoRoot)
  }
}
