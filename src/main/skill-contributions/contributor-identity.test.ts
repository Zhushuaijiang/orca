import { beforeEach, describe, expect, it, vi } from 'vitest'

const { callOfficialYunxiaoTool } = vi.hoisted(() => ({ callOfficialYunxiaoTool: vi.fn() }))

vi.mock('../yunxiao/client', () => ({ callOfficialYunxiaoTool }))
vi.mock('../yunxiao/mcp-connections', () => ({
  getOfficialYunxiaoConnection: () => ({ url: 'u' })
}))

import {
  getContributorIdentity,
  parseContributorIdentityText,
  resetContributorIdentityForTests
} from './contributor-identity'

const CURRENT_USER = JSON.stringify({
  id: 'u-1',
  name: 'dt_12345',
  lastOrganization: 'org-1'
})

beforeEach(() => {
  callOfficialYunxiaoTool.mockReset()
  resetContributorIdentityForTests()
})

describe('parseContributorIdentityText', () => {
  it('extracts id, name and organization loosely', () => {
    expect(parseContributorIdentityText(CURRENT_USER)).toEqual({
      yunxiaoUserId: 'u-1',
      name: 'dt_12345',
      organization: 'org-1'
    })
  })

  it('returns null without a user id', () => {
    expect(parseContributorIdentityText('{"name":"x"}')).toBeNull()
  })
})

describe('getContributorIdentity', () => {
  it('prefers the organization member real name over the account name', async () => {
    callOfficialYunxiaoTool.mockImplementation(async (tool: string) => {
      if (tool === 'get_current_user') {
        return { text: CURRENT_USER }
      }
      return { text: JSON.stringify({ name: '竺帅江' }) }
    })

    const identity = await getContributorIdentity()
    expect(identity).toEqual({ yunxiaoUserId: 'u-1', name: '竺帅江', organization: 'org-1' })
    expect(callOfficialYunxiaoTool).toHaveBeenCalledWith(
      'get_organization_member_info_by_user_id',
      { organizationId: 'org-1', userId: 'u-1' },
      expect.any(Number)
    )
  })

  it('keeps the account name when member lookup fails', async () => {
    callOfficialYunxiaoTool.mockImplementation(async (tool: string) => {
      if (tool === 'get_current_user') {
        return { text: CURRENT_USER }
      }
      throw new Error('mcp down')
    })

    const identity = await getContributorIdentity()
    expect(identity?.name).toBe('dt_12345')
  })
})
