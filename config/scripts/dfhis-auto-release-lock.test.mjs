import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { clearStaleLock, isLockProcessAlive, writeLockInfo } from './dfhis-auto-release-lock.mjs'

const sandboxes = []

function makeLockDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'orca-release-lock-test-'))
  sandboxes.push(dir)
  const lockDir = path.join(dir, 'dfhis-auto-release.lock')
  mkdirSync(lockDir)
  return lockDir
}

function backdate(dir) {
  const old = new Date(Date.now() - 10 * 60 * 1000)
  utimesSync(dir, old, old)
}

afterEach(() => {
  while (sandboxes.length) {
    rmSync(sandboxes.pop(), { recursive: true, force: true })
  }
})

describe('dfhis-auto-release lock liveness', () => {
  it('treats a fresh lock dir without lock.json as an in-flight writer', () => {
    expect(isLockProcessAlive(makeLockDir())).toBe(true)
  })

  it('treats an old lock dir without lock.json as stale', () => {
    const lockDir = makeLockDir()
    backdate(lockDir)
    expect(isLockProcessAlive(lockDir)).toBe(false)
  })

  it('treats a lock whose pid is dead as stale', () => {
    const lockDir = makeLockDir()
    writeLockInfo(lockDir, 99999)
    expect(isLockProcessAlive(lockDir)).toBe(false)
  })

  it('treats a lock held by a live pipeline process as alive, then stale after exit', async () => {
    const lockDir = makeLockDir()
    const child = spawn(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 60000)', 'dfhis-auto-release'],
      { stdio: 'ignore' }
    )
    writeLockInfo(lockDir, child.pid)
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(isLockProcessAlive(lockDir)).toBe(true)
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
    expect(isLockProcessAlive(lockDir)).toBe(false)
  })

  it('ignores a live process that is not the pipeline', () => {
    const lockDir = makeLockDir()
    writeLockInfo(lockDir, process.pid)
    expect(isLockProcessAlive(lockDir)).toBe(false)
  })

  it('clearStaleLock removes the lock dir', () => {
    const lockDir = makeLockDir()
    writeFileSync(path.join(lockDir, 'lock.json'), '{}\n')
    clearStaleLock(lockDir)
    expect(isLockProcessAlive(lockDir)).toBe(false)
  })
})
