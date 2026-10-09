import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { getBundledSkillDiscoveryMarkdown } from '../../shared/bundled-skill-discovery'
import {
  AGENT_SKILL_HOME_DIRECTORIES,
  UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY
} from '../../shared/agent-skill-home-directories'
import { getProfileUserDataPath } from '../orca-profiles/profile-storage-paths'
import { writePluginFileAtomically } from '../plugins/plugin-atomic-file-write'
import { ensureBundledSkillPackInstalled } from './bundled-skill-pack-installer'
import type { BundledSkillPackDefinition } from './bundled-skill-pack-types'

const DEFINITION: BundledSkillPackDefinition = {
  id: 'orca-automatic-task-routing',
  label: 'Orca automatic task routing',
  bundledResourcePath: 'automatic-task-routing',
  manifestFileName: '.orca-automatic-task-routing.json',
  skillNames: ['orca-auto-routing'],
  targets: [
    {
      id: 'automatic-routing-universal',
      providerTarget: 'agent-skills',
      label: 'Automatic routing for universal agent skills',
      relativeDirectory: UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY
    },
    ...Object.entries(AGENT_SKILL_HOME_DIRECTORIES).map(([agent, relativeDirectory]) => ({
      id: `automatic-routing-${agent}`,
      providerTarget: agent,
      label: `Automatic routing for ${agent}`,
      relativeDirectory
    }))
  ]
}

export async function ensureAutomaticRoutingSkillInstalled(
  homeDirectory = homedir(),
  stateDirectory = getProfileUserDataPath()
): Promise<string[]> {
  const markdown = getBundledSkillDiscoveryMarkdown('orca-auto-routing')
  if (!markdown) {
    throw new Error('The bundled automatic routing discovery skill is missing.')
  }
  const source = path.join(stateDirectory, 'bundled-skill-sources', 'automatic-task-routing')
  const skillDirectory = path.join(source, 'orca-auto-routing')
  await mkdir(skillDirectory, { recursive: true })
  await writePluginFileAtomically(path.join(skillDirectory, 'SKILL.md'), markdown, { mode: 0o600 })
  return ensureBundledSkillPackInstalled(DEFINITION, homeDirectory, source)
}

let installation: Promise<unknown> | null = null
export function startAutomaticRoutingSkillInstallation(): void {
  installation ??= ensureAutomaticRoutingSkillInstalled().catch((error) =>
    console.warn('[automatic-routing] Skill installation failed:', error)
  )
}
