import { win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BROWSER_WINDOW_CLOSE_ALLOWED_PRELOAD } from '../../shared/browser-window-close-policy'

export function resolveBrowserWindowCloseAllowedPreloadPath(
  platform: NodeJS.Platform = process.platform
): string {
  if (platform === 'win32') {
    return win32.normalize(
      decodeURIComponent(new URL(BROWSER_WINDOW_CLOSE_ALLOWED_PRELOAD).pathname)
    )
  }
  return fileURLToPath(BROWSER_WINDOW_CLOSE_ALLOWED_PRELOAD)
}

export function isBrowserWindowCloseAllowedPreload(
  preload: unknown,
  platform: NodeJS.Platform = process.platform
): boolean {
  return (
    preload === BROWSER_WINDOW_CLOSE_ALLOWED_PRELOAD ||
    preload === resolveBrowserWindowCloseAllowedPreloadPath(platform)
  )
}
