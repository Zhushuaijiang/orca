import { afterEach, describe, expect, it } from 'vitest'
import {
  applyYunxiaoRequirementPromptGate,
  applyYunxiaoRequirementPromptGateToTerminalInput,
  containsYunxiaoRequirementReference,
  setYunxiaoRequirementPromptGateEnabled,
  shouldApplyYunxiaoRequirementPromptGate
} from './yunxiao-requirement-prompt-gate'

afterEach(() => {
  setYunxiaoRequirementPromptGateEnabled(false)
})

describe('Yunxiao requirement prompt gate', () => {
  it('detects DFHIS ids and Yunxiao requirement links', () => {
    expect(containsYunxiaoRequirementReference('处理 DFHIS-31732')).toBe(true)
    expect(
      containsYunxiaoRequirementReference('https://devops.aliyun.com/projex/req/DFHIS-31732')
    ).toBe(true)
    expect(containsYunxiaoRequirementReference('plain request')).toBe(false)
  })

  it('does not gate when disabled (default)', () => {
    setYunxiaoRequirementPromptGateEnabled(false)
    const prompt = 'https://devops.aliyun.com/projex/req/DFHIS-31732 修一下'
    expect(shouldApplyYunxiaoRequirementPromptGate(prompt)).toBe(false)
    expect(applyYunxiaoRequirementPromptGate(prompt)).toBe(prompt)
  })

  it('wraps manual requirement prompts with the gate when enabled', () => {
    setYunxiaoRequirementPromptGateEnabled(true)
    const prompt = 'https://devops.aliyun.com/projex/req/DFHIS-31732 修一下'
    const gated = applyYunxiaoRequirementPromptGate(prompt)

    expect(gated).toContain('Orca Yunxiao requirement workflow gate: DFHIS-31732')
    expect(gated).toContain('执行 $yunxiao-requirement-archiver')
    expect(gated).toContain('事实卡/索引定位候选仓库')
    expect(gated).toContain('禁止因“多仓库”单一因素固定启动四个 reviewer')
    expect(gated).toContain('不得为需求修改构建/锁文件')
    expect(gated).toContain('只改业务仓内已废弃的 *-api/DTO/Req/Feign 契约')
    expect(gated).toContain('先修改共享 df-his-api')
    expect(gated).toContain(`原始用户请求：\n${prompt}`)
    expect(gated.length).toBeLessThan(1_200)
  })

  it('adds YGT harness instructions for manual 医共体 requirement prompts', () => {
    setYunxiaoRequirementPromptGateEnabled(true)
    const prompt = 'https://devops.aliyun.com/projex/req/DFHIS-31812 公告管理页面体验优化'
    const gated = applyYunxiaoRequirementPromptGate(prompt)

    expect(gated).toContain('Orca Yunxiao requirement workflow gate')
    expect(gated).toContain('Orca YGT workflow harness gate')
    expect(gated).toContain('必须先使用 $ygt skill')
    expect(gated).toContain('node scripts/harness/ygt-workflow.mjs /ygt')
    expect(gated).toContain('--project auto --json')
  })

  it('does not wrap already gated or todo-pool prompts again', () => {
    setYunxiaoRequirementPromptGateEnabled(true)
    const gated = applyYunxiaoRequirementPromptGate('DFHIS-31732')

    expect(shouldApplyYunxiaoRequirementPromptGate(gated)).toBe(false)
    expect(applyYunxiaoRequirementPromptGate(gated)).toBe(gated)
    expect(shouldApplyYunxiaoRequirementPromptGate('Yunxiao todo pool claim:\nDFHIS-31732')).toBe(
      false
    )
  })

  it('does not rewrite dispatched worker prompts', () => {
    setYunxiaoRequirementPromptGateEnabled(true)
    const prompt =
      'You are working inside Orca, a multi-agent IDE. You are a dispatched worker.\nDFHIS-31732'

    expect(applyYunxiaoRequirementPromptGate(prompt)).toBe(prompt)
  })

  it('gates bare terminal input as bracketed paste and preserves submit', () => {
    setYunxiaoRequirementPromptGateEnabled(true)
    const gated = applyYunxiaoRequirementPromptGateToTerminalInput('DFHIS-31732\r')

    expect(gated.startsWith('\u001b[200~')).toBe(true)
    expect(gated).toContain('Orca Yunxiao requirement workflow gate')
    expect(gated).toContain('原始用户请求：\rDFHIS-31732')
    expect(gated.endsWith('\u001b[201~\r')).toBe(true)
  })

  it('gates bracketed terminal paste without leaking framing into the prompt', () => {
    setYunxiaoRequirementPromptGateEnabled(true)
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
