import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FolderWorkspace } from '../../shared/types'
import { buildYunxiaoTerminalEnv } from './terminal-env'

let userDataDirectory: string
let previousUserDataPath: string | undefined

function folderWorkspace(
  provider: NonNullable<FolderWorkspace['linkedTask']>['provider']
): FolderWorkspace {
  return {
    id: 'folder-1',
    projectGroupId: 'group-1',
    name: 'DFHIS-31704',
    folderPath: '/workspace/yunxiao',
    linkedTask: {
      provider,
      type: 'issue',
      number: 0,
      title: 'DFHIS-31704 test',
      url: 'https://devops.aliyun.com/projex/req/DFHIS-31704',
      yunxiaoIdentifier: provider === 'yunxiao' ? 'DFHIS-31704' : undefined
    },
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    createdAt: 1,
    updatedAt: 1
  }
}

describe('Yunxiao terminal environment', () => {
  beforeEach(async () => {
    previousUserDataPath = process.env.ORCA_USER_DATA_PATH
    userDataDirectory = await mkdtemp(join(tmpdir(), 'orca-dfhis-env-'))
    process.env.ORCA_USER_DATA_PATH = userDataDirectory
    await writeFile(
      join(userDataDirectory, 'dfhis-environment.json'),
      JSON.stringify({
        yunxiaoAccessToken: 'yunxiao-token',
        yunxiaoMcpUrl: 'https://openapi-rdc.aliyuncs.com/ai/mcp',
        hisMcpToken: 'his-token',
        hisMcpUrl: 'http://192.168.1.10:9020/mcp',
        hisCodeRoot: '/workspace/default-code',
        archiveWorkspacePath: '/workspace/yunxiao'
      })
    )
  })

  afterEach(async () => {
    if (previousUserDataPath === undefined) {
      delete process.env.ORCA_USER_DATA_PATH
    } else {
      process.env.ORCA_USER_DATA_PATH = previousUserDataPath
    }
    await rm(userDataDirectory, { recursive: true, force: true })
  })

  it('injects Yunxiao credentials and workspace-scoped paths into Yunxiao-linked workspaces', () => {
    const env = buildYunxiaoTerminalEnv(
      folderWorkspace('yunxiao'),
      { PATH: '/bin' },
      {
        codeWorkspaceRoot: '/workspace/selected-code-repo',
        workspaceRoot: '/workspace/yunxiao'
      }
    )

    expect(env).toMatchObject({
      PATH: '/bin',
      YUNXIAO_WORK_ITEM_ID: 'DFHIS-31704',
      YUNXIAO_REQUIREMENT_DIR: '/workspace/yunxiao/DFHIS-31704',
      YUNXIAO_CODE_WORKSPACE_ROOT: '/workspace/selected-code-repo',
      YUNXIAO_DEFAULT_CODE_ROOT: '/workspace/default-code',
      YUNXIAO_ACCESS_TOKEN: 'yunxiao-token',
      YUNXIAO_MCP_URL: 'https://openapi-rdc.aliyuncs.com/ai/mcp',
      HIS_MCP_TOKEN: 'his-token',
      HIS_MCP_URL: 'http://192.168.1.10:9020/mcp',
      YUNXIAO_ARCHIVE_WORKSPACE: '/workspace/yunxiao'
    })
    expect(env.HIS_CODE_ROOT).toBeUndefined()
  })

  it('does not nest the requirement directory when the workspace already points at it', () => {
    const env = buildYunxiaoTerminalEnv(
      folderWorkspace('yunxiao'),
      {},
      { workspaceRoot: '/workspace/yunxiao/DFHIS-31704' }
    )

    expect(env.YUNXIAO_REQUIREMENT_DIR).toBe('/workspace/yunxiao/DFHIS-31704')
  })

  it('falls back to the configured default code root when no repo was selected', () => {
    const env = buildYunxiaoTerminalEnv(folderWorkspace('yunxiao'), {})

    expect(env.YUNXIAO_CODE_WORKSPACE_ROOT).toBe('/workspace/default-code')
  })

  it('does not inject saved credentials into non-Yunxiao workspaces', () => {
    expect(buildYunxiaoTerminalEnv(folderWorkspace('github'), { PATH: '/bin' })).toEqual({
      PATH: '/bin'
    })
  })

  it('does not override explicit shell credentials', () => {
    const env = buildYunxiaoTerminalEnv(folderWorkspace('yunxiao'), {
      HIS_MCP_TOKEN: 'shell-token'
    })

    expect(env.HIS_MCP_TOKEN).toBe('shell-token')
  })
})
