import { realpath } from 'node:fs/promises'
import path from 'node:path'
import {
  getBundledSkillPackPath,
  hashSkillDirectory,
  listBundledSkillNames,
  pathExists,
  readManifest
} from './bundled-skill-pack-files'
import type { EnvironmentBundledSkillPackDefinition } from './bundled-skill-pack-types'

export type SkillSyncPlan = {
  copy: string[]
  preserve: string[]
  skillHashes: Record<string, string>
}

async function isSameDirectory(left: string, right: string): Promise<boolean> {
  try {
    return (await realpath(left)) === (await realpath(right))
  } catch {
    return path.resolve(left) === path.resolve(right)
  }
}

async function installedSkillHash(
  definition: EnvironmentBundledSkillPackDefinition,
  skillDirectory: string
): Promise<string | null> {
  if (!(await pathExists(path.join(skillDirectory, 'SKILL.md')))) {
    return null
  }
  return hashSkillDirectory(definition, skillDirectory)
}

// Why: a pack-wide hash change used to replace every skill, so an edit to one
// skill was lost when any other skill updated. Compare each skill with the
// upstream hash recorded at install. Without that record, keep a skill that
// matches neither the incoming pack nor the app bundle — that is the local edit.
export async function planSkillSync(
  definition: EnvironmentBundledSkillPackDefinition,
  sourceDirectory: string,
  targetDirectory: string,
  sourceHash: string
): Promise<SkillSyncPlan> {
  const manifest = await readManifest(definition, targetDirectory)
  const recordedHashes = manifest?.skillHashes
  const sourceUnchanged = manifest?.packageHash === sourceHash
  const bundledDirectory = getBundledSkillPackPath(definition)
  const sourceIsBundle = await isSameDirectory(sourceDirectory, bundledDirectory)
  const skillNames = await listBundledSkillNames(sourceDirectory)
  const copy: string[] = []
  const preserve: string[] = []
  const skillHashes: Record<string, string> = {}

  for (const skillName of skillNames) {
    const sourceSkillHash = await hashSkillDirectory(
      definition,
      path.join(sourceDirectory, skillName)
    )
    const installedHash = await installedSkillHash(
      definition,
      path.join(targetDirectory, skillName)
    )
    if (!installedHash) {
      copy.push(skillName)
      skillHashes[skillName] = sourceSkillHash
      continue
    }
    if (installedHash === sourceSkillHash) {
      skillHashes[skillName] = sourceSkillHash
      continue
    }

    const recordedHash = recordedHashes?.[skillName]
    if (recordedHash) {
      if (installedHash === recordedHash) {
        copy.push(skillName)
        skillHashes[skillName] = sourceSkillHash
      } else {
        preserve.push(skillName)
        skillHashes[skillName] = recordedHash
      }
      continue
    }

    if (manifest && sourceUnchanged) {
      preserve.push(skillName)
      skillHashes[skillName] = sourceSkillHash
      continue
    }

    if (manifest && !sourceIsBundle) {
      const bundledHash = await installedSkillHash(
        definition,
        path.join(bundledDirectory, skillName)
      )
      if (bundledHash && installedHash === bundledHash) {
        copy.push(skillName)
        skillHashes[skillName] = sourceSkillHash
        continue
      }
      preserve.push(skillName)
      skillHashes[skillName] = sourceSkillHash
      continue
    }

    copy.push(skillName)
    skillHashes[skillName] = sourceSkillHash
  }

  return { copy, preserve, skillHashes }
}
