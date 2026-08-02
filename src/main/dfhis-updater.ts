import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn, type SpawnOptions } from 'node:child_process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { app, dialog, net, shell } from 'electron'

import { compareAppVersions } from '../shared/app-version'
import type { UpdateStatus } from '../shared/types'

const execFileAsync = promisify(execFile)

// Why: the DFHIS release feed is a plain static server; latest.json is the
// single manifest the publish pipeline keeps current (see
// config/scripts/publish-orca-desktop-release.mjs). The intranet address is
// ~50x faster on the company LAN, so it goes first with a short probe
// timeout; off-site clients fall through to the public domain.
const DEFAULT_MANIFEST_URLS = [
  'http://192.168.1.10:18800/static/downloads/orca/latest.json',
  'https://bot-direct.zhushuaijiang.cn/static/downloads/orca/latest.json'
]
const MANIFEST_TIMEOUT_MS = 10_000
const INTRANET_PROBE_TIMEOUT_MS = 4_000

export type DfhisUpdateDownload = {
  path: string
  size: number
  sha256: string
}

export type DfhisUpdateManifest = {
  version: string
  downloads: {
    macos?: DfhisUpdateDownload
    windows?: DfhisUpdateDownload
  }
}

export type DfhisUpdateTarget = DfhisUpdateDownload & {
  version: string
  url: string
}

type DfhisUpdaterDeps = {
  fetchImpl: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>
  getCurrentVersion: () => string
  getTempDir: () => string
  platform: NodeJS.Platform
  sendStatus: (status: UpdateStatus) => void
  revealPath: (target: string) => void
  showInstallInstructions: (message: string) => Promise<void>
  spawnDetached: (file: string) => void
}

let sendStatusRef: ((status: UpdateStatus) => void) | null = null
let pendingTarget: DfhisUpdateTarget | null = null
let downloadedFile: { path: string; version: string } | null = null
let checkInFlight = false
let downloadInFlight = false

export function initDfhisUpdater(sendStatus: (status: UpdateStatus) => void): void {
  sendStatusRef = sendStatus
}

function manifestUrls(env: NodeJS.ProcessEnv = process.env): string[] {
  const override = env.ORCA_DFHIS_UPDATE_MANIFEST_URL?.trim()
  return override ? [override] : DEFAULT_MANIFEST_URLS
}

function manifestBaseUrl(manifestUrl: string): string {
  return manifestUrl.replace(/latest\.json$/, '')
}

function asDownload(value: unknown): DfhisUpdateDownload | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  return typeof record.path === 'string' && typeof record.sha256 === 'string'
    ? {
        path: record.path,
        size: typeof record.size === 'number' ? record.size : 0,
        sha256: record.sha256
      }
    : undefined
}

export function parseDfhisUpdateManifest(value: unknown): DfhisUpdateManifest | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  if (typeof record.version !== 'string' || !record.version.trim()) {
    return null
  }
  const downloads = (record.downloads ?? {}) as Record<string, unknown>
  return {
    version: record.version.trim(),
    downloads: {
      macos: asDownload(downloads.macos),
      windows: asDownload(downloads.windows)
    }
  }
}

export function resolveDfhisUpdateTarget(
  manifest: DfhisUpdateManifest,
  manifestUrl: string,
  platform: NodeJS.Platform,
  currentVersion: string
): DfhisUpdateTarget | null {
  if (compareAppVersions(manifest.version, currentVersion) <= 0) {
    return null
  }
  const download = platform === 'win32' ? manifest.downloads.windows : manifest.downloads.macos
  if (!download) {
    return null
  }
  return {
    ...download,
    version: manifest.version,
    url: `${manifestBaseUrl(manifestUrl)}${download.path.replace(/^\//, '')}`
  }
}

