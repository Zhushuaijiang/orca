import { getPtyIpc } from '../../pty-host-bindings'
import { runPtyIpcSpawn } from './spawn-run'
import { applyYunxiaoRequirementSpawnGate } from './yunxiao-requirement-gate'
import type { PtySpawnIpcArgs, PtySpawnIpcDeps } from './spawn-types'

export function installPtySpawnIpcHandler(deps: PtySpawnIpcDeps): void {
  const ipcMain = getPtyIpc()
  const { getLocalPtyStartupPromise } = deps

  ipcMain.handle('pty:spawn', async (_event, args: PtySpawnIpcArgs) => {
    const startupPromise = getLocalPtyStartupPromise(args.connectionId)
    if (startupPromise) {
      await startupPromise
    }
    // Why not asserted here: the preflight asserts folder paths AFTER the pane reservation —
    // awaiting before it lets a concurrent same-pane spawn miss the reservation and double-spawn.
    const yunxiaoRequirementSpawnGate = applyYunxiaoRequirementSpawnGate(deps.store, args)
    if (yunxiaoRequirementSpawnGate) {
      await yunxiaoRequirementSpawnGate
    }
    return runPtyIpcSpawn(deps, args)
  })
}
