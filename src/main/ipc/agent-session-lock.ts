import { ipcMain } from 'electron'
import {
  findAgentSessionLockHolders,
  killAgentSessionLockHolder
} from '../agent-session-lock-release'

export function registerAgentSessionLockHandlers(): void {
  ipcMain.handle('agentSession:findLockHolders', (_event, sessionId: string) =>
    findAgentSessionLockHolders(sessionId)
  )
  ipcMain.handle('agentSession:killLockHolder', (_event, pid: number) =>
    killAgentSessionLockHolder(pid)
  )
}
