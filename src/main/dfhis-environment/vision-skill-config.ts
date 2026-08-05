import { constants } from 'node:fs'
import { access, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  AGENT_SKILL_HOME_DIRECTORIES,
  UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY
} from '../../shared/agent-skill-home-directories'
import type { TuiAgent } from '../../shared/types'
import type { DfHisEnvironmentConfig } from './config'

export const VISION_SKILL_DIRECTORY_NAME = 'vision'
export const VISION_SKILL_CONFIG_FILE_NAME = 'vision.config.json'

export async function listInstalledVisionSkillDirectories(
  homeDirectory = homedir()
): Promise<string[]> {
  const roots = new Set<string>()
  for (const [, relativeDirectory] of Object.entries(AGENT_SKILL_HOME_DIRECTORIES) as [
    TuiAgent,
    readonly string[]
  ][]) {
    if (relativeDirectory) {
      roots.add(path.join(homeDirectory, ...relativeDirectory))
    }
  }
  roots.add(path.join(homeDirectory, ...UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY))
  const directories: string[] = []
  for (const root of roots) {
    let entries: string[] = []
    try {
      entries = await readdir(root)
    } catch {
      continue
    }
    if (entries.includes(VISION_SKILL_DIRECTORY_NAME)) {
      directories.push(path.join(root, VISION_SKILL_DIRECTORY_NAME))
    }
  }
  return directories
}

export async function getVisionSkillConfigPath(skillDirectory: string): Promise<string | null> {
  try {
    await access(path.join(skillDirectory, 'vision.js'), constants.F_OK)
    return path.join(skillDirectory, VISION_SKILL_CONFIG_FILE_NAME)
  } catch {
    return null
  }
}

export async function writeVisionSkillConfig(
  apiKey: string,
  homeDirectory = homedir()
): Promise<string[]> {
  const messages: string[] = []
  const directories = await listInstalledVisionSkillDirectories(homeDirectory)
  if (directories.length === 0) {
    return ['Vision skill is not installed in any agent skills root; nothing to configure.']
  }
  for (const skillDirectory of directories) {
    const configPath = await getVisionSkillConfigPath(skillDirectory)
    if (!configPath) {
      continue
    }
    if (apiKey) {
      await writeFile(configPath, `${JSON.stringify({ apiKey }, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600
      })
      messages.push(`Vision API key configured for ${path.relative(homedir(), skillDirectory)}.`)
    } else {
      await rm(configPath, { force: true })
      messages.push(`Vision skill config cleared for ${path.relative(homedir(), skillDirectory)}.`)
    }
  }
  return messages
}

export async function ensureVisionSkillInstalled(
  config: DfHisEnvironmentConfig,
  homeDirectory = homedir()
): Promise<string[]> {
  return writeVisionSkillConfig(config.visionApiKey, homeDirectory)
}
