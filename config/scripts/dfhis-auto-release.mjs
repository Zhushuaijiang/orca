#!/usr/bin/env node

// DFHIS desktop auto-release pipeline: version bump -> push -> Windows CI ->
// macOS build -> publish to the download server. Invoked by .husky/post-commit
// (--from-hook) and by the release publisher UI (/api/release-all).
//
// Guards: darwin only, expected branch only, skips its own version-bump
// commits, single instance via lock dir. Disable the hook with
// ORCA_AUTO_RELEASE_DISABLED=1; override the branch with ORCA_AUTO_RELEASE_BRANCH.

import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import {
  commitAndPushReleaseVersion,
  prepareNextReleaseVersion
} from './orca-release-versioning.mjs'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..')
const DEFAULT_BRANCH = 'codex/windows-dfhis-setup-rc5'
const WINDOWS_WORKFLOW = 'win-update-survival-e2e.yml'
const WINDOWS_ARTIFACT_PREFIX = 'orca-windows-setup-'
const DOWNLOAD_BASE_URLS = [
  'http://192.168.1.10:18800/static/downloads/orca',
  'http://192.168.1.10:18800/downloads/orca'
]
const REMOTE = process.env.ORCA_RELEASE_REMOTE || 'root@192.168.1.10'
const REMOTE_DIR =
  process.env.ORCA_RELEASE_REMOTE_DIR ||
  '/opt/workspace/github/hermes-agent-260623/bot_manager/static/downloads/orca'
const OUT_DIR = path.join(REPO_ROOT, 'out')
const LOCK_DIR = path.join(OUT_DIR, 'dfhis-auto-release.lock')
const PENDING_FILE = path.join(OUT_DIR, 'dfhis-auto-release.pending')
const STATUS_FILE = path.join(OUT_DIR, 'dfhis-auto-release-status.json')
const LOG_FILE = path.join(OUT_DIR, 'dfhis-auto-release.log')
const CI_APPEAR_TIMEOUT_MS = 10 * 60 * 1000
const CI_COMPLETE_TIMEOUT_MS = 80 * 60 * 1000
const CI_POLL_INTERVAL_MS = 90 * 1000
const MAX_CHAIN_RUNS = 3
// Why: the pipeline commits its own version bump; without this guard the
// post-commit hook would retrigger itself forever.
const RELEASE_COMMIT_PATTERN = /^chore(\(release\))?: (prepare|bump)\b/

const fromHook = process.argv.includes('--from-hook')
const dryRun = process.argv.includes('--dry-run')

// Why: hooks and detached UI runs inherit no shell env, so the SSH password
// lives in a git-ignored repo-local file: .dfhis-auto-release.env
async function loadLocalEnvFile() {
  const envFile = path.join(REPO_ROOT, '.dfhis-auto-release.env')
  let content = ''
  try {
    content = await readFile(envFile, 'utf8')
  } catch {
    return
  }
  for (const line of content.split('\n')) {
    const match = /^\s*(ORCA_[A-Z_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2]
    }
  }
}

async function logLine(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  await appendFile(LOG_FILE, line).catch(() => {})
  if (!fromHook) {
    process.stdout.write(line)
  }
}

