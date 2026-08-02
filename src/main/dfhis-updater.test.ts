import { createHash } from 'node:crypto'
import { mkdtempSync, existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getVersion: () => '1.4.164-dfhis.15' },
  dialog: { showMessageBox: vi.fn() },
  net: { fetch: vi.fn() },
  shell: { showItemInFolder: vi.fn() }
}))

import {
  checkDfhisUpdate,
  downloadDfhisUpdate,
  installDfhisUpdate,
  parseDfhisUpdateManifest,
  resetDfhisUpdaterForTests,
  resolveDfhisUpdateTarget,
  type DfhisUpdateManifest
} from './dfhis-updater'
import type { UpdateStatus } from '../shared/types'

const MANIFEST_URL = 'http://192.168.1.10:18800/static/downloads/orca/latest.json'

const manifest: DfhisUpdateManifest = {
  version: '1.4.164-dfhis.16',
  downloads: {
    macos: {
      path: 'releases/1.4.164-dfhis.16/orca-macos-arm64.zip',
      size: 100,
      sha256: 'a'.repeat(64)
    },
    windows: {
      path: 'releases/1.4.164-dfhis.16/orca-windows-setup.exe',
      size: 200,
      sha256: 'b'.repeat(64)
    }
  }
}

function jsonResponse(value: unknown, init?: { ok?: boolean; status?: number }): Response {
  const body = JSON.stringify(value)
  return new Response(body, { status: init?.status ?? 200 })
}

function streamResponse(chunks: Uint8Array[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk)
      }
      controller.close()
    }
  })
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  return new Response(stream, {
    status: 200,
    headers: { 'content-length': String(total) }
  })
}

function makeDeps(overrides: Partial<Parameters<typeof checkDfhisUpdate>[1]> = {}) {
  const statuses: UpdateStatus[] = []
  return {
    statuses,
    deps: {
      fetchImpl: vi.fn(async () => jsonResponse(manifest)),
      getCurrentVersion: () => '1.4.164-dfhis.15',
      getTempDir: () => tmpdir(),
      platform: 'darwin' as NodeJS.Platform,
      sendStatus: (status: UpdateStatus) => statuses.push(status),
      revealPath: vi.fn(),
      showInstallInstructions: vi.fn(async () => {}),
      spawnDetached: vi.fn(),
      ...overrides
    }
  }
}

describe('parseDfhisUpdateManifest', () => {
  it('parses a valid manifest', () => {
    expect(parseDfhisUpdateManifest(manifest)?.version).toBe('1.4.164-dfhis.16')
  })

  it('rejects missing version', () => {
    expect(parseDfhisUpdateManifest({ downloads: {} })).toBeNull()
    expect(parseDfhisUpdateManifest(null)).toBeNull()
  })
})

describe('resolveDfhisUpdateTarget', () => {
  it('returns the macOS target when the server version is newer', () => {
    const target = resolveDfhisUpdateTarget(manifest, MANIFEST_URL, 'darwin', '1.4.164-dfhis.15')
    expect(target?.url).toBe(
      'http://192.168.1.10:18800/static/downloads/orca/releases/1.4.164-dfhis.16/orca-macos-arm64.zip'
    )
  })

  it('returns the Windows target on win32', () => {
    const target = resolveDfhisUpdateTarget(manifest, MANIFEST_URL, 'win32', '1.4.164-dfhis.15')
    expect(target?.url.endsWith('orca-windows-setup.exe')).toBe(true)
  })

  it('returns null when the server version is not newer', () => {
    expect(
      resolveDfhisUpdateTarget(manifest, MANIFEST_URL, 'darwin', '1.4.164-dfhis.16')
    ).toBeNull()
    expect(
      resolveDfhisUpdateTarget(manifest, MANIFEST_URL, 'darwin', '1.4.164-dfhis.17')
    ).toBeNull()
  })

  it('does not nag local builds of the same version', () => {
    expect(
      resolveDfhisUpdateTarget(
        manifest,
        MANIFEST_URL,
        'darwin',
        '1.4.164-dfhis.16.local.1785668207877.d0220e63b7ed'
      )
    ).toBeNull()
  })
})

