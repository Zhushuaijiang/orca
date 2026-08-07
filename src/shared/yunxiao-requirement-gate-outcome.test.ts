import { describe, expect, it } from 'vitest'

import { extractYunxiaoRequirementGateOutcomesFromText } from './yunxiao-requirement-gate-outcome'

describe('extractYunxiaoRequirementGateOutcomesFromText', () => {
  it('extracts per-item outcomes from fenced JSON', () => {
    const outcomes = extractYunxiaoRequirementGateOutcomesFromText(`Done.

\`\`\`json
{
  "yunxiaoRequirementOutcomes": [
    {
      "itemId": "yunxiao-item-1",
      "poolStatus": "needs-clarification",
      "requirementContract": null,
      "evidence": "Q1 blocks implementation.",
      "updatedAt": 42
    }
  ]
}
\`\`\``)

    expect(outcomes).toEqual([
      expect.objectContaining({
        itemId: 'yunxiao-item-1',
        poolStatus: 'needs-clarification',
        evidence: 'Q1 blocks implementation.'
      })
    ])
  })

  it('extracts an embedded outcomes property from plain text', () => {
    const outcomes = extractYunxiaoRequirementGateOutcomesFromText(`已完成 DFHIS-31687。

"yunxiaoRequirementOutcomes": [
  {
    "itemId": "DFHIS-31687",
    "poolStatus": "ready_to_verify",
    "requirementContract": {
      "status": "ready_to_verify",
      "owner": "qa",
      "nextAction": "QA 验证。",
      "intent": "修复已提交。",
      "archiveDir": null,
      "prdPath": null,
      "evidenceUpdatedAt": null,
      "updatedAt": 42,
      "blockingQuestions": [],
      "decisions": [],
      "riskProfile": null,
      "reviewChecks": []
    },
    "evidence": "已推送。",
    "updatedAt": 43
  }
]

后续说明。`)

    expect(outcomes).toEqual([
      expect.objectContaining({
        itemId: 'DFHIS-31687',
        poolStatus: 'ready_to_verify',
        evidence: '已推送。'
      })
    ])
  })

  it('extracts text-form outcomes from Codex final summaries', () => {
    const outcomes = extractYunxiaoRequirementGateOutcomesFromText(`DFHIS-31773 已处理完成。

yunxiaoRequirementOutcomes:
- itemId: DFHIS-31773
  poolStatus: 待测试
  requirementContract:
    status: ready_to_verify
    owner: qa
    next_action: QA 环境复核多入口页面
    intent: 检验报告敏感项显示修复
    blocking_questions: 无

验证结果：git diff --check 四仓通过，Node 规则用例 14 组通过。`)

    expect(outcomes).toEqual([
      expect.objectContaining({
        itemId: 'DFHIS-31773',
        poolStatus: 'done',
        requirementContract: expect.objectContaining({
          status: 'ready_to_verify',
          owner: 'qa',
          methodologyGate: expect.objectContaining({
            verificationEvidence: [
              expect.objectContaining({
                result: 'pass',
                summary: expect.stringContaining('git diff --check')
              })
            ]
          })
        })
      })
    ])
  })

  it('extracts text-form outcomes with the 开发测试 pool status', () => {
    const outcomes = extractYunxiaoRequirementGateOutcomesFromText(`DFHIS-31800 已处理完成。

yunxiaoRequirementOutcomes:
- itemId: DFHIS-31800
  poolStatus: 开发测试
  requirementContract:
    status: ready_to_verify
    owner: qa
    next_action: QA 环境复核多入口页面
    intent: 需求修复交付
    blocking_questions: 无

验证结果：git diff --check 通过，编译通过。`)

    expect(outcomes).toEqual([
      expect.objectContaining({
        itemId: 'DFHIS-31800',
        poolStatus: 'done'
      })
    ])
  })

  it('ignores natural-language status text', () => {
    expect(
      extractYunxiaoRequirementGateOutcomesFromText('Contract status: needs_clarification')
    ).toBeNull()
  })
})