async function fetchManifest(
  fetchImpl: DfhisUpdaterDeps['fetchImpl'],
  urls: string[]
): Promise<{ manifest: DfhisUpdateManifest; manifestUrl: string }> {
  let lastError: unknown = null
  for (const [index, url] of urls.entries()) {
    try {
      // Why: the first (intranet) probe must fail fast so off-site clients
      // reach the public domain quickly; later URLs get the full timeout.
      const timeoutMs = index === 0 ? INTRANET_PROBE_TIMEOUT_MS : MANIFEST_TIMEOUT_MS
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs)
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const manifest = parseDfhisUpdateManifest(await response.json())
      if (!manifest) {
        throw new Error('latest.json is missing a version')
      }
      return { manifest, manifestUrl: url }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function defaultDeps(): DfhisUpdaterDeps {
  return {
    fetchImpl: (url, init) => net.fetch(url, init),
    getCurrentVersion: () => app.getVersion(),
    getTempDir: () => tmpdir(),
    platform: process.platform,
    sendStatus: (status) => sendStatusRef?.(status),
    revealPath: (target) => shell.showItemInFolder(target),
    showInstallInstructions: async (message) => {
      await dialog.showMessageBox({
        type: 'info',
        title: 'Orca 更新已下载',
        message,
        buttons: ['好']
      })
    },
    spawnDetached: (file) => {
      const options: SpawnOptions = { detached: true, stdio: 'ignore' }
      spawn(file, [], options).unref()
    }
  }
}

export async function checkDfhisUpdate(
  { userInitiated }: { userInitiated: boolean },
  deps: DfhisUpdaterDeps = defaultDeps()
): Promise<void> {
  if (checkInFlight) {
    return
  }
  checkInFlight = true
  try {
    const { manifest, manifestUrl } = await fetchManifest(deps.fetchImpl, manifestUrls())
    const target = resolveDfhisUpdateTarget(
      manifest,
      manifestUrl,
      deps.platform,
      deps.getCurrentVersion()
    )
    if (!target) {
      pendingTarget = null
      deps.sendStatus({ state: 'not-available', userInitiated })
      return
    }
    pendingTarget = target
    deps.sendStatus({ state: 'available', version: target.version, changelog: null })
  } catch (error) {
    if (userInitiated) {
      deps.sendStatus({
        state: 'error',
        message: `检查 DFHIS 更新失败：${error instanceof Error ? error.message : String(error)}`,
        userInitiated: true
      })
    }
  } finally {
    checkInFlight = false
  }
}

async function verifyFileSha256(filePath: string, expected: string): Promise<boolean> {
  const { createReadStream } = await import('node:fs')
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve())
    stream.on('error', reject)
  })
  return hash.digest('hex') === expected.trim().toLowerCase()
}

export async function downloadDfhisUpdate(deps: DfhisUpdaterDeps = defaultDeps()): Promise<void> {
  const target = pendingTarget
  if (!target || downloadInFlight) {
    return
  }
  downloadInFlight = true
  deps.sendStatus({ state: 'downloading', percent: 0, version: target.version })
  const dir = path.join(deps.getTempDir(), `orca-dfhis-update-${target.version}`)
  const filePath = path.join(dir, path.basename(target.path))
  try {
    await mkdir(dir, { recursive: true })
    const response = await deps.fetchImpl(target.url)
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`)
    }
    const total = Number(response.headers.get('content-length')) || target.size || 0
    const reader = response.body.getReader()
    const writer = createWriteStream(filePath)
    let received = 0
    let lastPercent = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        received += value.byteLength
        if (!writer.write(value)) {
          await new Promise<void>((resolve) => writer.once('drain', resolve))
        }
        if (total > 0) {
          const percent = Math.min(99, Math.floor((received / total) * 100))
          if (percent > lastPercent) {
            lastPercent = percent
            deps.sendStatus({ state: 'downloading', percent, version: target.version })
          }
        }
      }
    } finally {
      await new Promise<void>((resolve) => writer.end(resolve))
    }
    if (!(await verifyFileSha256(filePath, target.sha256))) {
      await rm(filePath, { force: true })
      throw new Error('下载文件校验失败（sha256 不匹配）')
    }
    downloadedFile = { path: filePath, version: target.version }
    deps.sendStatus({ state: 'downloaded', version: target.version })
  } catch (error) {
    deps.sendStatus({
      state: 'error',
      message: `下载 DFHIS 更新失败：${error instanceof Error ? error.message : String(error)}`,
      userInitiated: true
    })
  } finally {
    downloadInFlight = false
  }
}

export async function installDfhisUpdate(deps: DfhisUpdaterDeps = defaultDeps()): Promise<void> {
  const file = downloadedFile
  if (!file) {
    return
  }
  if (deps.platform === 'win32') {
    deps.spawnDetached(file.path)
    deps.sendStatus({ state: 'idle' })
    return
  }
  // macOS: adhoc 签名过不了 Squirrel.Mac，解压后引导用户手动替换
  const destDir = path.join(path.dirname(file.path), 'app')
  await rm(destDir, { recursive: true, force: true })
  await execFileAsync('ditto', ['-xk', file.path, destDir])
  const appPath = path.join(destDir, 'Orca.app')
  deps.revealPath(appPath)
  await deps.showInstallInstructions(
    `新版本 ${file.version} 已下载并解压。请在 Finder 中将 Orca.app 拖入「应用程序」文件夹替换旧版本（替换前请先退出 Orca）。`
  )
  deps.sendStatus({ state: 'idle' })
}

// test-only: reset module state between cases
export function resetDfhisUpdaterForTests(): void {
  pendingTarget = null
  downloadedFile = null
  checkInFlight = false
  downloadInFlight = false
}
