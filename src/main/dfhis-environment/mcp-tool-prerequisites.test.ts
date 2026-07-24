import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkHisMcpToolsPrerequisite,
  checkYunxiaoMcpToolsPrerequisite
} from './mcp-tool-prerequisites'

const mocks = vi.hoisted(() => ({
  getHisMcpConnection: vi.fn(),
  getOfficialYunxiaoConnection: vi.fn(),
  listTools: vi.fn(),
  openMcpSession: vi.fn()
}))

vi.mock('../yunxiao/mcp-connections', () => ({
  getHisMcpConnection: mocks.getHisMcpConnection,
  getOfficialYunxiaoConnection: mocks.getOfficialYunxiaoConnection
}))

vi.mock('../yunxiao/mcp-http-transport', () => ({
  listTools: mocks.listTools,
  openMcpSession: mocks.openMcpSession
}))

describe('DFHIS MCP tool prerequisites', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.openMcpSession.mockResolvedValue('session-1')
  })

  it('treats missing HIS token as an optional fallback without opening an MCP session', async () => {
    mocks.getHisMcpConnection.mockReturnValue({
      url: 'http://192.168.1.10:9020/mcp',
      bearerToken: null,
      hasQueryToken: false
    })

    await expect(checkHisMcpToolsPrerequisite()).resolves.toMatchObject({
      id: 'his-mcp-tools',
      status: 'ok',
      summary: 'Optional fallback is not configured'
    })
    expect(mocks.openMcpSession).not.toHaveBeenCalled()
  })

  it('requires the HIS archive, comment, agent chat, and git inspect tools', async () => {
    mocks.getHisMcpConnection.mockReturnValue({
      url: 'http://192.168.1.10:9020/mcp',
      bearerToken: 'token',
      hasQueryToken: false
    })
    mocks.listTools.mockResolvedValue(['dfhis_agent_chat', 'download_yunxiao_archive'])

    await expect(checkHisMcpToolsPrerequisite()).resolves.toMatchObject({
      id: 'his-mcp-tools',
      status: 'invalid',
      detail: expect.stringContaining('comment_yunxiao_workitem')
    })
  })

  it('accepts the required Yunxiao project-management tools', async () => {
    mocks.getOfficialYunxiaoConnection.mockReturnValue({
      url: 'https://openapi-rdc.aliyuncs.com/ai/mcp',
      bearerToken: 'token',
      hasQueryToken: false
    })
    mocks.listTools.mockResolvedValue([
      'get_current_organization_info',
      'get_current_user',
      'get_work_item',
      'list_workitem_attachments',
      'get_workitem_file',
      'list_work_item_comments',
      'create_work_item_comment',
      'get_work_item_type_field_config',
      'get_work_item_workflow',
      'update_work_item'
    ])

    await expect(checkYunxiaoMcpToolsPrerequisite()).resolves.toMatchObject({
      id: 'yunxiao-mcp-tools',
      status: 'ok'
    })
  })
})
