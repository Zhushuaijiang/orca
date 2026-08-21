import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DfHisEnvironmentConfig } from './config'
import {
  ensureVisionSkillInstalled,
  getVisionSkillConfigPath,
  listInstalledVisionSkillDirectories
} from './vision-skill-config'

function configWith(apiKey: string): DfHisEnvironmentConfig {
  return {
    gitlabHost: '',
    gitlabAccessToken: '',
    yunxiaoAccessToken: '',
    yunxiaoMcpUrl: '',
    hisMcpToken: '',
    hisMcpUrl: '',
    hisCodeRoot: '',
    hisWorkflowCatalogPath: '',
    archiveWorkspacePath: '',
    hisFactCardsRoot: '',
    hisFactIndexPath: '',
    ygtWorkspaceRoot: '',
    projectIndexManifestPath: '',
    projectCodeGraphPath: '',
    projectKnowledgeIndexPath: '',
    dfhisSkillPackUrl: '',
    relayExecModel: '',
    relayExecApiKey: '',
    visionApiKey: apiKey,
    skillContributionUploadToken: '',
    smtpHost: '',
    smtpPort: '',
    smtpUser: '',
    smtpPassword: '',
    smtpFromName: '',
    emailCc: ''
  }
}

const tempDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

async function makeHome(): Promise<string> {
  const home = await mkdtemp(path.join(tmpdir(), 'orca-vision-home-'))
  tempDirectories.push(home)
  return home
}

async function installVisionSkillAt(home: string, relativeRoot: string[]): Promise<string> {
  const skillDirectory = path.join(home, ...relativeRoot, 'vision')
  await mkdir(skillDirectory, { recursive: true })
  await writeFile(path.join(skillDirectory, 'vision.js'), '#!/usr/bin/env node\n')
  return skillDirectory
}

describe('vision skill config', () => {
  it('lists vision skill directories across dedicated and universal agent roots', async () => {
    const home = await makeHome()
    const codex = await installVisionSkillAt(home, ['.codex', 'skills'])
    const opencode = await installVisionSkillAt(home, ['.config', 'opencode', 'skills'])
    const universal = await installVisionSkillAt(home, ['.agents', 'skills'])

    const directories = await listInstalledVisionSkillDirectories(home)
    expect(directories.sort()).toEqual([codex, opencode, universal].sort())
  })

  it('ignores agent roots without a vision skill', async () => {
    const home = await makeHome()
    await installVisionSkillAt(home, ['.codex', 'skills'])
    const directories = await listInstalledVisionSkillDirectories(home)
    expect(directories).toEqual([path.join(home, '.codex', 'skills', 'vision')])
  })

  it('returns null config path when vision.js is missing', async () => {
    const home = await makeHome()
    const skillDirectory = path.join(home, '.codex', 'skills', 'vision')
    await mkdir(skillDirectory, { recursive: true })
    await writeFile(path.join(skillDirectory, 'SKILL.md'), '# vision\n')
    expect(await getVisionSkillConfigPath(skillDirectory)).toBeNull()
  })

  it('writes vision.config.json with the saved api key', async () => {
    const home = await makeHome()
    await installVisionSkillAt(home, ['.codex', 'skills'])
    const config = configWith('sk-vision-123')

    await ensureVisionSkillInstalled(config, home)

    const configPath = path.join(home, '.codex', 'skills', 'vision', 'vision.config.json')
    const parsed = JSON.parse(await readFile(configPath, 'utf8'))
    expect(parsed).toEqual({ apiKey: 'sk-vision-123' })
  })

  it('clears vision.config.json when the api key is empty', async () => {
    const home = await makeHome()
    const skillDirectory = await installVisionSkillAt(home, ['.codex', 'skills'])
    const configPath = path.join(skillDirectory, 'vision.config.json')
    await writeFile(configPath, '{"apiKey":"sk-stale"}\n')

    await ensureVisionSkillInstalled(configWith(''), home)

    expect(await readdir(skillDirectory)).not.toContain('vision.config.json')
  })

  it('reports when no vision skill is installed', async () => {
    const home = await makeHome()
    const messages = await ensureVisionSkillInstalled(configWith('sk-x'), home)
    expect(messages[0]).toContain('not installed')
  })
})
