import { describe, expect, it } from 'vitest'

import {
  getDefaultYunxiaoStatusNames,
  resolveDefaultYunxiaoStatusIds,
  resolveYunxiaoStatusFilterIds,
  statusSelectionLabel
} from './task-page-yunxiao-work-item-model'

describe('task-page-yunxiao-work-item-model', () => {
  it('defaults requirements to new and waiting-for-development statuses', () => {
    expect(getDefaultYunxiaoStatusNames('Req')).toEqual(['新', '待开发'])
  })

  it('defaults bugs to waiting-for-fix status', () => {
    expect(getDefaultYunxiaoStatusNames('Bug')).toEqual(['待修复'])
  })

  it('defaults all work items to requirements plus bugs statuses', () => {
    expect(getDefaultYunxiaoStatusNames('all')).toEqual(['新', '待开发', '待修复'])
  })

  it('maps default status names to loaded facet ids when available', () => {
    expect(
      resolveDefaultYunxiaoStatusIds(
        [
          { id: 'status-new', name: '新', count: 2 },
          { id: 'status-dev', name: '待开发', count: 5 },
          { id: 'status-fix', name: '待修复', count: 1 }
        ],
        'all'
      )
    ).toEqual(['status-new', 'status-dev', 'status-fix'])
  })

  it('keeps default names as filter values before facets are loaded', () => {
    expect(
      resolveYunxiaoStatusFilterIds({
        category: 'all',
        mode: 'default',
        selectedStatusIds: [],
        statuses: []
      })
    ).toEqual(['新', '待开发', '待修复'])
  })

  it('labels default status filters explicitly', () => {
    expect(statusSelectionLabel([], [], 'default', 'all')).toContain('新, 待开发, 待修复')
  })
})
