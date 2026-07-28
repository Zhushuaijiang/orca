import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callOfficialYunxiaoTool } from './client'
import { compactYunxiaoWorkItem, listYunxiaoWorkItems } from './work-item-list'

vi.mock('./client', () => ({
  callOfficialYunxiaoTool: vi.fn()
}))

describe('Yunxiao work item list parsing', () => {
  beforeEach(() => {
    vi.mocked(callOfficialYunxiaoTool).mockReset()
  })

  it('uses the work item detail URL instead of attachment download URLs', () => {
    const item = compactYunxiaoWorkItem({
      id: '4169017b3c9bfb61486b741a5e',
      serialNumber: 'DFHIS-31704',
      subject: '折扣套餐，医嘱名称变更后，同步变更',
      category: 'Req',
      attachments: [
        {
          url: 'https://devops.aliyun.com/projex/api/workitem/file/url?fileIdentifier=e4823ff57ba33b531f48951667'
        }
      ]
    })

    expect(item?.url).toBe('https://devops.aliyun.com/projex/req/DFHIS-31704')
  })

  it('queries all work item categories as requirements plus bugs', async () => {
    vi.mocked(callOfficialYunxiaoTool).mockImplementation(async (name) => {
      if (name === 'get_current_organization_info') {
        return { text: '{"organizationId":"org-1"}' } as never
      }
      return { text: '{"data":[]}' } as never
    })

    await listYunxiaoWorkItems({
      filters: { category: 'all', statusIds: ['新', '待开发', '待修复'] }
    })

    const searchCall = vi
      .mocked(callOfficialYunxiaoTool)
      .mock.calls.find(([name]) => name === 'search_workitems')
    expect(searchCall?.[1]).toMatchObject({
      category: 'Req,Bug',
      status: '新,待开发,待修复'
    })
  })
})
