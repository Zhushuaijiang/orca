import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import { cancelUnreadResponseBody } from '../lib/unread-response-body'
import { ensureBundledSkillPackInstalled } from '../skill-packs/bundled-skill-pack-installer'
import { findMissingBundledSkill } from '../skill-packs/bundled-skill-pack-files'
import type { EnvironmentBundledSkillPackDefinition } from '../skill-packs/bundled-skill-pack-types'
import { DFHIS_BUNDLED_SKILL_PACK } from './dfhis-workflow-pack-targets'

type RemoteWorkflowPackFile = {
  path: string
  sha256: string
  content?: string
  contentBase64?: string
}

type RemoteWorkflowPackManifest = {
  schemaVersion: 1
  skillPackId: string
  version?: string
  files: RemoteWorkflowPackFile[]
}

const REMOTE_WORKFLOW_PACK_FETCH_TIMEOUT_MS = 30_000

type RemoteWorkflowPackCacheMetadata = {
  schemaVersion: 1
  appVersion: string
  manifestVersion?: string
}

/** Per-pack knobs for the shared remote pull/install path. A pack without an
 * app-bundled copy (remote-only) keeps its pull cache across app upgrades,
 * because the cache is the only source left to repair from. */
export type RemoteSkillPackOptions = {
  cacheDirectoryName: string
  packId: string
  label: string
  definition: EnvironmentBundledSkillPackDefinition
  retainCacheAcrossAppUpgrades?: boolean
}

const DFHIS_REMOTE_PACK: RemoteSkillPackOptions = {
  cacheDirectoryName: 'dfhis-workflow-pack-cache',
  packId: 'dfhis',
  label: 'DFHIS workflow pack',
  definition: DFHIS_BUNDLED_SKILL_PACK,
  // Why: Orca releases ship frequently, and the DFHIS skills inside the app
  // lag the pack pulled from the team server. Keep that download after an
  // upgrade so the new app does not put the older bundled skills back.
  retainCacheAcrossAppUpgrades: true
}

function getRemoteWorkflowPackCacheRoot(cacheDirectoryName: string): string {
  return path.join(
    process.env.ORCA_USER_DATA_PATH?.trim() || getAppEnvironment().getPath('userData'),
    cacheDirectoryName
  )
}

function getCachedSkillPackPath(options: RemoteSkillPackOptions): string {
  return path.join(getRemoteWorkflowPackCacheRoot(options.cacheDirectoryName), options.packId)
}

function getCachedSkillPackMetadataPath(options: RemoteSkillPackOptions): string {
  return path.join(getRemoteWorkflowPackCacheRoot(options.cacheDirectoryName), 'metadata.json')
}

async function readCacheMetadata(
  options: RemoteSkillPackOptions
): Promise<RemoteWorkflowPackCacheMetadata | null> {
  try {
    const metadata = JSON.parse(
      await readFile(getCachedSkillPackMetadataPath(options), 'utf8')
    ) as Partial<RemoteWorkflowPackCacheMetadata>
    if (
      metadata.schemaVersion !== 1 ||
      typeof metadata.appVersion !== 'string' ||
      !metadata.appVersion.trim()
    ) {
      return null
    }
    return metadata as RemoteWorkflowPackCacheMetadata
  } catch {
    return null
  }
}

export async function getCachedRemoteSkillPackPathIfPresent(
  options: RemoteSkillPackOptions
): Promise<string | null> {
  const cachePath = getCachedSkillPackPath(options)
  const metadata = await readCacheMetadata(options)
  // A remote pack overrides the copy baked into the app. Packs that opt in keep
  // that download across upgrades; the bundled copy is often older than the
  // server pack. Legacy caches had no provenance and are treated as stale.
  if (
    !metadata ||
    (!options.retainCacheAcrossAppUpgrades &&
      metadata.appVersion !== getAppEnvironment().getVersion())
  ) {
    return null
  }
  return (await findMissingBundledSkill(options.definition, cachePath)) ? null : cachePath
}

export function getCachedDfHisWorkflowPackPathIfPresent(): Promise<string | null> {
  return getCachedRemoteSkillPackPathIfPresent(DFHIS_REMOTE_PACK)
}

