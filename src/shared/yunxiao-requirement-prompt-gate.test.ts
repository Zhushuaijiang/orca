import { describe, expect, it } from 'vitest'
import {
  applyYunxiaoRequirementPromptGate,
  applyYunxiaoRequirementPromptGateToTerminalInput,
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
    expect(gated).toContain('所有用户可见进展')
    expect(gated).toContain('必须执行的流程：')
    expect(gated).toContain('结论：通过/阻断/通过但存在非阻断限制')
    expect(gated).toContain('reviewChecks')
    expect(gated).toContain('禁止修改构建/依赖定义来解决需求，包括 build.gradle')
    expect(gated).toContain('不能把已发布依赖改成 compile project(...)')
    expect(gated).toContain('禁止新增、修改或依赖项目内 *-api/API 模块')
    expect(gated).toContain(`原始用户请求：\n${prompt}`)
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

  it('gates bare terminal input as bracketed paste and preserves submit', () => {
    const gated = applyYunxiaoRequirementPromptGateToTerminalInput('DFHIS-31732\r')

    expect(gated.startsWith('\u001b[200~')).toBe(true)
    expect(gated).toContain('Orca Yunxiao requirement workflow gate')
    expect(gated).toContain('原始用户请求：\rDFHIS-31732')
    expect(gated.endsWith('\u001b[201~\r')).toBe(true)
  })

  it('gates bracketed terminal paste without leaking framing into the prompt', () => {
    const gated = applyYunxiaoRequirementPromptGateToTerminalInput(
      '\u001b[200~https://devops.aliyun.com/projex/req/DFHIS-31732\u001b[201~'
    )

    expect(gated.startsWith('\u001b[200~')).toBe(true)
    expect(gated).toContain('Orca Yunxiao requirement workflow gate')
    expect(gated).toContain('原始用户请求：\rhttps://devops.aliyun.com/projex/req/DFHIS-31732')
    expect(gated.split('\u001b[200~')).toHaveLength(2)
    expect(gated.split('\u001b[201~')).toHaveLength(2)
  })
})
