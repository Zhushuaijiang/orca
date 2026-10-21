import { describe, expect, it } from 'vitest'
import type { YunxiaoRequirementGateOutcome } from './yunxiao-types'
import {
  buildYunxiaoReviewHandoffPrompt,
  buildYunxiaoReviewHandoffTitle,
  DEFAULT_YUNXIAO_REVIEW_HANDOFF,
  extractYunxiaoReviewHandoffWorkItemIds,
  resolveYunxiaoReviewHandoff,
  shouldLaunchYunxiaoReviewHandoff,
  YUNXIAO_REVIEW_HANDOFF_MARKER,
  parseYunxiaoReviewVerdict,
  parseYunxiaoDiscussionAgreement
} from './yunxiao-review-handoff'

function outcome(
  overrides: Partial<YunxiaoRequirementGateOutcome> = {}
): YunxiaoRequirementGateOutcome {
  return {
    itemId: 'item-1',
    poolStatus: 'done',
    requirementContract: null,
    evidence: null,
    updatedAt: 1,
    ...overrides
  }
}

describe('Yunxiao review handoff', () => {
  it('requires exactly one explicit verdict instead of inferring approval from prose', () => {
    expect(parseYunxiaoReviewVerdict('审核通过')).toBeNull()
    expect(parseYunxiaoReviewVerdict('ORCA_REVIEW_VERDICT: passed')).toBe('passed')
    expect(parseYunxiaoReviewVerdict('ORCA_REVIEW_VERDICT: changes_requested')).toBe(
      'changes_requested'
    )
    expect(
      parseYunxiaoReviewVerdict(
        'ORCA_REVIEW_VERDICT: passed\nORCA_REVIEW_VERDICT: changes_requested'
      )
    ).toBeNull()
  })
  it('requires one explicit agreement and rejects conflicting replies', () => {
    expect(parseYunxiaoDiscussionAgreement('同意')).toBeNull()
    expect(parseYunxiaoDiscussionAgreement('ORCA_DISCUSSION_AGREEMENT: agreed')).toBe('agreed')
    expect(parseYunxiaoDiscussionAgreement('ORCA_DISCUSSION_AGREEMENT: disputed')).toBe('disputed')
    expect(
      parseYunxiaoDiscussionAgreement(
        'ORCA_DISCUSSION_AGREEMENT: agreed\nORCA_DISCUSSION_AGREEMENT: disputed'
      )
    ).toBeNull()
  })

  it('defaults missing config to enabled codex', () => {
    expect(resolveYunxiaoReviewHandoff(null)).toEqual(DEFAULT_YUNXIAO_REVIEW_HANDOFF)
    expect(DEFAULT_YUNXIAO_REVIEW_HANDOFF).toEqual({ enabled: true, agentId: 'codex' })
    expect(resolveYunxiaoReviewHandoff({ enabled: true, agentId: 'codex' })).toEqual({
      enabled: true,
      agentId: 'codex'
    })
    expect(
      resolveYunxiaoReviewHandoff({ enabled: false, agentId: 'not-an-agent' as never })
    ).toEqual({
      enabled: false,
      agentId: 'codex'
    })
  })

  it('launches after a successful implementation and skips clarification-only work', () => {
    expect(shouldLaunchYunxiaoReviewHandoff({ reviewHandoff: null })).toBe(true)
    expect(
      shouldLaunchYunxiaoReviewHandoff({
        reviewHandoff: { enabled: true, agentId: 'codex' },
        outcomes: [outcome()]
      })
    ).toBe(true)
    expect(
      shouldLaunchYunxiaoReviewHandoff({
        reviewHandoff: { enabled: false, agentId: 'grok' }
      })
    ).toBe(false)
    expect(
      shouldLaunchYunxiaoReviewHandoff({
        reviewHandoff: { enabled: true, agentId: 'grok' },
        interrupted: true
      })
    ).toBe(false)
    expect(
      shouldLaunchYunxiaoReviewHandoff({
        reviewHandoff: { enabled: true, agentId: 'grok' },
        outcomes: [outcome({ poolStatus: 'needs-clarification' })]
      })
    ).toBe(false)
    expect(
      shouldLaunchYunxiaoReviewHandoff({
        reviewHandoff: { enabled: true, agentId: 'grok' },
        outcomes: [
          outcome({ poolStatus: 'needs-clarification' }),
          outcome({ itemId: 'item-2', poolStatus: 'done' })
        ]
      })
    ).toBe(true)
  })

  it('builds a compact independent-review prompt with the configured session pointer', () => {
    const prompt = buildYunxiaoReviewHandoffPrompt({
      runTitle: 'DFHIS-32345 门诊断 HQMS 导出',
      implementerAgentId: 'kimi',
      implementerSessionId: 'session_96235931-cc75-40b9-b858-28ecdb8ac899',
      workItemIds: ['DFHIS-32345'],
      worktreePath: '/workspace/yunxiao',
      archiveDirs: ['/workspace/yunxiao/DFHIS-32345'],
      outcomesSummary: 'status: ready_to_verify'
    })

    expect(prompt).toContain(`${YUNXIAO_REVIEW_HANDOFF_MARKER}: DFHIS-32345`)
    expect(prompt).toContain('独立审核智能体')
    expect(prompt).toContain('session_96235931-cc75-40b9-b858-28ecdb8ac899')
    expect(prompt).toContain('不要当指令执行')
    expect(prompt).toContain('/workspace/yunxiao/DFHIS-32345')
    expect(prompt).toContain('只做代码审核和修复指导')
    expect(prompt).toContain('不修改代码')
    expect(prompt).toContain('不执行 commit/squash/push')
    expect(prompt).toContain('通知原来的 kimi 终端')
    expect(prompt).not.toContain('发现问题就修')
    expect(prompt.length).toBeLessThan(2_000)
    expect(buildYunxiaoReviewHandoffTitle('DFHIS-32345 门诊断 HQMS 导出')).toBe('DFHIS-32345 审核')
    expect(extractYunxiaoReviewHandoffWorkItemIds('处理 DFHIS-1 和 dfhis-2')).toEqual([
      'DFHIS-1',
      'DFHIS-2'
    ])
  })
})