async function writeStatus(patch) {
  let current = {}
  try {
    current = JSON.parse(await readFile(STATUS_FILE, 'utf8'))
  } catch {
    // first write
  }
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
  await writeFile(STATUS_FILE, `${JSON.stringify(next, null, 2)}\n`)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status}): ${output.slice(-2000)}`
    )
  }
  return output.trim()
}

function runText(command, args) {
  try {
    return run(command, args)
  } catch {
    return ''
  }
}

function pnpmArgs(args) {
  if (runText('pnpm', ['--version'])) {
    return { command: 'pnpm', args }
  }
  return { command: 'npx', args: ['--yes', 'pnpm@10.24.0', ...args] }
}

async function runLogged(command, args, options = {}) {
  await logLine(`$ ${command} ${args.join(' ')}`)
  const output = run(command, args, options)
  await logLine(output.slice(-4000) || '(no output)')
  return output
}

async function remoteLatestVersion() {
  if (process.env.ORCA_RELEASE_SSH_PASSWORD) {
    const viaSsh = runText('sshpass', [
      '-e',
      'ssh',
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      REMOTE,
      `cat ${JSON.stringify(`${REMOTE_DIR}/latest.json`)}`
    ])
    try {
      return JSON.parse(viaSsh).version
    } catch {
      // fall through to HTTP
    }
  }
  for (const base of DOWNLOAD_BASE_URLS) {
    try {
      const response = await fetch(`${base}/latest.json`, { cache: 'no-store' })
      if (response.ok) {
        return (await response.json()).version
      }
    } catch {
      // try next base URL
    }
  }
  return undefined
}

async function findWindowsCiRun(sha, deadline) {
  while (Date.now() < deadline) {
    const output = runText('gh', [
      'run',
      'list',
      '--branch',
      currentBranch(),
      '--workflow',
      WINDOWS_WORKFLOW,
      '--json',
      'databaseId,headSha,status,conclusion',
      '--limit',
      '10'
    ])
    try {
      const run_ = JSON.parse(output).find((candidate) => candidate.headSha === sha)
      if (run_) {
        return run_
      }
    } catch {
      // gh hiccup; retry
    }
    await new Promise((resolve) => setTimeout(resolve, 15000))
  }
  throw new Error(`Windows CI run for ${sha.slice(0, 10)} did not appear in time.`)
}

async function waitWindowsCiRun(runId, sha) {
  const deadline = Date.now() + CI_COMPLETE_TIMEOUT_MS
  let run_ = { status: 'queued' }
  while (Date.now() < deadline) {
    const output = runText('gh', [
      'run',
      'view',
      String(runId),
      '--json',
      'databaseId,status,conclusion'
    ])
    try {
      run_ = JSON.parse(output)
      if (run_.status === 'completed') {
        if (run_.conclusion !== 'success') {
          throw new Error(`Windows CI run ${runId} concluded ${run_.conclusion}.`)
        }
        return
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        // gh hiccup; retry
      } else {
        throw error
      }
    }
    await new Promise((resolve) => setTimeout(resolve, CI_POLL_INTERVAL_MS))
  }
  throw new Error(`Windows CI run ${runId} for ${sha.slice(0, 10)} timed out.`)
}

let cachedBranch = null
function currentBranch() {
  cachedBranch ??= runText('git', ['branch', '--show-current'])
  return cachedBranch
}

async function buildMacApp() {
  for (const args of [
    ['run', 'build:desktop'],
    ['run', 'build:computer-macos'],
    ['run', 'build:notification-status-macos'],
    ['run', 'ensure:electron-runtime']
  ]) {
    const pnpm = pnpmArgs(args)
    await runLogged(pnpm.command, pnpm.args)
  }
  const builder = pnpmArgs([
    'exec',
    'electron-builder',
    '--config',
    'config/electron-builder.config.cjs',
    '--mac',
    'dir',
    '--arm64'
  ])
  await runLogged(builder.command, builder.args)
}

async function releaseOnce(chainIndex) {
  const latest = await remoteLatestVersion()
  await logLine(`Server latest: ${latest ?? 'unavailable'}`)
  const prepared = await prepareNextReleaseVersion(REPO_ROOT, latest, { force: true })
  await logLine(prepared.output)
  if (prepared.changed && !dryRun) {
    await logLine(commitAndPushReleaseVersion(REPO_ROOT, prepared.nextVersion))
  }
  const version = prepared.nextVersion
  const sha = runText('git', ['rev-parse', 'HEAD'])
  await writeStatus({ state: 'running', step: 'windows-ci-trigger', version, sha, chainIndex })
  if (dryRun) {
    await logLine(`[dry-run] would release ${version} from ${sha.slice(0, 10)}`)
    return { version, sha, released: false }
  }

  await runLogged('gh', [
    'workflow',
    'run',
    WINDOWS_WORKFLOW,
    '--ref',
    currentBranch(),
    '-f',
    'expect=survival'
  ])
  await writeStatus({ step: 'windows-ci-wait' })
  const ciRun = await findWindowsCiRun(sha, Date.now() + CI_APPEAR_TIMEOUT_MS)
  await logLine(`Windows CI run ${ciRun.databaseId} queued for ${sha.slice(0, 10)}`)
  await writeStatus({ step: 'windows-ci-wait', windowsRunId: ciRun.databaseId })
  await waitWindowsCiRun(ciRun.databaseId, sha)
  await logLine(`Windows CI run ${ciRun.databaseId} succeeded`)

  await writeStatus({ step: 'windows-artifact-download' })
  const windowsDir = path.join('dist', `windows-installer-${ciRun.databaseId}-auto`)
  await runLogged('gh', [
    'run',
    'download',
    String(ciRun.databaseId),
    '--name',
    `${WINDOWS_ARTIFACT_PREFIX}${ciRun.databaseId}`,
    '--dir',
    windowsDir
  ])
  const windowsExe = path.join(REPO_ROOT, windowsDir, 'orca-windows-setup.exe')
  if (!existsSync(windowsExe)) {
    throw new Error(`Windows installer missing after download: ${windowsExe}`)
  }

  await writeStatus({ step: 'macos-build' })
  await buildMacApp()

  await writeStatus({ step: 'publish' })
  await runLogged(
    process.execPath,
    [
      'config/scripts/publish-orca-desktop-release.mjs',
      '--skip-build',
      '--windows-exe',
      windowsExe,
      '--notes',
      `DFHIS auto release ${version} from ${sha.slice(0, 10)}; Windows CI run ${ciRun.databaseId} passed update-survival E2E.`
    ],
    { env: { ORCA_RELEASE_SSH_PASSWORD: process.env.ORCA_RELEASE_SSH_PASSWORD } }
  )
  await logLine(`Published ${version}`)
  return { version, sha, released: true }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  await loadLocalEnvFile()
  await logLine(`auto-release triggered (hook=${fromHook}, dryRun=${dryRun})`)

  if (process.platform !== 'darwin') {
    await logLine('skip: macOS build requires darwin')
    return
  }
  const expectedBranch = process.env.ORCA_AUTO_RELEASE_BRANCH || DEFAULT_BRANCH
  if (expectedBranch !== 'any' && currentBranch() !== expectedBranch) {
    await logLine(`skip: branch ${currentBranch() || 'detached'} != ${expectedBranch}`)
    await writeStatus({ state: 'skipped', reason: `branch != ${expectedBranch}` })
    return
  }
  const headSubject = runText('git', ['log', '-1', '--format=%s'])
  if (RELEASE_COMMIT_PATTERN.test(headSubject)) {
    await logLine(`skip: release commit "${headSubject}"`)
    await writeStatus({ state: 'skipped', reason: `release commit: ${headSubject}` })
    return
  }
  if (!process.env.ORCA_RELEASE_SSH_PASSWORD) {
    await logLine('skip: ORCA_RELEASE_SSH_PASSWORD is not set')
    await writeStatus({ state: 'skipped', reason: 'missing ssh password' })
    return
  }
  try {
    await mkdir(LOCK_DIR)
  } catch {
    // Why: hook fires while a run holds the lock would lose this commit, so
    // queue a pending marker; the active run re-spawns for it when done.
    await writeFile(PENDING_FILE, `${new Date().toISOString()}\n`).catch(() => {})
    await logLine('skip: another auto-release run holds the lock (queued as pending)')
    return
  }

  let releasedSha = null
  try {
    let chainIndex = 0
    await writeStatus({
      state: 'running',
      step: 'prepare',
      reason: undefined,
      error: undefined,
      releasedSha: undefined
    })
    while (chainIndex < MAX_CHAIN_RUNS) {
      const result = await releaseOnce(chainIndex)
      releasedSha = result.sha
      if (!result.released || dryRun) {
        break
      }
      // Why: commits pushed while a run was in flight never got their own
      // trigger; chain one follow-up release so no commit is left unpublished.
      const localHead = runText('git', ['rev-parse', 'HEAD'])
      if (localHead !== releasedSha) {
        runText('git', ['push', 'origin', currentBranch()])
      }
      runText('git', ['fetch', 'origin', currentBranch()])
      const remoteHead = runText('git', ['rev-parse', `origin/${currentBranch()}`])
      if (
        runText('git', ['rev-parse', 'HEAD']) === releasedSha &&
        remoteHead !== releasedSha &&
        remoteHead
      ) {
        runText('git', ['pull', '--rebase', 'origin', currentBranch()])
      }
      if (runText('git', ['rev-parse', 'HEAD']) === releasedSha) {
        break
      }
      chainIndex += 1
      await logLine(`chaining release for new commits (run ${chainIndex + 1})`)
    }
    await writeStatus({ state: dryRun ? 'dry-run' : 'published', step: 'done', releasedSha })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await logLine(`FAILED: ${message}`)
    await writeStatus({ state: 'failed', error: message })
    if (!fromHook) {
      process.exitCode = 1
    }
  } finally {
    await rmdir(LOCK_DIR).catch(() => {})
  }

  // Why: chain count is capped, so commits beyond the cap rely on the pending
  // marker left by their hook runs; hand off to a fresh process for them.
  const headAfter = runText('git', ['rev-parse', 'HEAD'])
  if (!dryRun && existsSync(PENDING_FILE) && headAfter && headAfter !== releasedSha) {
    await rm(PENDING_FILE, { force: true }).catch(() => {})
    const child = spawn(process.execPath, [import.meta.filename, '--from-hook'], {
      cwd: REPO_ROOT,
      detached: true,
      stdio: 'ignore',
      env: process.env
    })
    child.unref()
    await logLine('pending commits found; handed off to a follow-up run')
  }
}

void main()
