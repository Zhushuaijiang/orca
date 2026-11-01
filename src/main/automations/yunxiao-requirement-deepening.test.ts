import { describe, expect, it } from 'vitest'
import { REQUIREMENT_DEEPENING_ORIGINAL_TRAILER } from '../../shared/requirement-deepening'
import {
  deepenClaimedRequirements,
  deepenRequirementBeforeDispatch,
  type RequirementDeepeningDeps,
  type RequirementDeepeningTarget
} from './yunxiao-requirement-deepening'

const TARGET: RequirementDeepeningTarget = {
  workItemId: 'DFHIS-32980',
  title: '门诊皮试单打印',
  worktreePath: '/workspace/yunxiao',
  primaryAgent: 'claude-agent-teams'
}

const ORIGINAL = [
  '需求或问题描述：门诊皮试医嘱打印时没有“皮试单”页签，无法按皮试单打印。',
  '目标：门诊医生站医嘱打印弹窗新增皮试单页签，按皮试单打印。',
  '提出科室：门诊药房。'
].join('\n')

const REWRITE = '门诊医嘱打印弹窗新增皮试单页签，按皮试单打印；不扩范围到住院与草药单。'

function deepenedOutput(rewritten = REWRITE, gaps = '生产模板行 / 生产库 gy_danjuxx'): string {
  return [
    '## 1. 领域增量',
    '补同构页签回归 | 防止漏改 | 低成本 | 本轮做',
    '## 2. 一手素材',
    '原始报文与旧模板',
    '## 3. 方法与工具',
    'psql -c "select * from gy_danjuxx"',
    '## 4. 独立裁判',
    '数据库查询（DBA）',
    '## 重写稿',
    rewritten,
    '## 删除清单',
    '无',
    '## 待取证',
    gaps
  ].join('\n')
}

function makeDeps(overrides: Partial<RequirementDeepeningDeps> = {}): {
  deps: RequirementDeepeningDeps
  writes: { workItemId: string; description: string }[]
} {
  const writes: { workItemId: string; description: string }[] = []
  const deps: RequirementDeepeningDeps = {
    readDescription: async () => ORIGINAL,
    generate: async () => deepenedOutput(),
    writeDescription: async (workItemId, description) => {
      writes.push({ workItemId, description })
    },
    ...overrides
  }
  return { deps, writes }
}

describe('deepenRequirementBeforeDispatch', () => {
  it('writes the deepened rewrite back with the original kept for audit', async () => {
    const { deps, writes } = makeDeps()

    await expect(deepenRequirementBeforeDispatch(TARGET, deps)).resolves.toBe('deepened')

    expect(writes).toHaveLength(1)
    expect(writes[0]?.workItemId).toBe('DFHIS-32980')
    expect(writes[0]?.description).toContain(REWRITE)
    expect(writes[0]?.description).toContain('### 待取证')
    expect(writes[0]?.description).toContain('生产模板行 / 生产库 gy_danjuxx')
    expect(writes[0]?.description).toContain(REQUIREMENT_DEEPENING_ORIGINAL_TRAILER)
    expect(writes[0]?.description).toContain('门诊皮试医嘱打印时没有')
  })

  it('skips a ticket that already carries a deepening rewrite', async () => {
    const { deps, writes } = makeDeps({
      readDescription: async () =>
        `${REWRITE}\n\n---\n${REQUIREMENT_DEEPENING_ORIGINAL_TRAILER}\n\n${ORIGINAL}`
    })

    await expect(deepenRequirementBeforeDispatch(TARGET, deps)).resolves.toBe('skipped')
    expect(writes).toHaveLength(0)
  })

  it('skips a ticket without a description', async () => {
    const { deps, writes } = makeDeps({ readDescription: async () => '   ' })

    await expect(deepenRequirementBeforeDispatch(TARGET, deps)).resolves.toBe('skipped')
    expect(writes).toHaveLength(0)
  })

  it('rejects an inflated rewrite instead of writing it back', async () => {
    const { deps, writes } = makeDeps({
      generate: async () => deepenedOutput(`${REWRITE}${'。'.repeat(200)}`)
    })

    await expect(deepenRequirementBeforeDispatch(TARGET, deps)).resolves.toBe('failed')
    expect(writes).toHaveLength(0)
  })

  it('fails without throwing when generation or write-back breaks', async () => {
    const generationBroken = makeDeps({
      generate: async () => {
        throw new Error('model quota exhausted')
      }
    })
    await expect(deepenRequirementBeforeDispatch(TARGET, generationBroken.deps)).resolves.toBe(
      'failed'
    )

    const writeBroken = makeDeps({
      writeDescription: async () => {
        throw new Error('yunxiao update failed')
      }
    })
    await expect(deepenRequirementBeforeDispatch(TARGET, writeBroken.deps)).resolves.toBe('failed')
  })

  it('claims the rest of a batch after one ticket fails', async () => {
    const { deps, writes } = makeDeps({ readDescription: async () => null })
    const outcomes = await deepenClaimedRequirements([TARGET, TARGET], deps)

    expect(outcomes).toEqual(['skipped', 'skipped'])
    expect(writes).toHaveLength(0)
  })
})
