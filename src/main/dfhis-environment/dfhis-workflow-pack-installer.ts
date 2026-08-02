import { homedir } from 'node:os'
import type { DfHisEnvironmentPrerequisiteResult } from '../../shared/dfhis-environment-types'
import {
  checkBundledSkillPackPrerequisites,
  ensureBundledSkillPackInstalled,
  getBundledSkillPackSkillPath
} from '../skill-packs/bundled-skill-pack-installer'
import {
  DFHIS_BUNDLED_SKILL_PACK,
  type DfHisWorkflowPackName,
  type DfHisWorkflowPackTarget
} from './dfhis-workflow-pack-targets'
import {
  getCachedDfHisWorkflowPackPathIfPresent,
  installRemoteDfHisWorkflowPack
} from './remote-workflow-pack-installer'

export function getDfHisWorkflowPackPath(
  providerTarget: DfHisWorkflowPackTarget['providerTarget'] = 'codex',
  homeDirectory = homedir(),
  packName: DfHisWorkflowPackName = 'yunxiao-requirement-archiver'
): string {
  return getBundledSkillPackSkillPath(
    DFHIS_BUNDLED_SKILL_PACK,
    providerTarget,
    homeDirectory,
    packName
  )
}

export function getDfHisSkillPath(homeDirectory = homedir()): string {
  return getDfHisWorkflowPackPath('codex', homeDirectory)
}

export async function checkDfHisWorkflowPackPrerequisites(
  homeDirectory = homedir()
): Promise<DfHisEnvironmentPrerequisiteResult[]> {
  return checkBundledSkillPackPrerequisites(
    DFHIS_BUNDLED_SKILL_PACK,
    homeDirectory,
    (await getCachedDfHisWorkflowPackPathIfPresent()) ?? undefined
  )
}

export async function ensureDfHisWorkflowPackInstalled(
  homeDirectory = homedir()
): Promise<string[]> {
  return ensureBundledSkillPackInstalled(
    DFHIS_BUNDLED_SKILL_PACK,
    homeDirectory,
    (await getCachedDfHisWorkflowPackPathIfPresent()) ?? undefined
  )
}

/** One-click setup step: pull the team pack when a URL is configured, then
 * install everywhere; a failed pull falls back to the bundled/cached pack so
 * agents never end up without skills. */
export async function pullAndEnsureDfHisWorkflowPack(
  skillPackUrl: string,
  homeDirectory = homedir()
): Promise<string[]> {
  const trimmedUrl = skillPackUrl.trim()
  if (!trimmedUrl) {
    return ensureDfHisWorkflowPackInstalled(homeDirectory)
  }
  try {
    return await installRemoteDfHisWorkflowPack(trimmedUrl, homeDirectory)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return [
      `DFHIS skill pack pull failed: ${reason}`,
      ...(await ensureDfHisWorkflowPackInstalled(homeDirectory))
    ]
  }
}
