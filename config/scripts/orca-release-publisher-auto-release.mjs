import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { clearStaleLock, isLockProcessAlive } from './dfhis-auto-release-lock.mjs'

// Why: a status file that says "running" but has not been updated in this
// window, with no lock held, belongs to a run that died before writing its
// final state.
const STALE_RUNNING_GRACE_MS = 2 * 60 * 1000

function lockDirOf(repoRoot) {
  return path.join(repoRoot, 'out', 'dfhis-auto-release.lock')
}

export function readAutoRelease(repoRoot) {
  const statusPath = path.join(repoRoot, 'out', 'dfhis-auto-release-status.json')
  const logPath = path.join(repoRoot, 'out', 'dfhis-auto-release.log')
  let status = null
  try {
    status = JSON.parse(readFileSync(statusPath, 'utf8'))
  } catch {
    // no auto-release run yet
  }
  let logTail = ''
  try {
    const content = readFileSync(logPath, 'utf8')
    logTail = content.split('\n').slice(-30).join('\n')
  } catch {
    // no log yet
  }
  if (!status && !logTail) {
    return null
  }
  if (status?.state === 'running') {
    const lockDir = lockDirOf(repoRoot)
    const lockAlive = existsSync(lockDir) && isLockProcessAlive(lockDir)
    const lastUpdate = Date.parse(status.updatedAt ?? '')
    const silentTooLong = Number.isFinite(lastUpdate)
      ? Date.now() - lastUpdate > STALE_RUNNING_GRACE_MS
      : true
    if (!lockAlive && (existsSync(lockDir) || silentTooLong)) {
      status = {
        ...status,
        state: 'interrupted',
        error: status.error ?? '流水线进程已退出，状态停留在 running；可重新发起一键发布。'
      }
    }
  }
  return { ...status, logTail }
}

export function startAutoRelease({ repoRoot, sshPassword }) {
  const lockDir = lockDirOf(repoRoot)
  if (existsSync(lockDir)) {
    if (isLockProcessAlive(lockDir)) {
      return { started: false, alreadyRunning: true, autoRelease: readAutoRelease(repoRoot) }
    }
    clearStaleLock(lockDir)
  }
  const env = { ...process.env }
  if (sshPassword) {
    env.ORCA_RELEASE_SSH_PASSWORD = sshPassword
  }
  const child = spawn(process.execPath, ['config/scripts/dfhis-auto-release.mjs'], {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
    env
  })
  child.unref()
  return { started: true, pid: child.pid, autoRelease: readAutoRelease(repoRoot) }
}
