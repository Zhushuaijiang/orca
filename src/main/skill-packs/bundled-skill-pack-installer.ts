import { homedir } from 'node:os'
import path from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import type { DfHisEnvironmentPrerequisiteResult } from '../../shared/dfhis-environment-types'
import {
  assertBundledSkillPackExists,
  copyBundledSkillPack,
  findMissingBundledSkill,
  getBundledSkillPackPath,
  getTargetDirectory,
  hashPackDirectory,
  listPackFiles,
  readManifest,
  writeManifest
} from './bundled-skill-pack-files'
import { planSkillSync } from './bundled-skill-pack-sync'
import type {
  BundledSkillPackDefinition,
  BundledSkillPackTarget,
  EnvironmentBundledSkillPackDefinition
} from './bundled-skill-pack-types'

export type {
  BundledSkillPackDefinition,
  BundledSkillPackManifest,
  BundledSkillPackTarget
} from './bundled-skill-pack-types'

function getAppVersion(): string {
  return getAppEnvironment().getVersion()
}

function sameSkillHashes(
  left: Record<string, string> | undefined,
  right: Record<string, string>
): boolean {
  const current = left ?? {}
  const currentKeys = Object.keys(current)
  const nextKeys = Object.keys(right)
  return (
    currentKeys.length === nextKeys.length &&
    nextKeys.every((name) => current[name] === right[name])
  )
}

async function checkBundledSkillPackTarget(
  definition: EnvironmentBundledSkillPackDefinition,
  target: EnvironmentBundledSkillPackDefinition['targets'][number],
  sourceDirectory: string,
  sourceHash: string,
  sourceFiles: readonly string[],
  homeDirectory: string
): Promise<DfHisEnvironmentPrerequisiteResult> {
  const targetDirectory = getTargetDirectory(target, homeDirectory)
  const missingSkillName = await findMissingBundledSkill(definition, targetDirectory)
  if (missingSkillName) {
    return {
      id: target.id,
      label: target.label,
      status: 'missing',
      summary: `${missingSkillName} is not installed`,
      detail: targetDirectory,
      fixable: true
    }
  }

  let installedHash: string
  try {
    installedHash = await hashPackDirectory(definition, targetDirectory, sourceFiles)
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
  const plan = await planSkillSync(definition, sourceDirectory, targetDirectory, sourceHash)
  if (installedHash === sourceHash || (plan.copy.length === 0 && plan.preserve.length === 0)) {
    return {
      id: target.id,
      label: target.label,
      status: 'ok',
      summary: (await readManifest(definition, targetDirectory))
        ? 'Installed and current'
        : 'Installed; manifest will be refreshed on repair',
      detail: targetDirectory,
      fixable: true
    }
  }
  if (plan.copy.length === 0) {
    return {
      id: target.id,
      label: target.label,
      status: 'invalid',
      summary: 'Installed pack has local modifications',
      detail: targetDirectory,
      fixable: false
    }
  }

  return {
    id: target.id,
    label: target.label,
    status: 'invalid',
    summary: (await readManifest(definition, targetDirectory))
      ? 'Installed pack is outdated'
      : 'Legacy pack differs from bundled version',
    detail: targetDirectory,
    fixable: true
  }
}

async function installBundledSkillPackTarget(
  definition: EnvironmentBundledSkillPackDefinition,
  target: EnvironmentBundledSkillPackDefinition['targets'][number],
  sourceDirectory: string,
  sourceHash: string,
  sourceFiles: readonly string[],
  homeDirectory: string
): Promise<string> {
  const targetDirectory = getTargetDirectory(target, homeDirectory)
  const current = await checkBundledSkillPackTarget(
    definition,
    target,
    sourceDirectory,
    sourceHash,
    sourceFiles,
    homeDirectory
  )
  const plan = await planSkillSync(definition, sourceDirectory, targetDirectory, sourceHash)
  const manifest = await readManifest(definition, targetDirectory)
  const hashesMatch = sameSkillHashes(manifest?.skillHashes, plan.skillHashes)
  if (plan.copy.length === 0) {
    if (!hashesMatch || manifest?.packageHash !== sourceHash) {
      await writeManifest(
        definition,
        target,
        targetDirectory,
        sourceHash,
        getAppVersion(),
        plan.skillHashes
      )
    }
    if (plan.preserve.length > 0 || (current.status === 'invalid' && !current.fixable)) {
      return `${target.label} has local modifications; leaving ${targetDirectory} unchanged.`
    }
    return `${target.label} is installed and current at ${targetDirectory}.`
  }
  await copyBundledSkillPack(definition, sourceDirectory, targetDirectory, plan.copy)
  await writeManifest(
    definition,
    target,
    targetDirectory,
    sourceHash,
    getAppVersion(),
    plan.skillHashes
  )
  if (plan.preserve.length > 0) {
    return `Updated ${target.label}; kept local modifications in ${plan.preserve.join(', ')}.`
  }
  return `Installed ${target.label} to ${targetDirectory}.`
}

export function getBundledSkillPackSkillPath<
  SkillName extends string,
  Target extends BundledSkillPackTarget
>(
  definition: BundledSkillPackDefinition<SkillName, Target>,
  providerTarget: Target['providerTarget'],
  homeDirectory = homedir(),
  skillName: SkillName = definition.skillNames[0]
): string {
  const target = definition.targets.find((candidate) => candidate.providerTarget === providerTarget)
  if (!target) {
    throw new Error(`Unknown ${definition.label} target: ${providerTarget}`)
  }
  return path.join(getTargetDirectory(target, homeDirectory), skillName, 'SKILL.md')
}

export async function checkBundledSkillPackPrerequisites(
  definition: EnvironmentBundledSkillPackDefinition,
  homeDirectory = homedir(),
  sourceDirectory = getBundledSkillPackPath(definition)
): Promise<DfHisEnvironmentPrerequisiteResult[]> {
  await assertBundledSkillPackExists(definition, sourceDirectory)
  const sourceFiles = await listPackFiles(definition, sourceDirectory)
  const sourceHash = await hashPackDirectory(definition, sourceDirectory, sourceFiles)
  return Promise.all(
    definition.targets.map((target) =>
      checkBundledSkillPackTarget(
        definition,
        target,
        sourceDirectory,
        sourceHash,
        sourceFiles,
        homeDirectory
      )
    )
  )
}

export async function ensureBundledSkillPackInstalled(
  definition: EnvironmentBundledSkillPackDefinition,
  homeDirectory = homedir(),
  sourceDirectory = getBundledSkillPackPath(definition)
): Promise<string[]> {
  await assertBundledSkillPackExists(definition, sourceDirectory)
  const sourceFiles = await listPackFiles(definition, sourceDirectory)
  const sourceHash = await hashPackDirectory(definition, sourceDirectory, sourceFiles)
  return Promise.all(
    definition.targets.map((target) =>
      installBundledSkillPackTarget(
        definition,
        target,
        sourceDirectory,
        sourceHash,
        sourceFiles,
        homeDirectory
      )
    )
  )
}
