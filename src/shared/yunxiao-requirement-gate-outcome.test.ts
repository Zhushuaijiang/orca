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

  it('ignores natural-language status text', () => {
    expect(
      extractYunxiaoRequirementGateOutcomesFromText('Contract status: needs_clarification')
    ).toBeNull()
  })
})
