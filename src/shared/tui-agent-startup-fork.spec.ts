import { afterEach, describe, expect, it } from 'vitest'
import { buildAgentDraftLaunchPlan, buildAgentStartupPlan } from './tui-agent-startup'
import { setYunxiaoRequirementPromptGateEnabled } from './yunxiao-requirement-prompt-gate'

afterEach(() => {
  setYunxiaoRequirementPromptGateEnabled(false)
})

describe('fork Yunxiao requirement prompt gate', () => {
  it('gates manual Yunxiao requirement prompts before argv startup commands are built', () => {
    setYunxiaoRequirementPromptGateEnabled(true)
    const plan = buildAgentStartupPlan({
      agent: 'codex',
      prompt: 'https://devops.aliyun.com/projex/req/DFHIS-31732 修一下',
      cmdOverrides: {},
      platform: 'linux'
    })

    expect(plan?.launchCommand).toContain('Orca Yunxiao requirement workflow gate')
    expect(plan?.launchCommand).toContain('DFHIS-31732')
  })

  it('gates manual Yunxiao requirement prompts before native draft plans are built', () => {
    setYunxiaoRequirementPromptGateEnabled(true)
    const plan = buildAgentDraftLaunchPlan({
      agent: 'omp',
      draft: 'https://devops.aliyun.com/projex/req/DFHIS-31732 修一下',
      cmdOverrides: {},
      platform: 'linux'
    })

    expect(plan?.env?.ORCA_OMP_PREFILL).toContain('Orca Yunxiao requirement workflow gate')
    expect(plan?.env?.ORCA_OMP_PREFILL).toContain('DFHIS-31732')
  })
})
