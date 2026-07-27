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

  it('ignores natural-language status text', () => {
    expect(
      extractYunxiaoRequirementGateOutcomesFromText('Contract status: needs_clarification')
    ).toBeNull()
  })
})
