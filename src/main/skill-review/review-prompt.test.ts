import { describe, expect, it } from 'vitest'

import { buildSkillCuratorPrompt, buildSkillReviewPrompt } from './review-prompt'

const baseInput = {
  worktreePath: '/repo/wt-1',
  skillDirectories: ['/home/u/.agents/skills', '/home/u/.claude/skills'],
  memoryFilePath: '/home/u/.agents/memory/MEMORY.md'
}

describe('buildSkillReviewPrompt', () => {
  it('points at the transcript when available', () => {
    const prompt = buildSkillReviewPrompt({ ...baseInput, transcriptPath: '/t/session.jsonl' })

    expect(prompt).toContain('/t/session.jsonl')
    expect(prompt).toContain('沉淀信号')
    expect(prompt).toContain('负面清单')
    expect(prompt).toContain('/home/u/.agents/skills')
    expect(prompt).toContain('/home/u/.agents/memory/MEMORY.md')
  })

  it('falls back to git-history hints without a transcript', () => {
    const prompt = buildSkillReviewPrompt({ ...baseInput, transcriptPath: null })

    expect(prompt).toContain('找不到本次会话的 transcript')
    expect(prompt).toContain(baseInput.worktreePath)
  })
})

describe('buildSkillCuratorPrompt', () => {
  it('forbids deletion and lists the skill directories', () => {
    const prompt = buildSkillCuratorPrompt(baseInput)

    expect(prompt).toContain('绝不删除任何文件')
    expect(prompt).toContain('/home/u/.claude/skills')
  })
})
