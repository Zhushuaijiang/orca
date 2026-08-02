import { describe, expect, it } from 'vitest'
import { BROWSER_WINDOW_CLOSE_ALLOWED_PRELOAD } from '../../shared/browser-window-close-policy'
import {
  isBrowserWindowCloseAllowedPreload,
  resolveBrowserWindowCloseAllowedPreloadPath
} from './browser-window-close-preload'

describe('browser window-close preload policy', () => {
  it('resolves the sentinel without a Windows drive-letter URL failure', () => {
    expect(resolveBrowserWindowCloseAllowedPreloadPath('win32')).toBe(
      '\\__orca_window_close_allowed__'
    )
  })

  it('accepts both URL and normalized Windows path forms', () => {
    expect(isBrowserWindowCloseAllowedPreload(BROWSER_WINDOW_CLOSE_ALLOWED_PRELOAD, 'win32')).toBe(
      true
    )
    expect(isBrowserWindowCloseAllowedPreload('\\__orca_window_close_allowed__', 'win32')).toBe(
      true
    )
    expect(isBrowserWindowCloseAllowedPreload('C:\\untrusted-preload.js', 'win32')).toBe(false)
  })
})
