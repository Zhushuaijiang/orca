import { describe, expect, it } from 'vitest'
import type { YunxiaoWorkItem } from '../../shared/yunxiao-types'
import { itemMatchesQuery, matchesParticipant } from './work-item-query'

const item: YunxiaoWorkItem = {
  id: 'internal-1',
  serialNumber: 'DFHIS-31655',
  title: '住院护士站检查单优化',
  category: 'Req',
  typeName: '产品类需求',
  statusId: 'status-1',
  statusName: '待开发',
  customer: '东昉',
  priority: '中',
  assignee: { id: 'user-1', name: '竺帅江' },
  participants: [{ id: 'user-2', name: '沈侠' }],
  sprint: { id: 'sprint-1', name: '20260730迭代' },
  updatedAt: '2026-07-23T00:00:00.000Z',
  url: null
}

describe('Yunxiao work item query matching', () => {
  it('matches serial numbers outside the MCP subject search surface', () => {
    expect(itemMatchesQuery(item, 'DFHIS-31655')).toBe(true)
    expect(itemMatchesQuery(item, '31655')).toBe(true)
    expect(itemMatchesQuery(item, 'DFHIS-31656')).toBe(false)
  })

  it('matches every search token across displayed fields', () => {
    expect(itemMatchesQuery(item, '护士站 东昉')).toBe(true)
    expect(itemMatchesQuery(item, '护士站 西昉')).toBe(false)
  })

  it('matches participant filters by id or display name', () => {
    expect(matchesParticipant(item.participants, 'user-2')).toBe(true)
    expect(matchesParticipant(item.participants, '沈侠')).toBe(true)
    expect(matchesParticipant(item.participants, 'user-1')).toBe(false)
  })
})
