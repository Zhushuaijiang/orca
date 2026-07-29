import { describe, expect, it } from 'vitest'

import {
  getCodeMergeBatchLabel,
  buildCodeMergeLinkedWorkItem,
  buildCodeMergePrompt,
  getCodeMergeWorkspaceSeed
} from '@/components/task-page-code-merge-workflow'

describe('task-page-code-merge-workflow', () => {
  it('builds a guarded preflight prompt', () => {
    const prompt = buildCodeMergePrompt('preflight', '/tmp/钉钉文档_合并清单_2026-07-27.xlsx')

    expect(prompt).toContain('$his-release-merge')
    expect(prompt).not.toContain('/Users/jijiguowangdemac/Desktop/his-release-merge')
    expect(prompt).not.toContain('/Users/jijiguowangdemac/workspace/dongfang/his/code')
    expect(prompt).not.toContain('/Users/jijiguowangdemac/workspace/dongfang/his/release-merge')
    expect(prompt).toContain('/tmp/钉钉文档_合并清单_2026-07-27.xlsx')
    expect(prompt).toContain('HIS 源码根目录只读')
    expect(prompt).toContain('不要使用预设固定路径')
    expect(prompt).toContain('必须按当前执行主机动态发现')
    expect(prompt).toContain('HIS_SOURCE_ROOT')
    expect(prompt).toContain('DFHIS_SOURCE_ROOT')
    expect(prompt).toContain('HIS_RELEASE_MERGE_ROOT')
    expect(prompt).toContain('禁止在源码根目录执行 git fetch')
    expect(prompt).toContain('任何会写工作区/.git 元数据的命令')
    expect(prompt).toContain('RC_2.16.1_250514')
    expect(prompt).toContain('release_2.15.3_250515')
    expect(prompt).toContain('预检阶段不得修改任何仓库或工作区')
    expect(prompt).toContain('不得创建隔离副本')
    expect(prompt).toContain('预检阶段不得 cherry-pick、merge、commit、push')
    expect(prompt).toContain('只允许读取 Excel、读取文件')
    expect(prompt).toContain('计划中需要复制/合并的仓库')
    expect(prompt).not.toContain('将要复制/合并的仓库')
    expect(prompt).toContain('当前任务页选择的仓库不是合并目标')
  })

  it('builds a start prompt that still requires preflight and no automatic push', () => {
    const prompt = buildCodeMergePrompt('start', '/tmp/release.xlsx')

    expect(prompt).toContain('先执行完整预检')
    expect(prompt).toContain('隔离工作区')
    expect(prompt).toContain('不要自动 push')
  })

  it('derives batch labels and workspace seeds from the selected Excel file', () => {
    expect(getCodeMergeBatchLabel('C:\\Users\\13406\\Desktop\\合并清单_2026-07-29.xlsx')).toBe(
      '2026-07-29'
    )
    expect(getCodeMergeBatchLabel('/tmp/release.xlsx')).toBe('manual')
    expect(
      getCodeMergeWorkspaceSeed('preflight', 'C:\\Users\\13406\\Desktop\\合并清单_2026-07-29.xlsx')
    ).toBe('his-release-merge-2026-07-29-preflight')
  })

  it('marks code merge context without widening the persisted linked task provider', () => {
    const item = buildCodeMergeLinkedWorkItem('preflight', '/tmp/release_2026-07-29.xlsx')

    expect(item.provider).toBe('yunxiao')
    expect(item.linkedContext?.provider).toBe('code-merge')
    expect(item.linkedContext?.renderedText).toContain('/tmp/release_2026-07-29.xlsx')
    expect(item.linkedContext?.renderedText).toContain('$his-release-merge')
    expect(item.linkedContext?.renderedText).toContain('Batch: 2026-07-29')
    expect(item.linkedContext?.renderedText).toContain(
      'Source root: discover on the current execution host'
    )
    expect(item.title).toContain('HIS 发版代码合并')
    expect(item.repoId).toBeUndefined()
  })
})
