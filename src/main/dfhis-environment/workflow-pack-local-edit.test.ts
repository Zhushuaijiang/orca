import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { setAppEnvironment } from '../../shared/app-environment'
import {
  ensureDfHisWorkflowPackInstalled,
  getDfHisSkillPath
} from './dfhis-workflow-pack-installer'
import { DFHIS_WORKFLOW_PACK_NAMES } from './dfhis-workflow-pack-targets'
import { installRemoteDfHisWorkflowPack } from './remote-workflow-pack-installer'

const testEnvironment = {
  getPath: () => '/tmp/orca-workflow-pack-local-edit-test',
  getVersion: () => '1.4.164-test',
  isPackaged: () => false,
  getAppPath: () => process.cwd(),
  onWillQuit: () => {},
  exit: () => {},
  getAppMetrics: () => []
}

setAppEnvironment(testEnvironment)

const temporaryDirectories: string[] = []

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-workflow-pack-local-edit-'))
  temporaryDirectories.push(directory)
  return directory
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

async function writeRemoteSkillPackManifest(directory: string): Promise<string> {
  const files = DFHIS_WORKFLOW_PACK_NAMES.map((name) => {
    const content = `---\nname: ${name}\n---\nremote ${name} skill\n`
    return { path: `${name}/SKILL.md`, sha256: sha256(content), content }
  })
  const manifestPath = path.join(directory, 'dfhis-skill-pack.json')
  await writeFile(
    manifestPath,
    `${JSON.stringify({ schemaVersion: 1, skillPackId: 'dfhis', version: 'test-pack', files }, null, 2)}\n`
  )
  return manifestPath
}

describe('DFHIS workflow pack local edits', () => {
  afterEach(async () => {
    delete process.env.ORCA_USER_DATA_PATH
    setAppEnvironment(testEnvironment)
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('keeps a locally edited skill when another skill in the pulled pack changes', async () => {
    const homeDirectory = await createTemporaryDirectory()
    const userDataDirectory = await createTemporaryDirectory()
    process.env.ORCA_USER_DATA_PATH = userDataDirectory
    await installRemoteDfHisWorkflowPack(
      await writeRemoteSkillPackManifest(userDataDirectory),
      homeDirectory
    )

    const contactsPath = path.join(
      homeDirectory,
      '.codex',
      'skills',
      'yunxiao-contacts',
      'SKILL.md'
    )
    const mergePath = path.join(homeDirectory, '.codex', 'skills', 'his-release-merge', 'SKILL.md')
    await writeFile(contactsPath, 'local contacts edit', 'utf8')
    const cacheRoot = path.join(userDataDirectory, 'dfhis-workflow-pack-cache', 'dfhis')
    await writeFile(
      path.join(cacheRoot, 'yunxiao-contacts', 'SKILL.md'),
      '---\nname: yunxiao-contacts\n---\nremote contacts skill updated\n',
      'utf8'
    )
    const installedManifestPath = path.join(
      homeDirectory,
      '.codex',
      'skills',
      '.orca-dfhis-workflow-pack.json'
    )
    const installedManifest = JSON.parse(await readFile(installedManifestPath, 'utf8')) as {
      skillHashes?: Record<string, string>
      packageHash: string
    }
    delete installedManifest.skillHashes
    installedManifest.packageHash = 'a'.repeat(64)
    await writeFile(installedManifestPath, `${JSON.stringify(installedManifest, null, 2)}\n`)

    await ensureDfHisWorkflowPackInstalled(homeDirectory)
    await expect(readFile(contactsPath, 'utf8')).resolves.toBe('local contacts edit')
    await expect(readFile(mergePath, 'utf8')).resolves.toContain('remote his-release-merge skill')

    await writeFile(
      path.join(cacheRoot, 'his-release-merge', 'SKILL.md'),
      '---\nname: his-release-merge\n---\nremote merge skill updated\n',
      'utf8'
    )
    await ensureDfHisWorkflowPackInstalled(homeDirectory)
    await expect(readFile(contactsPath, 'utf8')).resolves.toBe('local contacts edit')
    await expect(readFile(mergePath, 'utf8')).resolves.toContain('remote merge skill updated')
  })

  it('keeps a pulled DFHIS pack after the app version changes', async () => {
    const homeDirectory = await createTemporaryDirectory()
    const userDataDirectory = await createTemporaryDirectory()
    process.env.ORCA_USER_DATA_PATH = userDataDirectory
    await installRemoteDfHisWorkflowPack(
      await writeRemoteSkillPackManifest(userDataDirectory),
      homeDirectory
    )
    setAppEnvironment({ ...testEnvironment, getVersion: () => '1.4.164-upgraded' })

    await ensureDfHisWorkflowPackInstalled(homeDirectory)
    await expect(readFile(getDfHisSkillPath(homeDirectory), 'utf8')).resolves.toContain(
      'remote yunxiao-requirement-archiver skill'
    )
  })
})
