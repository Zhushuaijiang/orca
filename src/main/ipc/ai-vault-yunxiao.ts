import { ipcMain } from 'electron'
import { searchYunxiaoSessions } from '../ai-vault/yunxiao-requirement-index'

export function registerAiVaultYunxiaoHandlers(): void {
  ipcMain.handle('aiVault:searchYunxiaoSessions', (_event, args?: { yunxiaoId?: string }) =>
    searchYunxiaoSessions(typeof args?.yunxiaoId === 'string' ? args.yunxiaoId.slice(0, 200) : '')
  )
}
