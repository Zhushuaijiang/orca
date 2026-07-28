import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import type { DfHisEnvironmentPrerequisiteResult } from '../../shared/dfhis-environment-types'
import {
  BUNDLED_DFHIS_WORKFLOW_PACK_RELATIVE_PATH,
  DFHIS_WORKFLOW_PACK_NAMES,
  MANIFEST_FILE_NAME,
  WORKFLOW_PACK_TARGETS,
  type DfHisWorkflowPackName,
  type DfHisWorkflowPackTarget
} from './dfhis-workflow-pack-targets'

type DfHisWorkflowPackManifest = {
  schemaVersion: 1
  packageHash: string
  providerTarget: DfHisWorkflowPackTarget['providerTarget']
  installedAt: string
  orcaVersion: string
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function getBundledDfHisWorkflowPackPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, BUNDLED_DFHIS_WORKFLOW_PACK_RELATIVE_PATH)
    : path.join(process.cwd(), 'resources', BUNDLED_DFHIS_WORKFLOW_PACK_RELATIVE_PATH)
}

function getAppVersion(): string {
  return typeof app.getVersion === 'function' ? app.getVersion() : 'unknown'
}

function getTargetDirectory(target: DfHisWorkflowPackTarget, homeDirectory: string): string {
  return path.join(homeDirectory, ...target.relativeDirectory)
}

function getTargetManifestPath(targetDirectory: string): string {
  return path.join(targetDirectory, MANIFEST_FILE_NAME)
}

function shouldSkipPackFile(filePath: string): boolean {
  const parts = filePath.split(path.sep)
  return (
    parts.includes('__pycache__') ||
    parts.includes('.DS_Store') ||
    parts.at(-1) === MANIFEST_FILE_NAME
  )
}

async function listPackFiles(directory: string, baseDirectory = directory): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    const relativePath = path.relative(baseDirectory, fullPath)
    if (shouldSkipPackFile(relativePath)) {
      continue
    }
    if (entry.isDirectory()) {
      files.push(...(await listPackFiles(fullPath, baseDirectory)))
    } else if (entry.isFile()) {
      files.push(relativePath)
    }
  }
  return files.sort((left, right) => left.localeCompare(right, 'en'))
}

