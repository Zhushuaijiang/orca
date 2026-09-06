import { describe, expect, it } from 'vitest'
import type { YunxiaoRequirementGateOutcome } from './yunxiao-types'
import {
  buildYunxiaoReviewHandoffPrompt,
  buildYunxiaoReviewHandoffTitle,
  DEFAULT_YUNXIAO_REVIEW_HANDOFF,
  extractYunxiaoReviewHandoffWorkItemIds,
  resolveYunxiaoReviewHandoff,
  shouldLaunchYunxiaoReviewHandoff,
  YUNXIAO_REVIEW_HANDOFF_MARKER
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
  it('defaults missing config to enabled grok', () => {
    expect(resolveYunxiaoReviewHandoff(null)).toEqual(DEFAULT_YUNXIAO_REVIEW_HANDOFF)
    expect(resolveYunxiaoReviewHandoff({ enabled: true, agentId: 'codex' })).toEqual({
      enabled: true,
      agentId: 'codex'
    })
    expect(
      resolveYunxiaoReviewHandoff({ enabled: false, agentId: 'not-an-agent' as never })
    ).toEqual({
      enabled: false,
      agentId: 'grok'
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
    expect(prompt).toContain('squash 成 1 条 commit')
    expect(prompt).toContain('$yunxiao-requirement-archiver')
    expect(prompt.length).toBeLessThan(2_000)
    expect(buildYunxiaoReviewHandoffTitle('DFHIS-32345 门诊断 HQMS 导出')).toBe('DFHIS-32345 审核')
    expect(extractYunxiaoReviewHandoffWorkItemIds('处理 DFHIS-1 和 dfhis-2')).toEqual([
      'DFHIS-1',
      'DFHIS-2'
    ])
  })
})
