import { describe, expect, it } from 'vitest'
import { compactYunxiaoWorkItem } from './work-item-list'

describe('Yunxiao work item list parsing', () => {
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
})
