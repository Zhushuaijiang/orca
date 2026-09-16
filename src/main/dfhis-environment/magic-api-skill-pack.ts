import { homedir } from 'node:os'
import path from 'node:path'
import type {
  DfHisEnvironmentPrerequisiteId,
  DfHisEnvironmentPrerequisiteResult
} from '../../shared/dfhis-environment-types'
import {
  checkBundledSkillPackPrerequisites,
  ensureBundledSkillPackInstalled
} from '../skill-packs/bundled-skill-pack-installer'
import type { EnvironmentBundledSkillPackDefinition } from '../skill-packs/bundled-skill-pack-types'
import {
  getTargetDirectory,
  hashPackDirectory,
  listPackFiles,
  pathExists
} from '../skill-packs/bundled-skill-pack-files'
import { readDfHisEnvironmentConfigSync } from './config'
import { WORKFLOW_PACK_TARGETS } from './dfhis-workflow-pack-targets'
import {
  getCachedRemoteSkillPackPathIfPresent,
  installRemoteSkillPack,
  type RemoteSkillPackOptions
} from './remote-workflow-pack-installer'

const MAGIC_API_SKILL_PACK_ID = 'oapi-develop'
const MAGIC_API_SKILL_PACK_LABEL = 'MagicAPI skill pack'

// Why: a distinct manifest file per pack — the DFHIS and MagicAPI packs install
// into the same agent homes and must not overwrite each other's provenance.
const MAGIC_API_SKILL_PACK_MANIFEST_FILE_NAME = '.orca-oapi-develop-skill-pack.json'

/** Remote-only pack: skills are discovered from the pulled manifest, so no
 * app-bundled resource path or fixed skill-name list is maintained here. */
export const MAGIC_API_SKILL_PACK: EnvironmentBundledSkillPackDefinition = {
  id: MAGIC_API_SKILL_PACK_ID,
  label: MAGIC_API_SKILL_PACK_LABEL,
  bundledResourcePath: '',
  manifestFileName: MAGIC_API_SKILL_PACK_MANIFEST_FILE_NAME,
  skillNames: [],
  targets: WORKFLOW_PACK_TARGETS.map((target) => ({
    id: target.id.replace(
      'dfhis-workflow-pack',
      'oapi-develop-skill-pack'
    ) as DfHisEnvironmentPrerequisiteId,
    providerTarget: target.providerTarget,
    label: target.label.replace('DFHIS workflow pack', MAGIC_API_SKILL_PACK_LABEL),
    relativeDirectory: target.relativeDirectory
  }))
}

const MAGIC_API_REMOTE_PACK: RemoteSkillPackOptions = {
  cacheDirectoryName: 'oapi-develop-skill-pack-cache',
  packId: MAGIC_API_SKILL_PACK_ID,
  label: MAGIC_API_SKILL_PACK_LABEL,
  definition: MAGIC_API_SKILL_PACK,
  // Why: unlike the DFHIS pack there is no bundled copy to fall back to after an
  // app upgrade, so the pull cache stays the repair source.
  retainCacheAcrossAppUpgrades: true
}

export function getCachedMagicApiSkillPackPathIfPresent(): Promise<string | null> {
  return getCachedRemoteSkillPackPathIfPresent(MAGIC_API_REMOTE_PACK)
}

async function countInstalledTargets(cachePath: string, homeDirectory: string): Promise<number> {
  const sourceFiles = await listPackFiles(MAGIC_API_SKILL_PACK, cachePath)
  const installed = await Promise.all(
    MAGIC_API_SKILL_PACK.targets.map(async (target) => {
      const targetDirectory = getTargetDirectory(target, homeDirectory)
      if (!(await pathExists(path.join(targetDirectory, MAGIC_API_SKILL_PACK.manifestFileName)))) {
        return false
      }
      try {
        await hashPackDirectory(MAGIC_API_SKILL_PACK, targetDirectory, sourceFiles)
        return true
      } catch {
        return false
      }
    })
  )
  return installed.filter(Boolean).length
}

/** Aggregated readiness row for the optional MagicAPI skill pack. Returns null
 * when no pack URL is configured so the checklist never grows an empty row. */
export async function checkMagicApiSkillPackPrerequisite(
  homeDirectory = homedir()
): Promise<DfHisEnvironmentPrerequisiteResult | null> {
  const config = readDfHisEnvironmentConfigSync()
  if (!config.magicApiSkillPackUrl.trim()) {
    return null
  }

  const cachePath = await getCachedMagicApiSkillPackPathIfPresent()
  if (!cachePath) {
    return {
      id: 'oapi-develop-skill-pack',
      label: MAGIC_API_SKILL_PACK_LABEL,
      status: 'missing',
      summary: 'MagicAPI skill pack is not installed yet',
      detail: 'Run Install / repair to pull the pack from its configured URL.',
      fixable: true
    }
  }

  if ((await countInstalledTargets(cachePath, homeDirectory)) === 0) {
    return {
      id: 'oapi-develop-skill-pack',
      label: MAGIC_API_SKILL_PACK_LABEL,
      status: 'missing',
      summary: 'MagicAPI skill pack is not installed in any agent home',
      detail: 'Run Install / repair to install the pulled pack.',
      fixable: true
    }
  }

  const targetResults = await checkBundledSkillPackPrerequisites(
    MAGIC_API_SKILL_PACK,
    homeDirectory,
    cachePath
  )
  const failing = targetResults.filter((result) => result.status !== 'ok')
  if (failing.length === 0) {
    return {
      id: 'oapi-develop-skill-pack',
      label: MAGIC_API_SKILL_PACK_LABEL,
      status: 'ok',
      summary: `Installed and current in ${targetResults.length} agent homes`,
      fixable: true
    }
  }
  return {
    id: 'oapi-develop-skill-pack',
    label: MAGIC_API_SKILL_PACK_LABEL,
    status: failing.some((result) => result.status === 'invalid') ? 'invalid' : 'missing',
    summary: `${failing.length} of ${targetResults.length} agent homes need repair`,
    detail: failing.map((result) => `${result.label}: ${result.summary}`).join('; '),
    fixable: failing.some((result) => result.fixable)
  }
}

/** One-click setup step for the optional MagicAPI pack: an empty URL is a
 * deliberate skip, not a failure. A failed pull still repairs from the last
 * good cache so installed skills keep working offline. */
export async function pullAndEnsureMagicApiSkillPack(
  skillPackUrl: string,
  homeDirectory = homedir()
): Promise<string[]> {
  const trimmedUrl = skillPackUrl.trim()
  if (!trimmedUrl) {
    return []
  }
  try {
    return await installRemoteSkillPack(trimmedUrl, MAGIC_API_REMOTE_PACK, homeDirectory)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const messages = [`MagicAPI skill pack pull failed: ${reason}`]
    const cachePath = await getCachedMagicApiSkillPackPathIfPresent()
    if (cachePath) {
      messages.push(
        ...(await ensureBundledSkillPackInstalled(MAGIC_API_SKILL_PACK, homeDirectory, cachePath))
      )
    }
    return messages
  }
}
