import { formatTerminalStartFailure } from '../../../../shared/terminal-start-failure'
import { getPtyIpc } from '../pty-host-bindings'
import { runPtyIpcSpawn } from './spawn-run'
import { applyYunxiaoRequirementSpawnGate } from './yunxiao-requirement-gate'
import type { PtySpawnIpcArgs, PtySpawnIpcDeps } from './spawn-types'
import { getConnectionExecutionHostId } from '../../../../shared/execution-host'
import { attachOnlyViewOf, attachViewAfterHiddenStart } from '../pane/attach-only-view'

export function installPtySpawnIpcHandler(deps: PtySpawnIpcDeps): void {
  const ipcMain = getPtyIpc()
  const { getLocalPtyStartupPromise } = deps

  ipcMain.handle('pty:spawn', async (_event, args: PtySpawnIpcArgs) => {
    try {
      const startupPromise = getLocalPtyStartupPromise(
        getConnectionExecutionHostId(args.connectionId)
      )
      if (startupPromise) {
        await startupPromise
      }
      // Why not asserted here: the preflight asserts folder paths AFTER the pane reservation —
      // awaiting before it lets a concurrent same-pane spawn miss the reservation and double-spawn.
      const yunxiaoRequirementSpawnGate = applyYunxiaoRequirementSpawnGate(deps.store, args)
      if (yunxiaoRequirementSpawnGate) {
        await yunxiaoRequirementSpawnGate
      }
      // Why (fork): main's commit path has no post-commit hook here; record before the renderer
      // can write so the Yunxiao prompt gate knows which TUI agent owns this PTY.
      const commit = async () => await runPtyIpcSpawn(deps, args)
      if (attachOnlyViewOf(args) && args.sessionId && args.initiallyHidden !== true) {
        return await attachViewAfterHiddenStart(
          args.sessionId,
          deps.transitionSpawnHiddenRendererPtyDeliveryState,
          commit
        )
      }
      return await commit()
    } catch (error) {
      const message = formatTerminalStartFailure(error)
      if (message) {
        throw new Error(message)
      }
      throw error
    }
  })
}
