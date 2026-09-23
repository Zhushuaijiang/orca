import { isTransientWslServiceFailure } from '../../../shared/wsl-service-failure'

function visibleTerminalText(text: string): string {
  const esc = String.fromCharCode(0x1b)
  const [head, ...rest] = text.replaceAll('\u0000', '').split(esc)
  const tail = rest.map((part) => part.replace(/^\[[0-9;?]*[ -/]*[@-~]/, '')).join('')
  return `${head ?? ''}${tail}`.trim()
}

type WslPtyStartupProcess = {
  onData: (callback: (data: string) => void) => { dispose: () => void }
  onExit: (callback: (event: { exitCode: number }) => void) => { dispose: () => void }
}

/** True when this PTY died from the transient WSL service failure.
 *  A live process, or any other exit, returns false so the pane stays as spawned. */
export function wslPtyStartupShouldRetry(
  proc: WslPtyStartupProcess,
  timeoutMs: number
): Promise<boolean> {
  return new Promise((resolve) => {
    let output = ''
    let settled = false
    let sawFailure = false
    const dataSub = proc.onData((data) => {
      output += data
      const visible = visibleTerminalText(output)
      if (isTransientWslServiceFailure(visible)) {
        sawFailure = true
        return
      }
      if (visible.length > 0) {
        finish(false)
      }
    })
    const exitSub = proc.onExit(() => {
      finish(sawFailure || isTransientWslServiceFailure(visibleTerminalText(output)))
    })
    const timer = setTimeout(() => finish(false), timeoutMs)

    function finish(retry: boolean): void {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      dataSub.dispose()
      exitSub.dispose()
      resolve(retry)
    }
  })
}
