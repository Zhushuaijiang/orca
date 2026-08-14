import type { ProcessTableRow } from './process-table-snapshot'

export type AgentSessionLockHolder = {
  pid: number
  ppid: number
  command: string
}

/**
 * Match process-table rows whose command line references the given session ID.
 * Works for any agent (codex, claude, gemini, etc.) — session IDs are UUIDs
 * unique enough to avoid false positives.
 */
export function matchAgentSessionLockHolders(
  rows: readonly ProcessTableRow[],
  sessionId: string
): AgentSessionLockHolder[] {
  if (!sessionId || sessionId.length < 8) {
    return []
  }
  return rows
    .filter((row) => row.command.includes(sessionId))
    .map((row) => ({ pid: row.pid, ppid: row.ppid, command: row.command }))
}
