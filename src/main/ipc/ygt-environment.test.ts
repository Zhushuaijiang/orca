import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkHisMcpPrerequisite,
  checkYgtSkillPrerequisite,
  checkYunxiaoMcpPrerequisite,
  ensureYgtSkillInstalled,
  getYgtSkillPath
} from './ygt-environment'
import {
  getYgtEnvironmentConfigPath,
  saveYgtEnvironmentConfig,
  snapshotYgtEnvironmentConfig
} from '../ygt-environment/config'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/orca-ygt-env-test-user-data'
  },
  ipcMain: {
    handle: vi.fn()
  }
}))

const temporaryDirectories: string[] = []

async function createTemporaryHome(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-ygt-env-'))
  temporaryDirectories.push(directory)
  return directory
}

describe('ygt-environment', () => {
  afterEach(async () => {
    delete process.env.ORCA_USER_DATA_PATH
    delete process.env.YUNXIAO_ACCESS_TOKEN
    delete process.env.YUNXIAO_MCP_URL
    delete process.env.HIS_MCP_TOKEN
    delete process.env.HIS_MCP_URL
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('detects and installs the YGT skill in the Codex home', async () => {
    const homeDirectory = await createTemporaryHome()

    await expect(checkYgtSkillPrerequisite(homeDirectory)).resolves.toMatchObject({
      id: 'ygt-skill',
      status: 'missing',
      fixable: true
    })

    await expect(ensureYgtSkillInstalled(homeDirectory)).resolves.toContain('Installed YGT skill')
    await expect(checkYgtSkillPrerequisite(homeDirectory)).resolves.toMatchObject({
      id: 'ygt-skill',
      status: 'ok',
      fixable: true
    })

    await expect(readFile(getYgtSkillPath(homeDirectory), 'utf8')).resolves.toContain('name: ygt')
  })

  it('keeps an existing YGT skill file intact', async () => {
    const homeDirectory = await createTemporaryHome()
    const skillPath = getYgtSkillPath(homeDirectory)
    await mkdir(path.dirname(skillPath), { recursive: true })
    await writeFile(skillPath, 'custom skill body', 'utf8')

    await expect(ensureYgtSkillInstalled(homeDirectory)).resolves.toContain('already exists')
    await expect(readFile(skillPath, 'utf8')).resolves.toBe('custom skill body')
  })

  it('reports Yunxiao MCP token readiness without exposing the token', () => {
    expect(checkYunxiaoMcpPrerequisite()).toMatchObject({
      id: 'yunxiao-mcp',
      status: 'missing',
      command: 'export YUNXIAO_ACCESS_TOKEN=...'
    })

    process.env.YUNXIAO_ACCESS_TOKEN = 'secret-token'
    const result = checkYunxiaoMcpPrerequisite()
    expect(result.status).toBe('ok')
    expect(result.detail).not.toContain('secret-token')
  })

  it('reports HIS MCP credential readiness without exposing the token', () => {
    expect(checkHisMcpPrerequisite()).toMatchObject({
      id: 'his-mcp',
      status: 'missing',
      command: 'export HIS_MCP_TOKEN=...'
    })

    process.env.HIS_MCP_TOKEN = 'secret-token'
    const result = checkHisMcpPrerequisite()
    expect(result.status).toBe('ok')
    expect(result.detail).not.toContain('secret-token')
  })

  it('uses saved config for MCP readiness without exposing tokens', async () => {
    const userDataDirectory = await createTemporaryHome()
    process.env.ORCA_USER_DATA_PATH = userDataDirectory

    await saveYgtEnvironmentConfig({
      gitlabAccessToken: 'gitlab-secret',
      yunxiaoAccessToken: 'yunxiao-secret',
      hisMcpToken: 'his-secret'
    })

    expect(snapshotYgtEnvironmentConfig()).toMatchObject({
      hasGitlabAccessToken: true,
      hasYunxiaoAccessToken: true,
      hasHisMcpToken: true
    })
    expect(checkYunxiaoMcpPrerequisite()).toMatchObject({ status: 'ok' })
    expect(checkHisMcpPrerequisite()).toMatchObject({ status: 'ok' })
    expect(JSON.stringify(checkYunxiaoMcpPrerequisite())).not.toContain('yunxiao-secret')
    expect(JSON.stringify(checkHisMcpPrerequisite())).not.toContain('his-secret')

    const mode = (await stat(getYgtEnvironmentConfigPath(userDataDirectory))).mode & 0o777
    expect(mode).toBe(0o600)
  })
})
