import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

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
  return { ...status, logTail }
}

export function startAutoRelease({ repoRoot, sshPassword }) {
  const lockDir = path.join(repoRoot, 'out', 'dfhis-auto-release.lock')
  if (existsSync(lockDir)) {
    throw new Error('自动发布流水线正在运行中，请等待当前运行结束。')
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
