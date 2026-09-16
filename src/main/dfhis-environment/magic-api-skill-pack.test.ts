import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAppEnvironment } from '../../shared/app-environment'
import {
  getDfHisEnvironmentConfigPath,
  saveDfHisEnvironmentConfig,
  snapshotDfHisEnvironmentConfig
} from './config'
import {
  checkMagicApiSkillPackPrerequisite,
  pullAndEnsureMagicApiSkillPack
} from './magic-api-skill-pack'

// Why: remote pack pulls read app version/paths through the AppEnvironment port.
setAppEnvironment({
  getPath: () => '/tmp/orca-magic-api-skill-pack-test-user-data',
  getVersion: () => '1.4.164-test',
  isPackaged: () => false,
  getAppPath: () => process.cwd(),
  onWillQuit: () => {},
  exit: () => {},
  getAppMetrics: () => []
})

const temporaryDirectories: string[] = []

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-magic-api-skill-pack-'))
  temporaryDirectories.push(directory)
  return directory
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

async function writeMagicApiSkillPackManifest(
  directory: string,
  skillPackId = 'oapi-develop'
): Promise<string> {
  const publishSkill = '---\nname: dfhis-oapi-publish\n---\nremote magic-api publish skill\n'
  const writeSkill = '---\nname: dfhis-oapi-magicapi-write\n---\nremote magic-api write skill\n'
  const sharedFile = 'export const oapi = true\n'
  const manifestPath = path.join(directory, 'oapi-develop-skill-pack.json')
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        skillPackId,
        version: 'test-pack',
        files: [
          {
            path: 'dfhis-oapi-publish/SKILL.md',
            sha256: sha256(publishSkill),
            content: publishSkill
          },
          {
            path: 'dfhis-oapi-magicapi-write/SKILL.md',
            sha256: sha256(writeSkill),
            content: writeSkill
          },
          {
            path: 'dfhis-oapi-publish/scripts/shared.mjs',
            sha256: sha256(sharedFile),
            content: sharedFile
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf8'
  )
  return manifestPath
}

describe('magic-api skill pack', () => {
  beforeEach(() => {
    delete process.env.ORCA_USER_DATA_PATH
  })

  afterEach(async () => {
    delete process.env.ORCA_USER_DATA_PATH
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('round-trips MagicAPI publishing fields and hides the password behind a has-flag', async () => {
    const userDataDirectory = await createTemporaryDirectory()
    process.env.ORCA_USER_DATA_PATH = userDataDirectory

    await saveDfHisEnvironmentConfig({
      magicApiEnvironments: '本地152=http://192.168.1.152:9059/magic/web',
      magicApiBaseUrl: 'http://192.168.1.152:9059/magic/web',
      magicApiUsername: 'admin',
      magicApiPassword: 'magic-secret',
      magicApiVersion: '2.2.2 / magic-script 1.9.0',
      magicApiSkillPackUrl:
        'http://192.168.1.10:18800/static/downloads/oapi-develop/oapi-develop-skill-pack.json'
    })

    expect(snapshotDfHisEnvironmentConfig()).toMatchObject({
      magicApiEnvironments: '本地152=http://192.168.1.152:9059/magic/web',
      magicApiBaseUrl: 'http://192.168.1.152:9059/magic/web',
      magicApiUsername: 'admin',
      magicApiPassword: 'magic-secret',
      hasMagicApiPassword: true,
      magicApiVersion: '2.2.2 / magic-script 1.9.0',
      magicApiSkillPackUrl:
        'http://192.168.1.10:18800/static/downloads/oapi-develop/oapi-develop-skill-pack.json'
    })

    await saveDfHisEnvironmentConfig({ emailCc: 'a@example.com' })
    expect(snapshotDfHisEnvironmentConfig()).toMatchObject({
      magicApiBaseUrl: 'http://192.168.1.152:9059/magic/web',
      hasMagicApiPassword: true
    })

    const raw = JSON.parse(await readFile(getDfHisEnvironmentConfigPath(userDataDirectory), 'utf8'))
    expect(raw.magicApiPassword).toBe('magic-secret')
  })

  it('pulls and installs the pack into every agent home and aggregates one readiness row', async () => {
    const homeDirectory = await createTemporaryDirectory()
    const userDataDirectory = await createTemporaryDirectory()
    process.env.ORCA_USER_DATA_PATH = userDataDirectory
    const manifestPath = await writeMagicApiSkillPackManifest(userDataDirectory)

    await saveDfHisEnvironmentConfig({ magicApiSkillPackUrl: manifestPath })
    await expect(checkMagicApiSkillPackPrerequisite(homeDirectory)).resolves.toMatchObject({
      id: 'oapi-develop-skill-pack',
      status: 'missing'
    })

    const messages = await pullAndEnsureMagicApiSkillPack(manifestPath, homeDirectory)
    expect(messages[0]).toContain('Downloaded MagicAPI skill pack')
    await expect(
      readFile(
        path.join(homeDirectory, '.codex', 'skills', 'dfhis-oapi-publish', 'SKILL.md'),
        'utf8'
      )
    ).resolves.toContain('name: dfhis-oapi-publish')
    await expect(
      readFile(
        path.join(
          homeDirectory,
          '.agents',
          'skills',
          'dfhis-oapi-publish',
          'scripts',
          'shared.mjs'
        ),
        'utf8'
      )
    ).resolves.toContain('export const oapi = true')

    const row = await checkMagicApiSkillPackPrerequisite(homeDirectory)
    expect(row).toMatchObject({ id: 'oapi-develop-skill-pack', status: 'ok' })
    expect(row?.summary).toContain('Installed and current')

    await expect(pullAndEnsureMagicApiSkillPack(manifestPath, homeDirectory)).resolves.toEqual(
      expect.arrayContaining([expect.stringContaining('is installed and current')])
    )
  })

  it('skips the pack when no URL is configured', async () => {
    const homeDirectory = await createTemporaryDirectory()
    const userDataDirectory = await createTemporaryDirectory()
    process.env.ORCA_USER_DATA_PATH = userDataDirectory

    await expect(checkMagicApiSkillPackPrerequisite(homeDirectory)).resolves.toBeNull()
    await expect(pullAndEnsureMagicApiSkillPack('  ', homeDirectory)).resolves.toEqual([])
  })

  it('refuses a manifest that declares another pack id', async () => {
    const homeDirectory = await createTemporaryDirectory()
    const userDataDirectory = await createTemporaryDirectory()
    process.env.ORCA_USER_DATA_PATH = userDataDirectory
    const manifestPath = await writeMagicApiSkillPackManifest(userDataDirectory, 'dfhis')

    await expect(pullAndEnsureMagicApiSkillPack(manifestPath, homeDirectory)).resolves.toEqual([
      expect.stringContaining('MagicAPI skill pack pull failed')
    ])
  })
})
