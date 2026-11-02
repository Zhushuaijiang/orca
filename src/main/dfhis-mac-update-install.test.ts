import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMacReplacementScript, installDfhisUpdateOnMac } from './dfhis-mac-update-install'

const makeScript = (): string =>
  buildMacReplacementScript({
    version: '1.4.214-rc.16',
    newAppPath: '/tmp/orca-update/app/Orca.app',
    installAppPath: '/Applications/Orca.app',
    logPath: '/tmp/orca-update/install-update.log'
  })

const makeDeps = () => ({
  getInstallBundlePath: () => '/Applications/Orca.app',
  extractAppArchive: vi.fn(async (_archive: string, dest: string) => {
    await mkdir(path.join(dest, 'Orca.app'), { recursive: true })
  }),
  submitDetachedInstaller: vi.fn(async () => {}),
  quitApp: vi.fn(),
  revealPath: vi.fn(),
  showInstallInstructions: vi.fn(async () => {}),
  sendStatus: vi.fn()
})

let dir: string | null = null

afterEach(async () => {
  if (dir) {
    await rm(dir, { recursive: true, force: true })
    dir = null
  }
})

describe('buildMacReplacementScript', () => {
  it('waits on the GUI process instead of every bundle child', () => {
    const script = makeScript()

    // Why: CLI/daemon children keep the bundle path in their command line.
    expect(script).not.toContain('pgrep -f')
    expect(script).toContain('ps -axo command=')
    expect(script).toContain('grep -Fxq "$INSTALL_APP/Contents/MacOS/Orca"')
  })

  it('swaps the bundle aside and reopens the staged build', () => {
    const script = makeScript()

    expect(script).toContain("EXPECTED_VERSION='1.4.214-rc.16'")
    expect(script).toContain('mv "$INSTALL_APP" "$HOME/.Trash/Orca.app.before-$stamp"')
    expect(script).toContain('ditto "$NEW_APP" "$INSTALL_APP"')
    expect(script).toContain('open "$INSTALL_APP"')
  })
})

describe('installDfhisUpdateOnMac', () => {
  it('queues the installer, reports idle status, and quits without a blocking dialog', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'orca-dfhis-install-'))
    const filePath = path.join(dir, 'orca-macos-arm64.zip')
    await writeFile(filePath, 'zip')
    const deps = makeDeps()

    await installDfhisUpdateOnMac({ version: '1.4.214-rc.16', filePath }, deps)

    expect(deps.submitDetachedInstaller).toHaveBeenCalledTimes(1)
    expect(deps.sendStatus).toHaveBeenCalledWith({ state: 'idle' })
    expect(deps.quitApp).toHaveBeenCalledTimes(1)
    expect(deps.showInstallInstructions).not.toHaveBeenCalled()
    const script = await readFile(path.join(dir, 'install-update.zsh'), 'utf8')
    expect(script).toContain('ps -axo command=')
  })

  it('falls back to Finder instructions when the launchd job is refused', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'orca-dfhis-install-'))
    const filePath = path.join(dir, 'orca-macos-arm64.zip')
    await writeFile(filePath, 'zip')
    const deps = makeDeps()
    deps.submitDetachedInstaller.mockRejectedValueOnce(new Error('launchctl refused'))

    await installDfhisUpdateOnMac({ version: '1.4.214-rc.16', filePath }, deps)

    expect(deps.quitApp).not.toHaveBeenCalled()
    expect(deps.revealPath).toHaveBeenCalledTimes(1)
    expect(deps.showInstallInstructions).toHaveBeenCalledTimes(1)
  })
})
