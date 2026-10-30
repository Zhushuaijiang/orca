import { describe, expect, it } from 'vitest'
import {
  buildRequirementDeepeningPrompt,
  composeDeepenedRequirementDescription,
  exceedsRequirementGrowthLimit,
  getRequirementGrowthRatio,
  hasDeepeningEvidenceGaps,
  parseRequirementDeepeningOutput,
  REQUIREMENT_DEEPENING_GROWTH_LIMIT
} from './requirement-deepening'

const SAMPLE_OUTPUT = `## 1. 领域增量
补一条旧数据回填脚本 | 防止切换后历史单查不到 | 0.5 人日 | 本轮做

## 2. 一手素材
生产库 zy_feiyong1 近 7 天数据；旧系统菜单截图。需求描述里"应该很快"属于二手加工。

## 3. 方法与工具
psql -c "select count(*) from zy_feiyong1 where fashengrq > now() - interval '7 days'"

## 4. 独立裁判
费用总额与生产库对账（数据库查询）；科室口径由病案室李某确认（具名专家）。

## 重写稿
目标：修复门诊退费后申请单状态不回清。
范围：只改 checkTuiFei 调用点，不改结算主流程。
验收：全退后 yj_jianyansqd.jifeibz = 0（数据库查询）。

## 删除清单
"顺便优化一下性能" —— 与本缺陷无关，延后。

## 待取证
待取证：退费消息的消费方版本 / 在 152 环境查 mic-sapi 日志`

describe('buildRequirementDeepeningPrompt', () => {
  it('states the growth cap and the four questions in order', () => {
    const prompt = buildRequirementDeepeningPrompt({ title: '退费状态', body: '退费后状态不对' })
    expect(prompt).toContain(String(REQUIREMENT_DEEPENING_GROWTH_LIMIT))
    expect(prompt.indexOf('## 1. 领域增量')).toBeLessThan(prompt.indexOf('## 4. 独立裁判'))
    expect(prompt).toContain('数据库查询 / 第三方回执 / 标准条款 / 具名专家 / 历史黄金样本')
    expect(prompt).toContain('原始需求标题：退费状态')
    expect(prompt).toContain('退费后状态不对')
  })

  it('includes optional context only when supplied', () => {
    const withContext = buildRequirementDeepeningPrompt({
      body: 'x',
      context: '仓库 df-mic-sapi'
    })
    const withoutContext = buildRequirementDeepeningPrompt({ body: 'x' })
    expect(withContext).toContain('仓库 df-mic-sapi')
    expect(withoutContext).not.toContain('补充上下文')
  })
})

describe('parseRequirementDeepeningOutput', () => {
  it('extracts every section from a well-formed answer', () => {
    const { brief, missingSections } = parseRequirementDeepeningOutput(SAMPLE_OUTPUT)
    expect(missingSections).toEqual([])
    expect(brief.delta).toContain('旧数据回填脚本')
    expect(brief.rewritten).toContain('只改 checkTuiFei 调用点')
    expect(brief.gaps).toContain('mic-sapi 日志')
  })

  it('tolerates bold, numbered-hash and colon headings', () => {
    const raw = `**1. 领域增量**：无
# 2. 一手素材:
生产库
### 重写稿：
新稿`
    const { brief } = parseRequirementDeepeningOutput(raw)
    expect(brief.delta).toContain('无')
    expect(brief.sources).toContain('生产库')
    expect(brief.rewritten).toContain('新稿')
  })

  it('reports sections the model omitted instead of inventing them', () => {
    const { brief, missingSections } = parseRequirementDeepeningOutput('## 重写稿\n只有这一段')
    expect(brief.rewritten).toBe('只有这一段')
    expect(brief.delta).toBe('')
    expect(missingSections).toContain('delta')
    expect(missingSections).toContain('gaps')
  })
})

describe('growth guard', () => {
  it('measures rewrite against the original length', () => {
    expect(getRequirementGrowthRatio('1234', '1234')).toBe(1)
    expect(getRequirementGrowthRatio('1234', '12')).toBe(0.5)
    expect(getRequirementGrowthRatio('', '')).toBe(0)
  })

  it('flags rewrites above the limit', () => {
    expect(exceedsRequirementGrowthLimit('1234', '12345')).toBe(true)
    expect(exceedsRequirementGrowthLimit('1234', '1234')).toBe(false)
  })
})

describe('composeDeepenedRequirementDescription', () => {
  it('keeps the original for audit and appends evidence gaps', () => {
    const description = composeDeepenedRequirementDescription({
      rewrittenPrompt: '新稿',
      evidenceGaps: '待取证：日志 / 152',
      original: '旧稿'
    })
    expect(description).toContain('新稿')
    expect(description).toContain('### 待取证')
    expect(description).toContain('原始需求（深化前，留档）')
    expect(description).toContain('旧稿')
  })

  it('omits the gaps block when there is nothing to fetch', () => {
    const description = composeDeepenedRequirementDescription({
      rewrittenPrompt: '新稿',
      evidenceGaps: '无',
      original: '旧稿'
    })
    expect(description).not.toContain('### 待取证')
  })

  it('does not duplicate an unchanged rewrite', () => {
    const description = composeDeepenedRequirementDescription({
      rewrittenPrompt: '同一份',
      original: '同一份'
    })
    expect(description).toBe('同一份')
  })
})

describe('hasDeepeningEvidenceGaps', () => {
  it('detects a non-empty gap section in a compiled description', () => {
    const description = composeDeepenedRequirementDescription({
      rewrittenPrompt: '新稿',
      evidenceGaps: '待取证：日志 / 152',
      original: '旧稿'
    })
    expect(hasDeepeningEvidenceGaps(description)).toBe(true)
  })

  it('returns false for plain requirements', () => {
    expect(hasDeepeningEvidenceGaps('把按钮改蓝')).toBe(false)
  })
})