function parseManifest(
  value: unknown,
  expectedPackId: string,
  label: string
): RemoteWorkflowPackManifest {
  if (!value || typeof value !== 'object') {
    throw new Error(`Remote ${label} manifest is not an object.`)
  }
  const manifest = value as Partial<RemoteWorkflowPackManifest>
  if (
    manifest.schemaVersion !== 1 ||
    manifest.skillPackId !== expectedPackId ||
    !Array.isArray(manifest.files)
  ) {
    throw new Error(`Remote ${label} manifest has an unsupported schema.`)
  }
  return manifest as RemoteWorkflowPackManifest
}

function normalizeManifestFilePath(filePath: string): string {
  const normalized = path.posix.normalize(filePath.replaceAll('\\', '/'))
  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('../') ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`Remote skill pack contains an unsafe file path: ${filePath}`)
  }
  return normalized
}

function decodeFile(file: RemoteWorkflowPackFile): Buffer {
  if (typeof file.contentBase64 === 'string') {
    return Buffer.from(file.contentBase64, 'base64')
  }
  if (typeof file.content === 'string') {
    return Buffer.from(file.content, 'utf8')
  }
  throw new Error(`Remote skill pack file has no content: ${file.path}`)
}

function assertSha256(file: RemoteWorkflowPackFile, content: Buffer): void {
  if (!/^[a-fA-F0-9]{64}$/.test(file.sha256)) {
    throw new Error(`Remote skill pack file has invalid sha256: ${file.path}`)
  }
  const actual = createHash('sha256').update(content).digest('hex')
  if (actual.toLowerCase() !== file.sha256.toLowerCase()) {
    throw new Error(
      `Remote skill pack hash mismatch for ${file.path}: expected ${file.sha256}, got ${actual}`
    )
  }
}

async function readManifestText(urlOrPath: string): Promise<string> {
  if (urlOrPath.startsWith('file://')) {
    return readFile(new URL(urlOrPath), 'utf8')
  }
  if (!/^https?:\/\//i.test(urlOrPath)) {
    return readFile(path.resolve(urlOrPath), 'utf8')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REMOTE_WORKFLOW_PACK_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(urlOrPath, { signal: controller.signal })
    if (!response.ok) {
      // Why: an unread body can crash undici (orca#8695).
      await cancelUnreadResponseBody(response)
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    return response.text()
  } finally {
    clearTimeout(timeout)
  }
}

async function materializeManifest(
  manifest: RemoteWorkflowPackManifest,
  outputDirectory: string
): Promise<void> {
  for (const file of manifest.files) {
    const relativePath = normalizeManifestFilePath(file.path)
    const content = decodeFile(file)
    assertSha256(file, content)
    const outputPath = path.join(outputDirectory, ...relativePath.split('/'))
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, content, { mode: 0o644 })
  }
}

export async function installRemoteSkillPack(
  urlOrPath: string,
  options: RemoteSkillPackOptions,
  homeDirectory?: string
): Promise<string[]> {
  const trimmedUrl = urlOrPath.trim()
  if (!trimmedUrl) {
    throw new Error(`${options.label} URL is not configured.`)
  }

  const manifest = parseManifest(
    JSON.parse(await readManifestText(trimmedUrl)),
    options.packId,
    options.label
  )
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'orca-skill-pack-'))
  try {
    await materializeManifest(manifest, temporaryDirectory)
    const cachePath = getCachedSkillPackPath(options)
    await rm(cachePath, { recursive: true, force: true })
    await mkdir(path.dirname(cachePath), { recursive: true })
    await materializeManifest(manifest, cachePath)
    const metadata: RemoteWorkflowPackCacheMetadata = {
      schemaVersion: 1,
      appVersion: getAppEnvironment().getVersion(),
      ...(manifest.version ? { manifestVersion: manifest.version } : {})
    }
    await writeFile(
      getCachedSkillPackMetadataPath(options),
      `${JSON.stringify(metadata, null, 2)}\n`,
      'utf8'
    )
    return [
      `Downloaded ${options.label}${manifest.version ? ` ${manifest.version}` : ''}.`,
      ...(await ensureBundledSkillPackInstalled(options.definition, homeDirectory, cachePath))
    ]
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

export function installRemoteDfHisWorkflowPack(
  urlOrPath: string,
  homeDirectory?: string
): Promise<string[]> {
  return installRemoteSkillPack(urlOrPath, DFHIS_REMOTE_PACK, homeDirectory)
}
