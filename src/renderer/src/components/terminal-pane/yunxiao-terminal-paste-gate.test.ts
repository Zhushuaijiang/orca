import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { applyYunxiaoRequirementTerminalPasteGate } from './yunxiao-terminal-paste-gate'

function agentStatus(paneKey: string): AgentStatusEntry {
  return {
    paneKey,
    state: 'done',
    prompt: '',
    agentType: 'codex',
    updatedAt: Date.now(),
    stateStartedAt: Date.now(),
    stateHistory: []
  }
}

describe('Yunxiao terminal paste gate', () => {
  it('gates manual Yunxiao requirement paste for panes with a live agent row', () => {
    const paneKey = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')
    const text = 'https://devops.aliyun.com/projex/req/DFHIS-31732 修一下'

    const gated = applyYunxiaoRequirementTerminalPasteGate(text, {
      tabId: 'tab-1',
      leafId: '11111111-1111-4111-8111-111111111111',
      agentStatusByPaneKey: {
        [paneKey]: agentStatus(paneKey)
      }
    })

    expect(gated).toContain('Orca Yunxiao requirement workflow gate')
    expect(gated).toContain('原始用户请求：')
    expect(gated).toContain('DFHIS-31732')
  })

  it('leaves shell pane pastes unchanged', () => {
    const text = 'echo https://devops.aliyun.com/projex/req/DFHIS-31732'

    expect(
      applyYunxiaoRequirementTerminalPasteGate(text, {
        tabId: 'tab-1',
        leafId: '11111111-1111-4111-8111-111111111111',
        agentStatusByPaneKey: {}
      })
    ).toBe(text)
  })
})
