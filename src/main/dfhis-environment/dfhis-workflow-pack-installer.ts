import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import type {
  DfHisEnvironmentPrerequisiteId,
  DfHisEnvironmentPrerequisiteResult
} from '../../shared/dfhis-environment-types'

const DFHIS_WORKFLOW_PACK_NAME = 'yunxiao-requirement-archiver'
const BUNDLED_DFHIS_WORKFLOW_PACK_RELATIVE_PATH = path.join('dfhis', DFHIS_WORKFLOW_PACK_NAME)
const MANIFEST_FILE_NAME = '.orca-dfhis-workflow-pack.json'

type DfHisWorkflowPackTarget = {
  id: DfHisEnvironmentPrerequisiteId
  providerTarget: 'agent-skills' | 'codex' | 'claude'
  label: string
  relativeDirectory: string[]
}

type DfHisWorkflowPackManifest = {
  schemaVersion: 1
  packageHash: string
  providerTarget: DfHisWorkflowPackTarget['providerTarget']
  installedAt: string
  orcaVersion: string
}

type WorkflowPackTargetDefinition = readonly [
  DfHisEnvironmentPrerequisiteId,
  DfHisWorkflowPackTarget['providerTarget'],
  string,
  readonly string[]
]

const WORKFLOW_PACK_TARGET_DEFINITIONS: readonly WorkflowPackTargetDefinition[] = [
  [
    'dfhis-workflow-pack-agent-skills',
    'agent-skills',
    'DFHIS workflow pack for universal agent skills',
    ['.agents', 'skills']
  ],
  ['dfhis-workflow-pack-codex', 'codex', 'DFHIS workflow pack for Codex', ['.codex', 'skills']],
  ['dfhis-workflow-pack-claude', 'claude', 'DFHIS workflow pack for Claude', ['.claude', 'skills']]
]

const WORKFLOW_PACK_TARGETS: readonly DfHisWorkflowPackTarget[] =
  WORKFLOW_PACK_TARGET_DEFINITIONS.map(([id, providerTarget, label, directory]) => ({
    id,
    providerTarget,
    label,
    relativeDirectory: [...directory, DFHIS_WORKFLOW_PACK_NAME]
  }))

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
  await mkdir(path.dirname(targetDirectory), { recursive: true })
  await cp(sourceDirectory, targetDirectory, {
    recursive: true,
    force: true,
    errorOnExist: false,
    filter: (source) => !shouldSkipPackFile(path.relative(sourceDirectory, source))
  })
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
  const skillPath = path.join(targetDirectory, 'SKILL.md')
  if (!(await pathExists(skillPath))) {
    return {
      id: target.id,
      label: target.label,
      status: 'missing',
      summary: 'Workflow pack is not installed',
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
      summary: 'Installed pack was modified after Orca installed it',
      detail: targetDirectory,
      fixable: false
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
  if (current.status === 'invalid' && !current.fixable) {
    return `${target.label} has local modifications; leaving ${targetDirectory} unchanged.`
  }
  await copyWorkflowPack(sourceDirectory, targetDirectory)
  await writeManifest(target, targetDirectory, sourceHash)
  return `Installed ${target.label} to ${targetDirectory}.`
}

export function getDfHisWorkflowPackPath(
  providerTarget: DfHisWorkflowPackTarget['providerTarget'] = 'codex',
  homeDirectory = homedir()
): string {
  const target = WORKFLOW_PACK_TARGETS.find(
    (candidate) => candidate.providerTarget === providerTarget
  )
  if (!target) {
    throw new Error(`Unknown DFHIS workflow pack target: ${providerTarget}`)
  }
  return path.join(getTargetDirectory(target, homeDirectory), 'SKILL.md')
}

export function getDfHisSkillPath(homeDirectory = homedir()): string {
  return getDfHisWorkflowPackPath('codex', homeDirectory)
}

export async function checkDfHisWorkflowPackPrerequisites(
  homeDirectory = homedir()
): Promise<DfHisEnvironmentPrerequisiteResult[]> {
  const sourceDirectory = getBundledDfHisWorkflowPackPath()
  if (!(await pathExists(path.join(sourceDirectory, 'SKILL.md')))) {
    throw new Error(`Bundled DFHIS workflow pack is missing at ${sourceDirectory}.`)
  }
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
  if (!(await pathExists(path.join(sourceDirectory, 'SKILL.md')))) {
    throw new Error(`Bundled DFHIS workflow pack is missing at ${sourceDirectory}.`)
  }
  const sourceFiles = await listPackFiles(sourceDirectory)
  const sourceHash = await hashPackDirectory(sourceDirectory, sourceFiles)
  return Promise.all(
    WORKFLOW_PACK_TARGETS.map((target) =>
      installWorkflowPackTarget(target, sourceDirectory, sourceHash, sourceFiles, homeDirectory)
    )
  )
}
