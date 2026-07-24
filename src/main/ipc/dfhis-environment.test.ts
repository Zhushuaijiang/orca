import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkArchiveWorkspacePrerequisite,
  checkHisCodeRootPrerequisite,
  checkHisMcpPrerequisite,
  checkDfHisWorkflowPackPrerequisites,
  checkYunxiaoMcpPrerequisite,
  ensureDfHisWorkflowPackInstalled,
  getDfHisSkillPath
} from './dfhis-environment'
import {
  getDfHisEnvironmentConfigPath,
  saveDfHisEnvironmentConfig,
  snapshotDfHisEnvironmentConfig
} from '../dfhis-environment/config'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/orca-ygt-env-test-user-data'
  },
  ipcMain: {
    handle: vi.fn()
  }
}))

const temporaryDirectories: string[] = []

function clearDfHisEnvironmentVariables(): void {
  delete process.env.ORCA_USER_DATA_PATH
  delete process.env.YUNXIAO_ACCESS_TOKEN
  delete process.env.YUNXIAO_MCP_URL
  delete process.env.HIS_MCP_TOKEN
  delete process.env.HIS_MCP_URL
}

async function createTemporaryHome(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-ygt-env-'))
  temporaryDirectories.push(directory)
  return directory
}

describe('dfhis-environment', () => {
  beforeEach(() => {
    clearDfHisEnvironmentVariables()
  })

  afterEach(async () => {
    clearDfHisEnvironmentVariables()
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('detects and installs the DFHIS workflow pack in supported agent homes', async () => {
    const homeDirectory = await createTemporaryHome()

    await expect(checkDfHisWorkflowPackPrerequisites(homeDirectory)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'dfhis-workflow-pack-agent-skills', status: 'missing' }),
        expect.objectContaining({ id: 'dfhis-workflow-pack-codex', status: 'missing' }),
        expect.objectContaining({ id: 'dfhis-workflow-pack-claude', status: 'missing' })
      ])
    )

    await expect(ensureDfHisWorkflowPackInstalled(homeDirectory)).resolves.toEqual(
      expect.arrayContaining([
        expect.stringContaining('DFHIS workflow pack for universal agent skills'),
        expect.stringContaining('DFHIS workflow pack for Codex'),
        expect.stringContaining('DFHIS workflow pack for Claude')
      ])
    )
    await expect(checkDfHisWorkflowPackPrerequisites(homeDirectory)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'dfhis-workflow-pack-agent-skills', status: 'ok' }),
        expect.objectContaining({ id: 'dfhis-workflow-pack-codex', status: 'ok' }),
        expect.objectContaining({ id: 'dfhis-workflow-pack-claude', status: 'ok' })
      ])
    )

    await expect(readFile(getDfHisSkillPath(homeDirectory), 'utf8')).resolves.toContain(
      'name: yunxiao-requirement-archiver'
    )
    await expect(
      readFile(
        path.join(
          homeDirectory,
          '.codex',
          'skills',
          'yunxiao-requirement-archiver',
          'scripts',
          'download_mcp_archive.py'
        ),
        'utf8'
      )
    ).resolves.toContain('download_yunxiao_archive')
    await expect(
      readFile(
        path.join(
          homeDirectory,
          '.claude',
          'skills',
          'yunxiao-requirement-archiver',
          'scripts',
          'update_yunxiao_completion_fields.py'
        ),
        'utf8'
      )
    ).resolves.toContain('update_work_item')
    await expect(
      readFile(
        path.join(
          homeDirectory,
          '.agents',
          'skills',
          'yunxiao-requirement-archiver',
          '.orca-dfhis-workflow-pack.json'
        ),
        'utf8'
      )
    ).resolves.toContain('"providerTarget": "agent-skills"')
  })

  it('refreshes bundled DFHIS workflow pack files without deleting extra files', async () => {
    const homeDirectory = await createTemporaryHome()
    const skillPath = getDfHisSkillPath(homeDirectory)
    await mkdir(path.dirname(skillPath), { recursive: true })
    await writeFile(skillPath, 'custom skill body', 'utf8')
    await writeFile(path.join(path.dirname(skillPath), 'local-note.md'), 'keep me', 'utf8')

    await expect(ensureDfHisWorkflowPackInstalled(homeDirectory)).resolves.toEqual(
      expect.arrayContaining([expect.stringContaining('DFHIS workflow pack for Codex')])
    )
    await expect(readFile(skillPath, 'utf8')).resolves.toContain(
      'name: yunxiao-requirement-archiver'
    )
    await expect(
      readFile(path.join(path.dirname(skillPath), 'local-note.md'), 'utf8')
    ).resolves.toBe('keep me')
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

  it('uses saved config for MCP readiness and snapshots local tokens', async () => {
    const userDataDirectory = await createTemporaryHome()
    const hisCodeRoot = path.join(userDataDirectory, 'his-code')
    const archiveWorkspacePath = path.join(userDataDirectory, 'archives')
    process.env.ORCA_USER_DATA_PATH = userDataDirectory

    await saveDfHisEnvironmentConfig({
      gitlabAccessToken: 'gitlab-secret',
      yunxiaoAccessToken: 'yunxiao-secret',
      hisMcpToken: 'his-secret',
      hisCodeRoot,
      archiveWorkspacePath
    })

    expect(snapshotDfHisEnvironmentConfig()).toMatchObject({
      gitlabAccessToken: 'gitlab-secret',
      hasGitlabAccessToken: true,
      yunxiaoAccessToken: 'yunxiao-secret',
      hasYunxiaoAccessToken: true,
      hisMcpToken: 'his-secret',
      hasHisMcpToken: true,
      hisCodeRoot,
      archiveWorkspacePath
    })
    expect(checkYunxiaoMcpPrerequisite()).toMatchObject({ status: 'ok' })
    expect(checkHisMcpPrerequisite()).toMatchObject({ status: 'ok' })
    expect(JSON.stringify(checkYunxiaoMcpPrerequisite())).not.toContain('yunxiao-secret')
    expect(JSON.stringify(checkHisMcpPrerequisite())).not.toContain('his-secret')

    const mode = (await stat(getDfHisEnvironmentConfigPath(userDataDirectory))).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('checks configured fallback code and archive workspace paths', async () => {
    const userDataDirectory = await createTemporaryHome()
    const hisCodeRoot = path.join(userDataDirectory, 'his-code')
    const archiveWorkspacePath = path.join(userDataDirectory, 'archives')
    process.env.ORCA_USER_DATA_PATH = userDataDirectory

    await saveDfHisEnvironmentConfig({ hisCodeRoot, archiveWorkspacePath })

    await expect(checkHisCodeRootPrerequisite()).resolves.toMatchObject({
      id: 'his-code-root',
      status: 'missing'
    })
    await expect(checkArchiveWorkspacePrerequisite()).resolves.toMatchObject({
      id: 'archive-workspace',
      status: 'missing',
      fixable: true
    })

    await mkdir(hisCodeRoot, { recursive: true })
    await mkdir(archiveWorkspacePath, { recursive: true })

    await expect(checkHisCodeRootPrerequisite()).resolves.toMatchObject({
      id: 'his-code-root',
      status: 'ok'
    })
    await expect(checkArchiveWorkspacePrerequisite()).resolves.toMatchObject({
      id: 'archive-workspace',
      status: 'ok'
    })
  })
})
