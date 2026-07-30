import { createHash } from 'node:crypto'
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
import { installRemoteDfHisWorkflowPack } from '../dfhis-environment/remote-workflow-pack-installer'

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

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

async function writeRemoteSkillPackManifest(directory: string): Promise<string> {
  const yunxiaoSkill = '---\nname: yunxiao-requirement-archiver\n---\nremote yunxiao skill\n'
  const mergeSkill = '---\nname: his-release-merge\n---\nremote merge skill\n'
  const ygtSkill = '---\nname: ygt\n---\nremote ygt skill\n'
  const ygtHarness = '#!/usr/bin/env node\nconst ygtHarness = true\n'
  const ygtPluginManifest = '{"name":"ygt","skills":"./skills/"}\n'
  const ygtHarnessGuide = '# YGT 工作流 Harness\n'
  const manifestPath = path.join(directory, 'dfhis-skill-pack.json')
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        skillPackId: 'dfhis',
        version: 'test-pack',
        files: [
          {
            path: 'yunxiao-requirement-archiver/SKILL.md',
            sha256: sha256(yunxiaoSkill),
            content: yunxiaoSkill
          },
          {
            path: 'his-release-merge/SKILL.md',
            sha256: sha256(mergeSkill),
            content: mergeSkill
          },
          {
            path: 'ygt/SKILL.md',
            sha256: sha256(ygtSkill),
            content: ygtSkill
          },
          {
            path: 'ygt/harness/scripts/harness/ygt-workflow.mjs',
            sha256: sha256(ygtHarness),
            content: ygtHarness
          },
          {
            path: 'ygt/harness/plugins/ygt/.codex-plugin/plugin.json',
            sha256: sha256(ygtPluginManifest),
            content: ygtPluginManifest
          },
          {
            path: 'ygt/harness/docs/04-YGT工作流Harness.md',
            sha256: sha256(ygtHarnessGuide),
            content: ygtHarnessGuide
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
    await expect(ensureDfHisWorkflowPackInstalled(homeDirectory)).resolves.toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'DFHIS workflow pack for universal agent skills is installed and current'
        ),
        expect.stringContaining('DFHIS workflow pack for Codex is installed and current'),
        expect.stringContaining('DFHIS workflow pack for Claude is installed and current')
      ])
    )

    await expect(readFile(getDfHisSkillPath(homeDirectory), 'utf8')).resolves.toContain(
      'name: yunxiao-requirement-archiver'
    )
    await expect(
      readFile(
        path.join(homeDirectory, '.codex', 'skills', 'his-release-merge', 'SKILL.md'),
        'utf8'
      )
    ).resolves.toContain('name: his-release-merge')
    await expect(
      readFile(path.join(homeDirectory, '.codex', 'skills', 'ygt', 'SKILL.md'), 'utf8')
    ).resolves.toContain('name: ygt')
    await expect(
      readFile(
        path.join(
          homeDirectory,
          '.codex',
          'skills',
          'ygt',
          'harness',
          'scripts',
          'harness',
          'ygt-workflow.mjs'
        ),
        'utf8'
      )
    ).resolves.toContain('superpowerSkillCatalog')
    await expect(
      readFile(
        path.join(
          homeDirectory,
          '.codex',
          'skills',
          'ygt',
          'harness',
          'plugins',
          'ygt',
          '.codex-plugin',
          'plugin.json'
        ),
        'utf8'
      )
    ).resolves.toContain('"name": "ygt"')
    await expect(
      readFile(
        path.join(
          homeDirectory,
          '.codex',
          'skills',
          'ygt',
          'harness',
          'docs',
          '04-YGT工作流Harness.md'
        ),
        'utf8'
      )
    ).resolves.toContain('YGT 工作流')
    await expect(
      readFile(
        path.join(
          homeDirectory,
          '.codex',
          'skills',
          'ygt',
          'df-web-common-ygt-biz',
          'docs',
          'ai-dev-sop.md'
        ),
        'utf8'
      )
    ).resolves.toContain('AI 开发 SOP')
    await expect(
      readFile(
        path.join(
          homeDirectory,
          '.codex',
          'skills',
          'yunxiao-requirement-archiver',
          'scripts',
          'run_direct_archive.py'
        ),
        'utf8'
      )
    ).resolves.toContain('official Yunxiao MCP')
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
        path.join(homeDirectory, '.agents', 'skills', '.orca-dfhis-workflow-pack.json'),
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
      readFile(
        path.join(homeDirectory, '.codex', 'skills', 'his-release-merge', 'SKILL.md'),
        'utf8'
      )
    ).resolves.toContain('name: his-release-merge')
    await expect(
      readFile(path.join(homeDirectory, '.codex', 'skills', 'ygt', 'SKILL.md'), 'utf8')
    ).resolves.toContain('name: ygt')
    await expect(
      readFile(path.join(path.dirname(skillPath), 'local-note.md'), 'utf8')
    ).resolves.toBe('keep me')
  })

  it('repairs drifted managed DFHIS workflow pack files without deleting extra files', async () => {
    const homeDirectory = await createTemporaryHome()
    const skillPath = getDfHisSkillPath(homeDirectory)
    const extraFilePath = path.join(path.dirname(skillPath), 'local-note.md')

    await ensureDfHisWorkflowPackInstalled(homeDirectory)
    await writeFile(skillPath, 'edited installed skill', 'utf8')
    await writeFile(extraFilePath, 'keep me', 'utf8')

    await expect(checkDfHisWorkflowPackPrerequisites(homeDirectory)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'dfhis-workflow-pack-codex',
          status: 'invalid',
          summary: 'Installed pack differs from bundled version',
          fixable: true
        })
      ])
    )

    await expect(ensureDfHisWorkflowPackInstalled(homeDirectory)).resolves.toEqual(
      expect.arrayContaining([expect.stringContaining('DFHIS workflow pack for Codex')])
    )
    await expect(readFile(skillPath, 'utf8')).resolves.toContain(
      'name: yunxiao-requirement-archiver'
    )
    await expect(
      readFile(
        path.join(homeDirectory, '.codex', 'skills', 'his-release-merge', 'SKILL.md'),
        'utf8'
      )
    ).resolves.toContain('name: his-release-merge')
    await expect(
      readFile(path.join(homeDirectory, '.codex', 'skills', 'ygt', 'SKILL.md'), 'utf8')
    ).resolves.toContain('name: ygt')
    await expect(readFile(extraFilePath, 'utf8')).resolves.toBe('keep me')
    await expect(checkDfHisWorkflowPackPrerequisites(homeDirectory)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'dfhis-workflow-pack-codex', status: 'ok' })
      ])
    )
  })

  it('installs a manually pulled DFHIS workflow pack and keeps using its cache', async () => {
    const homeDirectory = await createTemporaryHome()
    const userDataDirectory = await createTemporaryHome()
    process.env.ORCA_USER_DATA_PATH = userDataDirectory
    const manifestPath = await writeRemoteSkillPackManifest(userDataDirectory)

    await expect(installRemoteDfHisWorkflowPack(manifestPath, homeDirectory)).resolves.toEqual(
      expect.arrayContaining([
        expect.stringContaining('Downloaded DFHIS workflow pack test-pack'),
        expect.stringContaining('DFHIS workflow pack for Codex')
      ])
    )

    await expect(ensureDfHisWorkflowPackInstalled(homeDirectory)).resolves.toEqual(
      expect.arrayContaining([expect.stringContaining('DFHIS workflow pack for Codex')])
    )
    await expect(readFile(getDfHisSkillPath(homeDirectory), 'utf8')).resolves.toContain(
      'remote yunxiao skill'
    )
    await expect(
      readFile(
        path.join(homeDirectory, '.codex', 'skills', 'his-release-merge', 'SKILL.md'),
        'utf8'
      )
    ).resolves.toContain('remote merge skill')
    await expect(
      readFile(path.join(homeDirectory, '.codex', 'skills', 'ygt', 'SKILL.md'), 'utf8')
    ).resolves.toContain('remote ygt skill')
    await expect(
      readFile(
        path.join(
          homeDirectory,
          '.codex',
          'skills',
          'ygt',
          'harness',
          'scripts',
          'harness',
          'ygt-workflow.mjs'
        ),
        'utf8'
      )
    ).resolves.toContain('ygtHarness')
    await expect(
      readFile(
        path.join(
          homeDirectory,
          '.codex',
          'skills',
          'ygt',
          'harness',
          'plugins',
          'ygt',
          '.codex-plugin',
          'plugin.json'
        ),
        'utf8'
      )
    ).resolves.toContain('"name":"ygt"')
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
      status: 'ok',
      summary: 'Optional fallback is not configured',
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
