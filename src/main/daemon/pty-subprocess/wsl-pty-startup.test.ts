import { describe, expect, it } from 'vitest'
import { mockPtyProcess } from '../pty-subprocess-test-harness'
import { wslPtyStartupShouldRetry } from './wsl-pty-startup'

describe('wslPtyStartupShouldRetry', () => {
  it('retries when the pane dies with the localized service failure', async () => {
    const proc = mockPtyProcess()
    const pending = wslPtyStartupShouldRetry(proc, 1000)
    proc._simulateData('灾难性故障\r\n错误代码: Wsl/Service/E_UNEXPECTED\r\n')
    proc._simulateExit(1)

    await expect(pending).resolves.toBe(true)
  })

  it('retries when a console sequence arrives before the service failure', async () => {
    const proc = mockPtyProcess()
    const pending = wslPtyStartupShouldRetry(proc, 1000)
    proc._simulateData('\u001b[?25h')
    proc._simulateData('灾难性故障\r\n错误代码: Wsl/Service/E_UNEXPECTED\r\n')
    proc._simulateExit(1)

    await expect(pending).resolves.toBe(true)
  })

  it('keeps a pane that prints a shell prompt', async () => {
    const proc = mockPtyProcess()
    const pending = wslPtyStartupShouldRetry(proc, 1000)
    proc._simulateData('user@desktop:~$ ')

    await expect(pending).resolves.toBe(false)
  })

  it('keeps a pane that is still running when the watch ends', async () => {
    const proc = mockPtyProcess()

    await expect(wslPtyStartupShouldRetry(proc, 0)).resolves.toBe(false)
  })
})
