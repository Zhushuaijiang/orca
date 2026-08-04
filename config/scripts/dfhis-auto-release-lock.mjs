// Liveness tracking for the dfhis auto-release pipeline lock dir. The lock is
// a plain directory (atomic mkdir), so a crashed or killed run would leave it
// behind forever and block every later trigger. lock.json pins the owning pid;
// a lock whose pid is gone (or whose ps entry is not the pipeline) is stale
// and may be cleared. A pid+command check is used instead of a timer
// heartbeat because the pipeline blocks the event loop with spawnSync builds
// for minutes at a time.

import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const LOCK_INFO_FILE = 'lock.json'
// Why: between `mkdir(lockDir)` and writing lock.json there is a brief window
// where the dir has no info file; only treat such a dir as stale once it is
// clearly older than any in-flight writer.
const INFO_WRITE_GRACE_MS = 60 * 1000

export function writeLockInfo(lockDir, pid) {
  writeFileSync(
    path.join(lockDir, LOCK_INFO_FILE),
    `${JSON.stringify({ pid, startedAt: new Date().toISOString() })}\n`
  )
}

function readLockInfo(lockDir) {
  try {
    return JSON.parse(readFileSync(path.join(lockDir, LOCK_INFO_FILE), 'utf8'))
  } catch {
    return null
  }
}

function isPipelinePidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
  } catch (error) {
    if (error?.code === 'ESRCH') {
      return false
    }
  }
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
    encoding: 'utf8'
  })
  return result.status === 0 && (result.stdout ?? '').includes('dfhis-auto-release')
}

export function isLockProcessAlive(lockDir) {
  const info = readLockInfo(lockDir)
  if (!info) {
    try {
      return Date.now() - statSync(lockDir).mtimeMs < INFO_WRITE_GRACE_MS
    } catch {
      return false
    }
  }
  return isPipelinePidAlive(info.pid)
}

export function clearStaleLock(lockDir) {
  rmSync(lockDir, { recursive: true, force: true })
}
