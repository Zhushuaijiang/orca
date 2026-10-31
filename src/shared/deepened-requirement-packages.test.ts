import { describe, expect, it } from 'vitest'
import {
  composeRequirementPackageNote,
  isRequirementPackageTag,
  REQUIREMENT_PACKAGE_SCOPE_MARKER,
  splitDeepenedRequirement
} from './deepened-requirement-packages'
import type { RequirementDeepeningBrief } from './requirement-deepening'

function brief(
  rewritten: string,
  extras: Partial<RequirementDeepeningBrief> = {}
): RequirementDeepeningBrief {
  return {
    delta: '',
    sources: '',
    method: extras.method ?? '',
    oracle: '',
    rewritten,
    dropped: '',
    gaps: extras.gaps ?? ''
  }
}

describe('splitDeepenedRequirement', () => {
  it('groups tagged criteria into ordered packages', () => {
    const split = splitDeepenedRequirement({
      requirementTitle: 'DFHIS-32901 出院检测修复',
      parentPoolItemId: '32901',
      brief: brief(
        [
          '目标：出院检测弹窗不再漏审未复核医嘱。',
          '范围：只改出院检测链路。',
          '验收标准：',
          '- [前端] 弹窗展示未复核数量（历史黄金样本）',
          '- [后端] 出院检测接口返回未复核列表（数据库查询）',
          '- [数据变更] 补齐 zy_yizhu 复核状态索引（数据库查询）',
          '- [测试] 回归出院检测用例（历史黄金样本）',
          '约束：不改医嘱提交。'
        ].join('\n'),
        { method: '表 zy_yizhu；接口 getChuYuanJc', gaps: '待取证：复核人字段 / 生产库' }
      )
    })

    expect(split.monolithic).toBe(false)
    expect(split.packages.map((p) => p.tag)).toEqual(['数据变更', '后端', '前端', '测试'])
    expect(split.packages[0].poolItemId).toBe('32901::pkg:数据变更')
    expect(split.packages[2].title).toBe('[前端] DFHIS-32901 出院检测修复')
    expect(split.packages[2].criteria).toEqual(['- [前端] 弹窗展示未复核数量（历史黄金样本）'])
  })

  it('fails safe to monolithic when any criterion is untagged', () => {
    const split = splitDeepenedRequirement({
      brief: brief(
        [
          '目标：修复登录超时。',
          '- [后端] 刷新 token（第三方回执）',
          '- 顺手优化登录页样式（无裁判）'
        ].join('\n')
      )
    })
    expect(split.packages).toHaveLength(1)
    expect(split.untaggedCriteria).toHaveLength(1)
    expect(split.monolithic).toBe(true)
  })

  it('single-module rewrites stay monolithic without untagged noise', () => {
    const split = splitDeepenedRequirement({
      brief: brief(['目标：改一处文案。', '- [前端] 文案更新（具名专家）'].join('\n'))
    })
    expect(split.packages).toHaveLength(1)
    expect(split.untaggedCriteria).toHaveLength(0)
    expect(split.monolithic).toBe(true)
  })

  it('supports fullwidth brackets and numbered criteria', () => {
    const split = splitDeepenedRequirement({
      brief: brief(['目标：x。', '1. 【后端】接口修复（数据库查询）'].join('\n'))
    })
    expect(split.packages.map((p) => p.tag)).toEqual(['后端'])
    expect(split.packages[0].criteria).toEqual(['1. 【后端】接口修复（数据库查询）'])
  })

  it('package note carries scope marker, shared method and gaps', () => {
    const note = composeRequirementPackageNote({
      tag: '后端',
      criteria: ['- [后端] 接口返回列表（数据库查询）'],
      goal: '目标：修复出院检测。',
      method: '表 zy_yizhu',
      gaps: '待取证：复核人 / 生产库'
    })
    expect(note).toContain('只做 后端 范围')
    expect(note).toContain(REQUIREMENT_PACKAGE_SCOPE_MARKER)
    expect(note).toContain('- [后端] 接口返回列表（数据库查询）')
    expect(note).toContain('表 zy_yizhu')
    expect(note).toContain('待取证：复核人 / 生产库')
  })

  it('omits empty shared sections from the note', () => {
    const note = composeRequirementPackageNote({
      tag: '测试',
      criteria: ['- [测试] 回归用例（历史黄金样本）'],
      goal: '',
      method: '',
      gaps: '无'
    })
    expect(note).not.toContain('全局目标')
    expect(note).not.toContain('接口事实')
    expect(note).not.toContain('待取证')
  })
})

describe('isRequirementPackageTag', () => {
  it('accepts only the closed tag set', () => {
    expect(isRequirementPackageTag('后端')).toBe(true)
    expect(isRequirementPackageTag('数据变更')).toBe(true)
    expect(isRequirementPackageTag('部署')).toBe(false)
    expect(isRequirementPackageTag('')).toBe(false)
  })
})