describe('checkDfhisUpdate', () => {
  beforeEach(() => {
    resetDfhisUpdaterForTests()
    process.env.ORCA_DFHIS_UPDATE_MANIFEST_URL = MANIFEST_URL
  })

  it('reports available when the server version is newer', async () => {
    const { statuses, deps } = makeDeps()
    await checkDfhisUpdate({ userInitiated: true }, deps)
    expect(statuses).toEqual([{ state: 'available', version: '1.4.164-dfhis.16', changelog: null }])
  })

  it('reports not-available when up to date', async () => {
    const { statuses, deps } = makeDeps({ getCurrentVersion: () => '1.4.164-dfhis.16' })
    await checkDfhisUpdate({ userInitiated: true }, deps)
    expect(statuses).toEqual([{ state: 'not-available', userInitiated: true }])
  })

  it('falls back to the intranet manifest URL', async () => {
    delete process.env.ORCA_DFHIS_UPDATE_MANIFEST_URL
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith('https://bot-direct.')) {
        throw new Error('boom')
      }
      return jsonResponse(manifest)
    })
    const { statuses, deps } = makeDeps({ fetchImpl })
    await checkDfhisUpdate({ userInitiated: true }, deps)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(statuses[0]?.state).toBe('available')
  })

  it('surfaces an error only for user-initiated checks', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline')
    })
    const userRun = makeDeps({ fetchImpl })
    await checkDfhisUpdate({ userInitiated: true }, userRun.deps)
    expect(userRun.statuses[0]?.state).toBe('error')

    resetDfhisUpdaterForTests()
    const backgroundRun = makeDeps({ fetchImpl })
    await checkDfhisUpdate({ userInitiated: false }, backgroundRun.deps)
    expect(backgroundRun.statuses).toEqual([])
  })
})

describe('downloadDfhisUpdate', () => {
  let tempDir: string
  beforeEach(() => {
    resetDfhisUpdaterForTests()
    process.env.ORCA_DFHIS_UPDATE_MANIFEST_URL = MANIFEST_URL
    tempDir = mkdtempSync(path.join(tmpdir(), 'dfhis-updater-test-'))
  })

  it('downloads, verifies sha256 and reports downloaded', async () => {
    const payload = new TextEncoder().encode('orca-update-bytes')
    const sha256 = createHash('sha256').update(payload).digest('hex')
    const { statuses, deps } = makeDeps({
      getTempDir: () => tempDir,
      fetchImpl: vi.fn(async (url: string) =>
        url.endsWith('latest.json')
          ? jsonResponse({
              version: '1.4.164-dfhis.16',
              downloads: {
                macos: { path: 'releases/x/orca-macos-arm64.zip', size: payload.byteLength, sha256 }
              }
            })
          : streamResponse([payload])
      )
    })
    await checkDfhisUpdate({ userInitiated: true }, deps)
    await downloadDfhisUpdate(deps)
    expect(statuses.at(-1)).toEqual({ state: 'downloaded', version: '1.4.164-dfhis.16' })
    expect(
      existsSync(path.join(tempDir, 'orca-dfhis-update-1.4.164-dfhis.16', 'orca-macos-arm64.zip'))
    ).toBe(true)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('reports an error when sha256 mismatches', async () => {
    const payload = new TextEncoder().encode('tampered')
    const { statuses, deps } = makeDeps({
      getTempDir: () => tempDir,
      fetchImpl: vi.fn(async (url: string) =>
        url.endsWith('latest.json') ? jsonResponse(manifest) : streamResponse([payload])
      )
    })
    await checkDfhisUpdate({ userInitiated: true }, deps)
    await downloadDfhisUpdate(deps)
    expect(statuses.at(-1)?.state).toBe('error')
    await rm(tempDir, { recursive: true, force: true })
  })
})

describe('installDfhisUpdate', () => {
  beforeEach(() => {
    resetDfhisUpdaterForTests()
    process.env.ORCA_DFHIS_UPDATE_MANIFEST_URL = MANIFEST_URL
  })

  it('launches the installer on Windows', async () => {
    const payload = new TextEncoder().encode('exe')
    const sha256 = createHash('sha256').update(payload).digest('hex')
    const tempDir = mkdtempSync(path.join(tmpdir(), 'dfhis-updater-test-'))
    const spawnDetached = vi.fn()
    const { statuses, deps } = makeDeps({
      platform: 'win32',
      getTempDir: () => tempDir,
      spawnDetached,
      fetchImpl: vi.fn(async (url: string) =>
        url.endsWith('latest.json')
          ? jsonResponse({
              version: '1.4.164-dfhis.16',
              downloads: {
                windows: {
                  path: 'releases/x/orca-windows-setup.exe',
                  size: payload.byteLength,
                  sha256
                }
              }
            })
          : streamResponse([payload])
      )
    })
    await checkDfhisUpdate({ userInitiated: true }, deps)
    await downloadDfhisUpdate(deps)
    await installDfhisUpdate(deps)
    expect(spawnDetached).toHaveBeenCalledWith(
      path.join(tempDir, 'orca-dfhis-update-1.4.164-dfhis.16', 'orca-windows-setup.exe')
    )
    expect(statuses.at(-1)).toEqual({ state: 'idle' })
    await rm(tempDir, { recursive: true, force: true })
  })
})
