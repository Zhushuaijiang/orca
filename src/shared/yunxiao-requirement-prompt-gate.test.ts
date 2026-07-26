import { describe, expect, it } from 'vitest'
import {
  applyYunxiaoRequirementPromptGate,
  containsYunxiaoRequirementReference,
  shouldApplyYunxiaoRequirementPromptGate
} from './yunxiao-requirement-prompt-gate'

describe('Yunxiao requirement prompt gate', () => {
  it('detects DFHIS ids and Yunxiao requirement links', () => {
    expect(containsYunxiaoRequirementReference('处理 DFHIS-31732')).toBe(true)
    expect(
      containsYunxiaoRequirementReference('https://devops.aliyun.com/projex/req/DFHIS-31732')
    ).toBe(true)
    expect(containsYunxiaoRequirementReference('plain request')).toBe(false)
  })

  it('wraps manual requirement prompts with the gate', () => {
    const prompt = 'https://devops.aliyun.com/projex/req/DFHIS-31732 修一下'
    const gated = applyYunxiaoRequirementPromptGate(prompt)

    expect(gated).toContain('Orca Yunxiao requirement workflow gate')
    expect(gated).toContain('Required workflow:')
    expect(gated).toContain('reviewChecks')
    expect(gated).toContain(`Original user request:\n${prompt}`)
  })

  it('does not wrap already gated or todo-pool prompts again', () => {
    const gated = applyYunxiaoRequirementPromptGate('DFHIS-31732')

    expect(shouldApplyYunxiaoRequirementPromptGate(gated)).toBe(false)
    expect(applyYunxiaoRequirementPromptGate(gated)).toBe(gated)
    expect(shouldApplyYunxiaoRequirementPromptGate('Yunxiao todo pool claim:\nDFHIS-31732')).toBe(
      false
    )
  })

  it('does not rewrite dispatched worker prompts', () => {
    const prompt =
      'You are working inside Orca, a multi-agent IDE. You are a dispatched worker.\nDFHIS-31732'

    expect(applyYunxiaoRequirementPromptGate(prompt)).toBe(prompt)
  })
})
