import { describe, expect, it } from 'vitest'

import {
  buildCodeMergeLinkedWorkItem,
  buildCodeMergePrompt
} from '@/components/task-page-code-merge-workflow'

describe('task-page-code-merge-workflow', () => {
  it('builds a guarded preflight prompt', () => {
    const prompt = buildCodeMergePrompt('preflight', '/tmp/钉钉文档_合并清单_2026-07-27.xlsx')

    expect(prompt).toContain('$his-release-merge')
    expect(prompt).not.toContain('/Users/jijiguowangdemac/Desktop/his-release-merge')
    expect(prompt).toContain('/tmp/钉钉文档_合并清单_2026-07-27.xlsx')
    expect(prompt).toContain('HIS 源码根目录只读')
    expect(prompt).toContain('禁止在源码根目录执行 git fetch')
    expect(prompt).toContain('任何会写工作区/.git 元数据的命令')
    expect(prompt).toContain('RC_2.16.1_250514')
    expect(prompt).toContain('release_2.15.3_250515')
    expect(prompt).toContain('不要 cherry-pick、commit、push 或修改源仓库')
    expect(prompt).toContain('当前任务页选择的仓库不是合并目标')
  })

  it('builds a start prompt that still requires preflight and no automatic push', () => {
    const prompt = buildCodeMergePrompt('start', '/tmp/release.xlsx')

    expect(prompt).toContain('先执行完整预检')
    expect(prompt).toContain('隔离工作区')
    expect(prompt).toContain('不要自动 push')
  })

  it('marks code merge context without widening the persisted linked task provider', () => {
    const item = buildCodeMergeLinkedWorkItem('preflight', '/tmp/release.xlsx')

    expect(item.provider).toBe('yunxiao')
    expect(item.linkedContext?.provider).toBe('code-merge')
    expect(item.linkedContext?.renderedText).toContain('/tmp/release.xlsx')
    expect(item.linkedContext?.renderedText).toContain('$his-release-merge')
    expect(item.title).toContain('HIS 发版代码合并')
    expect(item.repoId).toBeUndefined()
  })
})
