import { inspectRuntimeTerminalProcess } from '@/runtime/runtime-terminal-inspection'
import { isExpectedAgentProcess } from '../../../shared/agent-process-recognition'

/** Polls the PTY's foreground process until the expected agent owns it or the budget expires. */
export async function waitForExpectedAgentOnPty(
  ptyId: string,
  expectedProcess: string,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const process = await withDeadline(
        inspectRuntimeTerminalProcess(ptyId),
        Math.max(0, deadline - Date.now())
      )
      if (!process) {
        return false
      }
      const foreground = process.foregroundProcess?.toLowerCase() ?? ''
      if (isExpectedAgentProcess(foreground, expectedProcess)) {
        return true
      }
    } catch {
      // Ignore transient PTY inspection failures and keep polling.
    }
    const delayMs = Math.min(120, Math.max(0, deadline - Date.now()))
    if (delayMs > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs))
    }
  }
  return false
}

function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  if (timeoutMs <= 0) {
    return Promise.resolve(null)
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => resolve(null), timeoutMs)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      }
    )
  })
}
