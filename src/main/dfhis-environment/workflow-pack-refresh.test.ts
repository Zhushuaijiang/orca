import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ensureDfHisWorkflowPackCurrentForYunxiaoText,
  setDfHisWorkflowPackRefreshInstallerForTests
} from './workflow-pack-refresh'

describe('DFHIS workflow pack refresh', () => {
  afterEach(() => {
    setDfHisWorkflowPackRefreshInstallerForTests(null)
  })

  it('checks the workflow pack for every Yunxiao request after prior success', async () => {
    const installer = vi.fn(async () => undefined)
    setDfHisWorkflowPackRefreshInstallerForTests(installer)

    await ensureDfHisWorkflowPackCurrentForYunxiaoText('DFHIS-31732')
    await ensureDfHisWorkflowPackCurrentForYunxiaoText(
      'https://devops.aliyun.com/projex/req/DFHIS-31733'
    )

    expect(installer).toHaveBeenCalledTimes(2)
  })

  it('shares a concurrent workflow pack refresh', async () => {
    let finish!: () => void
    const installer = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    setDfHisWorkflowPackRefreshInstallerForTests(installer)

    const first = ensureDfHisWorkflowPackCurrentForYunxiaoText('DFHIS-31732')
    const second = ensureDfHisWorkflowPackCurrentForYunxiaoText('DFHIS-31733')

    expect(installer).toHaveBeenCalledOnce()
    finish()
    await Promise.all([first, second])
  })
})