async function hashPackDirectory(
  directory: string,
  relativePaths?: readonly string[]
): Promise<string> {
  const hash = createHash('sha256')
  const files = relativePaths
    ? [...relativePaths].sort((left, right) => left.localeCompare(right, 'en'))
    : await listPackFiles(directory)
  for (const relativePath of files) {
    const normalizedPath = relativePath.split(path.sep).join('/')
    hash.update(normalizedPath)
    hash.update('\0')
    hash.update(await readFile(path.join(directory, relativePath)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

async function readManifest(targetDirectory: string): Promise<DfHisWorkflowPackManifest | null> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(getTargetManifestPath(targetDirectory), 'utf8')
    )
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    const manifest = parsed as Partial<DfHisWorkflowPackManifest>
    if (
      manifest.schemaVersion !== 1 ||
      typeof manifest.packageHash !== 'string' ||
      typeof manifest.providerTarget !== 'string' ||
      typeof manifest.installedAt !== 'string' ||
      typeof manifest.orcaVersion !== 'string'
    ) {
      return null
    }
    return manifest as DfHisWorkflowPackManifest
  } catch {
    return null
  }
}

async function copyWorkflowPack(sourceDirectory: string, targetDirectory: string): Promise<void> {
  await mkdir(targetDirectory, { recursive: true })
  await Promise.all(
    DFHIS_WORKFLOW_PACK_NAMES.map((packName) => {
      const packSourceDirectory = path.join(sourceDirectory, packName)
      return cp(packSourceDirectory, path.join(targetDirectory, packName), {
        recursive: true,
        force: true,
        errorOnExist: false,
        filter: (source) => !shouldSkipPackFile(path.relative(packSourceDirectory, source))
      })
    })
  )
}

async function findMissingWorkflowPack(
  sourceDirectory: string
): Promise<DfHisWorkflowPackName | null> {
  const missingPack = (
    await Promise.all(
      DFHIS_WORKFLOW_PACK_NAMES.map(async (packName) => ({
        packName,
        exists: await pathExists(path.join(sourceDirectory, packName, 'SKILL.md'))
      }))
    )
  ).find((pack) => !pack.exists)
  return missingPack?.packName ?? null
}

async function assertBundledWorkflowPackExists(sourceDirectory: string): Promise<void> {
  const missingPackName = await findMissingWorkflowPack(sourceDirectory)
  if (missingPackName) {
    throw new Error(
      `Bundled DFHIS workflow pack is missing ${missingPackName} at ${sourceDirectory}.`
    )
  }
}

async function writeManifest(
  target: DfHisWorkflowPackTarget,
  targetDirectory: string,
  packageHash: string
): Promise<void> {
  const manifest: DfHisWorkflowPackManifest = {
    schemaVersion: 1,
    packageHash,
    providerTarget: target.providerTarget,
    installedAt: new Date().toISOString(),
    orcaVersion: getAppVersion()
  }
  await writeFile(
    getTargetManifestPath(targetDirectory),
    `${JSON.stringify(manifest, null, 2)}\n`,
    {
      mode: 0o644
    }
  )
}

async function checkWorkflowPackTarget(
  target: DfHisWorkflowPackTarget,
  sourceHash: string,
  sourceFiles: readonly string[],
  homeDirectory: string
): Promise<DfHisEnvironmentPrerequisiteResult> {
  const targetDirectory = getTargetDirectory(target, homeDirectory)
  const missingPackName = await findMissingWorkflowPack(targetDirectory)
  if (missingPackName) {
    return {
      id: target.id,
      label: target.label,
      status: 'missing',
      summary: `${missingPackName} is not installed`,
      detail: targetDirectory,
      fixable: true
    }
  }

  let installedHash: string
  try {
    installedHash = await hashPackDirectory(targetDirectory, sourceFiles)
  } catch {
    return {
      id: target.id,
      label: target.label,
      status: 'invalid',
      summary: 'Installed pack is missing bundled files',
      detail: targetDirectory,
      fixable: true
    }
  }
  const manifest = await readManifest(targetDirectory)
  if (installedHash === sourceHash) {
    return {
      id: target.id,
      label: target.label,
      status: 'ok',
      summary: manifest
        ? 'Installed and current'
        : 'Installed; manifest will be refreshed on repair',
      detail: targetDirectory,
      fixable: true
    }
  }

  if (manifest?.packageHash === sourceHash) {
    return {
      id: target.id,
      label: target.label,
      status: 'invalid',
      summary: 'Installed pack differs from bundled version',
      detail: targetDirectory,
      fixable: true
    }
  }

  return {
    id: target.id,
    label: target.label,
    status: 'invalid',
    summary: manifest ? 'Installed pack is outdated' : 'Legacy pack differs from bundled version',
    detail: targetDirectory,
    fixable: true
  }
}

async function installWorkflowPackTarget(
  target: DfHisWorkflowPackTarget,
  sourceDirectory: string,
  sourceHash: string,
  sourceFiles: readonly string[],
  homeDirectory: string
): Promise<string> {
  const targetDirectory = getTargetDirectory(target, homeDirectory)
  const current = await checkWorkflowPackTarget(target, sourceHash, sourceFiles, homeDirectory)
  if (current.status === 'ok') {
    return `${target.label} is installed and current at ${targetDirectory}.`
  }
  if (current.status === 'invalid' && !current.fixable) {
    return `${target.label} has local modifications; leaving ${targetDirectory} unchanged.`
  }
  await copyWorkflowPack(sourceDirectory, targetDirectory)
  await writeManifest(target, targetDirectory, sourceHash)
  return `Installed ${target.label} to ${targetDirectory}.`
}

export function getDfHisWorkflowPackPath(
  providerTarget: DfHisWorkflowPackTarget['providerTarget'] = 'codex',
  homeDirectory = homedir(),
  packName: DfHisWorkflowPackName = 'yunxiao-requirement-archiver'
): string {
  const target = WORKFLOW_PACK_TARGETS.find(
    (candidate) => candidate.providerTarget === providerTarget
  )
  if (!target) {
    throw new Error(`Unknown DFHIS workflow pack target: ${providerTarget}`)
  }
  return path.join(getTargetDirectory(target, homeDirectory), packName, 'SKILL.md')
}

export function getDfHisSkillPath(homeDirectory = homedir()): string {
  return getDfHisWorkflowPackPath('codex', homeDirectory)
}

export async function checkDfHisWorkflowPackPrerequisites(
  homeDirectory = homedir()
): Promise<DfHisEnvironmentPrerequisiteResult[]> {
  const sourceDirectory = getBundledDfHisWorkflowPackPath()
  await assertBundledWorkflowPackExists(sourceDirectory)
  const sourceFiles = await listPackFiles(sourceDirectory)
  const sourceHash = await hashPackDirectory(sourceDirectory, sourceFiles)
  return Promise.all(
    WORKFLOW_PACK_TARGETS.map((target) =>
      checkWorkflowPackTarget(target, sourceHash, sourceFiles, homeDirectory)
    )
  )
}

export async function ensureDfHisWorkflowPackInstalled(
  homeDirectory = homedir()
): Promise<string[]> {
  const sourceDirectory = getBundledDfHisWorkflowPackPath()
  await assertBundledWorkflowPackExists(sourceDirectory)
  const sourceFiles = await listPackFiles(sourceDirectory)
  const sourceHash = await hashPackDirectory(sourceDirectory, sourceFiles)
  return Promise.all(
    WORKFLOW_PACK_TARGETS.map((target) =>
      installWorkflowPackTarget(target, sourceDirectory, sourceHash, sourceFiles, homeDirectory)
    )
  )
}
