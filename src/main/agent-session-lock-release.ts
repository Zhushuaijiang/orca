import { spawn } from 'node:child_process'
import { getProcessTableSnapshot } from '../shared/process-table-snapshot'
import {
  matchAgentSessionLockHolders,
  type AgentSessionLockHolder
} from '../shared/agent-session-lock-release'

export async function findAgentSessionLockHolders(
  sessionId: string
): Promise<AgentSessionLockHolder[]> {
  if (!sessionId) {
    return []
  }
  const rows = await getProcessTableSnapshot()
  return matchAgentSessionLockHolders(rows, sessionId)
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function killAgentSessionLockHolder(pid: number): Promise<boolean> {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }
  if (pid === process.pid) {
    return false
  }

  // Graceful SIGTERM first.
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    return !isProcessAlive(pid)
  }
  await sleep(1000)
  if (!isProcessAlive(pid)) {
    return true
  }

  // Force kill — process tree on Windows, SIGKILL on POSIX.
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    })
  } else {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // ignore
    }
  }
  await sleep(500)
  return !isProcessAlive(pid)
}
