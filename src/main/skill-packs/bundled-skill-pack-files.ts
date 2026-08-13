import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import type {
  BundledSkillPackDefinition,
  BundledSkillPackManifest,
  BundledSkillPackTarget
} from './bundled-skill-pack-types'

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function getBundledSkillPackPath(definition: BundledSkillPackDefinition): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, definition.bundledResourcePath)
    : path.join(process.cwd(), 'resources', definition.bundledResourcePath)
}

export function getTargetDirectory(target: BundledSkillPackTarget, homeDirectory: string): string {
  return path.join(homeDirectory, ...target.relativeDirectory)
}

export function getTargetManifestPath(
  definition: BundledSkillPackDefinition,
  targetDirectory: string
): string {
  return path.join(targetDirectory, definition.manifestFileName)
}

export function shouldSkipPackFile(filePath: string, manifestFileName: string): boolean {
  const parts = filePath.split(path.sep)
  return (
    parts.includes('__pycache__') ||
    parts.includes('.DS_Store') ||
    parts.at(-1) === manifestFileName
  )
}

export async function listPackFiles(
  definition: BundledSkillPackDefinition,
  directory: string,
  baseDirectory = directory
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    const relativePath = path.relative(baseDirectory, fullPath)
    if (shouldSkipPackFile(relativePath, definition.manifestFileName)) {
      continue
    }
    if (entry.isDirectory()) {
      files.push(...(await listPackFiles(definition, fullPath, baseDirectory)))
    } else if (entry.isFile()) {
      files.push(relativePath)
    }
  }
  return files.sort((left, right) => left.localeCompare(right, 'en'))
}

export async function hashPackDirectory(
  definition: BundledSkillPackDefinition,
  directory: string,
  relativePaths?: readonly string[]
): Promise<string> {
  const hash = createHash('sha256')
  const files = relativePaths
    ? [...relativePaths].sort((left, right) => left.localeCompare(right, 'en'))
    : await listPackFiles(definition, directory)
  for (const relativePath of files) {
    const normalizedPath = relativePath.split(path.sep).join('/')
    hash.update(normalizedPath)
    hash.update('\0')
    hash.update(await readFile(path.join(directory, relativePath)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

export async function readManifest(
  definition: BundledSkillPackDefinition,
  targetDirectory: string
): Promise<BundledSkillPackManifest | null> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(getTargetManifestPath(definition, targetDirectory), 'utf8')
    )
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    const manifest = parsed as Partial<BundledSkillPackManifest>
    if (
      manifest.schemaVersion !== 1 ||
      typeof manifest.packageHash !== 'string' ||
      typeof manifest.providerTarget !== 'string' ||
      typeof manifest.installedAt !== 'string' ||
      typeof manifest.orcaVersion !== 'string'
    ) {
      return null
    }
    return manifest as BundledSkillPackManifest
  } catch {
    return null
  }
}

export async function copyBundledSkillPack(
  definition: BundledSkillPackDefinition,
  sourceDirectory: string,
  targetDirectory: string
): Promise<void> {
  await mkdir(targetDirectory, { recursive: true })
  const sourceEntries = await readdir(sourceDirectory, { withFileTypes: true })
  const skillNames = (
    await Promise.all(
      sourceEntries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => ({
          name: entry.name,
          isSkill: await pathExists(path.join(sourceDirectory, entry.name, 'SKILL.md'))
        }))
    )
  )
    .filter((entry) => entry.isSkill)
    .map((entry) => entry.name)
  await Promise.all(
    skillNames.map((skillName) => {
      const skillSourceDirectory = path.join(sourceDirectory, skillName)
      return cp(skillSourceDirectory, path.join(targetDirectory, skillName), {
        recursive: true,
        force: true,
        errorOnExist: false,
        filter: (source) =>
          !shouldSkipPackFile(
            path.relative(skillSourceDirectory, source),
            definition.manifestFileName
          )
      })
    })
  )
}

export async function findMissingBundledSkill(
  definition: BundledSkillPackDefinition,
  sourceDirectory: string
): Promise<string | null> {
  const missingSkill = (
    await Promise.all(
      definition.skillNames.map(async (skillName) => ({
        skillName,
        exists: await pathExists(path.join(sourceDirectory, skillName, 'SKILL.md'))
      }))
    )
  ).find((skill) => !skill.exists)
  return missingSkill?.skillName ?? null
}

export async function assertBundledSkillPackExists(
  definition: BundledSkillPackDefinition,
  sourceDirectory: string
): Promise<void> {
  const missingSkillName = await findMissingBundledSkill(definition, sourceDirectory)
  if (missingSkillName) {
    throw new Error(
      `Bundled ${definition.label} is missing ${missingSkillName} at ${sourceDirectory}.`
    )
  }
}

export async function writeManifest(
  definition: BundledSkillPackDefinition,
  target: BundledSkillPackTarget,
  targetDirectory: string,
  packageHash: string,
  orcaVersion: string
): Promise<void> {
  const manifest: BundledSkillPackManifest = {
    schemaVersion: 1,
    skillPackId: definition.id,
    source: 'app-bundle',
    packageHash,
    providerTarget: target.providerTarget,
    installedAt: new Date().toISOString(),
    orcaVersion
  }
  await writeFile(
    getTargetManifestPath(definition, targetDirectory),
    `${JSON.stringify(manifest, null, 2)}\n`,
    {
      mode: 0o644
    }
  )
}
