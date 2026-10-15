import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'

const leafId = '7c6fb4e5-3bf1-4ff4-8259-03f7ae81c40d'
const implementerPaneKey = `implementer:${leafId}`
const reviewerPaneKey = `reviewer:${leafId}`
const send = vi.fn()
const reportError = vi.fn()
const listeners = new Set<() => void>()
const state: {
  agentStatusByPaneKey: Record<string, AgentStatusEntry>
  terminalLayoutsByTabId: Record<string, { ptyIdsByLeafId: Record<string, string> }>
} = { agentStatusByPaneKey: {}, terminalLayoutsByTabId: {} }

vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => reportError(...args) } }))
vi.mock('./active-agent-note-send', () => ({
  sendNotesToActiveAgentSession: (...args: unknown[]) => send(...args)
}))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}))

import { createYunxiaoReviewHandoffReturn } from './yunxiao-review-handoff-return'

function status(overrides: Partial<AgentStatusEntry> = {}): AgentStatusEntry {
  return {
    paneKey: reviewerPaneKey,
    state: 'working',
    updatedAt: 20,
    stateStartedAt: 10,
    prompt: 'review',
    stateHistory: [],
    ...overrides
  }
}

function createReturn() {
  return createYunxiaoReviewHandoffReturn({
    worktreeId: 'folder:workspace',
    runTitle: 'DFHIS-32345 HQMS 导出',
    implementerPaneKey
  })
}

function publish(entry: AgentStatusEntry) {
  state.agentStatusByPaneKey[reviewerPaneKey] = entry
  for (const listener of listeners) {
    listener()
  }
}

describe('Yunxiao review return', () => {
  beforeEach(() => {
    listeners.clear()
    vi.clearAllMocks()
    send.mockResolvedValue({ status: 'sent' })
    state.terminalLayoutsByTabId = {
      implementer: { ptyIdsByLeafId: { [leafId]: 'original-pty' } }
    }
    state.agentStatusByPaneKey = {
      [implementerPaneKey]: status({
        paneKey: implementerPaneKey,
        providerSession: { key: 'session_id', id: 'original-session' }
      })
    }
  })

  it('returns the final review once to the original pane through the host-routed sender', async () => {
    const reviewReturn = createReturn()
    reviewReturn.observe(reviewerPaneKey, 10)
    publish(status({ state: 'done', lastAssistantMessage: 'P1: 修复空值判断，补充回归测试。' }))
    reviewReturn.onAgentStatus({
      prompt: 'review',
      state: 'done',
      lastAssistantMessage: 'duplicate'
    })

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(send).toHaveBeenCalledWith({
      worktreeId: 'folder:workspace',
      noteTarget: expect.objectContaining({ tabId: 'implementer', leafId }),
      prompt: expect.stringContaining('P1: 修复空值判断，补充回归测试。')
    })
    expect(send.mock.calls[0]?.[0]?.prompt).toContain('你是原实现智能体')
    expect(listeners.size).toBe(0)
    expect(reportError).not.toHaveBeenCalled()
  })

  it('ignores launch boundaries and intermediate messages', () => {
    const reviewReturn = createReturn()
    reviewReturn.onAgentStatus({ prompt: 'review', state: 'done', sessionBoundary: true })
    reviewReturn.observe(reviewerPaneKey, 10)
    publish(status({ state: 'done', sessionBoundary: true }))
    publish(status({ state: 'working', lastAssistantMessage: '正在检查' }))
    expect(send).not.toHaveBeenCalled()
    expect(reportError).not.toHaveBeenCalled()

    reviewReturn.onAgentStatus({
      prompt: 'review',
      state: 'done',
      lastAssistantMessage: '审核通过，无待修复问题。'
    })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('captures a completion that arrived before launch returned', () => {
    const reviewReturn = createReturn()
    publish(status({ state: 'done', lastAssistantMessage: '审核通过' }))
    reviewReturn.observe(reviewerPaneKey, 10)
    expect(send).toHaveBeenCalledTimes(1)
    expect(listeners.size).toBe(0)
  })

  it('uses the completed reply when status publications coalesce done and working', () => {
    const reviewReturn = createReturn()
    reviewReturn.observe(reviewerPaneKey, 10)
    publish(
      status({
        stateHistory: [{ state: 'done', prompt: 'review', startedAt: 15 }],
        lastCompletedAssistantMessage: 'P2: 增加边界检查'
      })
    )
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('P2: 增加边界检查')
      })
    )
  })

  it('does not return an interrupted review', () => {
    const reviewReturn = createReturn()
    reviewReturn.observe(reviewerPaneKey, 10)
    publish(status({ state: 'done', interrupted: true, lastAssistantMessage: 'partial' }))
    expect(send).not.toHaveBeenCalled()
    expect(listeners.size).toBe(0)
  })

  it.each(['closed', 'rebound', 'different-session'])(
    'refuses an original terminal that is %s',
    (change) => {
      const reviewReturn = createReturn()
      if (change === 'closed') {
        state.terminalLayoutsByTabId = {}
      } else if (change === 'rebound') {
        state.terminalLayoutsByTabId.implementer = { ptyIdsByLeafId: { [leafId]: 'new-pty' } }
      } else {
        state.agentStatusByPaneKey[implementerPaneKey] = status({
          providerSession: { key: 'session_id', id: 'new-session' }
        })
      }
      reviewReturn.onAgentStatus({
        prompt: 'review',
        state: 'done',
        lastAssistantMessage: 'P1: issue'
      })
      expect(send).not.toHaveBeenCalled()
      expect(reportError).toHaveBeenCalledTimes(1)
    }
  )

  it('surfaces a send refusal without retrying or launching another agent', async () => {
    send.mockResolvedValue({ status: 'not-writable' })
    const reviewReturn = createReturn()
    reviewReturn.onAgentStatus({
      prompt: 'review',
      state: 'done',
      lastAssistantMessage: 'P1: issue'
    })
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledTimes(1))
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('reports unavailable review output instead of forwarding an empty repair task', () => {
    const reviewReturn = createReturn()
    reviewReturn.onAgentStatus({ prompt: 'review', state: 'done' })
    expect(send).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  it('keeps waiting for host completion after loss of SSH contact', () => {
    const reviewReturn = createReturn()
    reviewReturn.observe(reviewerPaneKey, 10)
    reviewReturn.onExit('remote:review-pty', -1)
    expect(send).not.toHaveBeenCalled()
    expect(listeners.size).toBe(1)
    expect(reportError).not.toHaveBeenCalled()
    publish(status({ state: 'done', lastAssistantMessage: 'late host completion' }))
    expect(send).toHaveBeenCalledTimes(1)
    expect(listeners.size).toBe(0)
  })

  it('reports a proven process exit without a completed review', () => {
    const reviewReturn = createReturn()
    reviewReturn.observe(reviewerPaneKey, 10)
    reviewReturn.onExit('review-pty', 1)
    expect(send).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(listeners.size).toBe(0)
  })
})
