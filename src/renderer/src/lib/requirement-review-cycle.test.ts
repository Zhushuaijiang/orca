import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import { normalizePromptField } from '../../../shared/agent-status-field-normalization'

const leafId = '7c6fb4e5-3bf1-4ff4-8259-03f7ae81c40d'
const paneKey = `implementer:${leafId}`
const send = vi.fn()
const listeners = new Set<() => void>()
const state: {
  getKnownWorktreeById: () => { requirementReviews: Record<string, never> }
  updateWorktreeMeta: () => Promise<{ ok: boolean }>
  agentStatusByPaneKey: Record<string, AgentStatusEntry>
  terminalLayoutsByTabId: Record<string, { ptyIdsByLeafId: Record<string, string> }>
} = {
  agentStatusByPaneKey: {},
  terminalLayoutsByTabId: {},
  getKnownWorktreeById: () => ({ requirementReviews: {} }),
  updateWorktreeMeta: async () => ({ ok: true })
}
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
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
import { createRequirementReviewCycle } from './requirement-review-cycle'
import { useRequirementReviewState } from './requirement-review-state'
import type { createYunxiaoReviewHandoffReturn } from './yunxiao-review-handoff-return'
type Observer = ReturnType<typeof createYunxiaoReviewHandoffReturn>

function publish(stateName: 'working' | 'done', overrides: Partial<AgentStatusEntry> = {}) {
  state.agentStatusByPaneKey[paneKey] = {
    paneKey,
    state: stateName,
    prompt: normalizePromptField(send.mock.lastCall?.[0]?.prompt ?? 'fix'),
    stateHistory: [],
    updatedAt: Date.now() + 100,
    stateStartedAt: Date.now(),
    providerSession: { key: 'session_id', id: 'original' },
    lastAssistantMessage: '补充证据，仍有分歧\nORCA_DISCUSSION_AGREEMENT: disputed',
    ...overrides
  }
  for (const listener of listeners) {
    listener()
  }
}

function setup() {
  const observers: Observer[] = []
  const launchRound = vi.fn(async (_round: number, _reply: string | null, observer: Observer) => {
    observers.push(observer)
    return true
  })
  const cycle = createRequirementReviewCycle({
    worktreeId: 'folder:workspace',
    runTitle: '需求',
    implementerPaneKey: paneKey,
    launchRound
  })
  const finish = (round: number, reply = 'ORCA_REVIEW_VERDICT: passed') => {
    observers[round - 1]?.onAgentStatus({
      state: 'done',
      prompt: 'review',
      lastAssistantMessage: reply
    })
  }
  return { cycle, launchRound, finish }
}

describe('requirement review cycle', () => {
  beforeEach(() => {
    listeners.clear()
    vi.clearAllMocks()
    useRequirementReviewState.setState({ reviews: {} })
    state.terminalLayoutsByTabId = { implementer: { ptyIdsByLeafId: { [leafId]: 'pty-original' } } }
    publish('done')
    send.mockResolvedValue({ status: 'sent' })
  })

  it('runs three reviews separated by actual repair turns and requires final user confirmation', async () => {
    const { cycle, launchRound, finish } = setup()
    await cycle.start()
    for (let round = 1; round <= 2; round += 1) {
      finish(round, '发现问题\nORCA_REVIEW_VERDICT: changes_requested')
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(round))
      publish('done')
      expect(launchRound).toHaveBeenCalledTimes(round)
      publish('working')
      publish('done')
      await vi.waitFor(() => expect(launchRound).toHaveBeenCalledTimes(round + 1))
    }
    finish(3)
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3))
    expect(useRequirementReviewState.getState().reviews[paneKey]?.phase).toBe('repairing')
    publish('working')
    publish('done', {
      lastAssistantMessage: '共同目标达成、没有剩余分歧\nORCA_DISCUSSION_AGREEMENT: agreed'
    })
    await vi.waitFor(() =>
      expect(useRequirementReviewState.getState().reviews[paneKey]?.phase).toBe(
        'awaiting_confirmation'
      )
    )
    expect(useRequirementReviewState.getState().reviews[paneKey]).toMatchObject({
      round: 3,
      phase: 'awaiting_confirmation'
    })
    expect(launchRound.mock.calls.map((call) => call[0])).toEqual([1, 2, 3])
    expect(listeners.size).toBe(0)
  })

  it.each(['审核通过', 'ORCA_REVIEW_VERDICT: passed\nORCA_REVIEW_VERDICT: changes_requested'])(
    'refuses an ambiguous verdict: %s',
    async (reply) => {
      const { cycle, finish, launchRound } = setup()
      await cycle.start()
      finish(1, reply)
      expect(send).not.toHaveBeenCalled()
      expect(launchRound).toHaveBeenCalledTimes(1)
      expect(useRequirementReviewState.getState().reviews[paneKey]?.phase).toBe('failed')
    }
  )

  it('finishes early only when both agents explicitly agree on the same conclusion', async () => {
    const { cycle, finish, launchRound } = setup()
    await cycle.start()
    finish(1)
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    publish('working')
    publish('done', {
      lastAssistantMessage: '认同同一目标和验收证据\nORCA_DISCUSSION_AGREEMENT: agreed'
    })
    await vi.waitFor(() =>
      expect(useRequirementReviewState.getState().reviews[paneKey]?.phase).toBe(
        'awaiting_confirmation'
      )
    )
    expect(launchRound).toHaveBeenCalledTimes(1)
  })

  it('keeps a disagreement unresolved when the third round ends', async () => {
    const { cycle, finish, launchRound } = setup()
    await cycle.start()
    for (let round = 1; round <= 3; round += 1) {
      finish(round)
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(round))
      publish('working')
      publish('done')
      if (round < 3) {
        await vi.waitFor(() => expect(launchRound).toHaveBeenCalledTimes(round + 1))
      }
    }
    await vi.waitFor(() =>
      expect(useRequirementReviewState.getState().reviews[paneKey]?.phase).toBe('changes_requested')
    )
    expect(launchRound).toHaveBeenCalledTimes(3)
  })

  it('stops when the original provider session changes', async () => {
    const { cycle, finish } = setup()
    await cycle.start()
    publish('done', { providerSession: { key: 'session_id', id: 'replacement' } })
    finish(1)
    expect(send).not.toHaveBeenCalled()
    expect(useRequirementReviewState.getState().reviews[paneKey]?.phase).toBe('failed')
  })

  it.each(['sent', 'not-writable'])(
    'waits for delivery before accepting a racing reply: %s',
    async (status) => {
      let resolveDelivery: (result: { status: string }) => void = () => {}
      send.mockImplementationOnce(
        () =>
          new Promise<{ status: string }>((resolve) => {
            resolveDelivery = resolve
          })
      )
      const { cycle, finish } = setup()
      await cycle.start()
      finish(1)
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
      publish('working')
      publish('done', { lastAssistantMessage: 'ORCA_DISCUSSION_AGREEMENT: agreed' })
      await Promise.resolve()
      expect(useRequirementReviewState.getState().reviews[paneKey]?.phase).toBe('repairing')
      resolveDelivery({ status })
      await vi.waitFor(() =>
        expect(useRequirementReviewState.getState().reviews[paneKey]?.phase).toBe(
          status === 'sent' ? 'awaiting_confirmation' : 'failed'
        )
      )
      expect(listeners.size).toBe(0)
    }
  )

  it('ignores an unrelated turn even when it explicitly agrees', async () => {
    const { cycle, finish } = setup()
    await cycle.start()
    finish(1)
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    publish('working', { prompt: 'unrelated user task' })
    publish('done', {
      prompt: 'unrelated user task',
      lastAssistantMessage: 'ORCA_DISCUSSION_AGREEMENT: agreed'
    })
    expect(useRequirementReviewState.getState().reviews[paneKey]?.phase).toBe('repairing')
    publish('working')
    publish('done', { lastAssistantMessage: 'ORCA_DISCUSSION_AGREEMENT: agreed' })
    await vi.waitFor(() =>
      expect(useRequirementReviewState.getState().reviews[paneKey]?.phase).toBe(
        'awaiting_confirmation'
      )
    )
  })

  it('stops on refused delivery and releases the repair observer', async () => {
    send.mockResolvedValue({ status: 'not-writable' })
    const { cycle, finish } = setup()
    await cycle.start()
    finish(1)
    await vi.waitFor(() =>
      expect(useRequirementReviewState.getState().reviews[paneKey]?.phase).toBe('failed')
    )
    expect(listeners.size).toBe(0)
  })

  it('preserves prior discussion when a resumed cycle fails to launch', async () => {
    const cycle = createRequirementReviewCycle({
      worktreeId: 'folder:workspace',
      runTitle: '需求',
      implementerPaneKey: paneKey,
      initialDiscussion: '此前双方分歧和证据',
      launchRound: async () => false
    })
    await cycle.start()
    await vi.waitFor(() =>
      expect(useRequirementReviewState.getState().reviews[paneKey]).toMatchObject({
        phase: 'failed',
        review: '此前双方分歧和证据'
      })
    )
  })

  it('does not turn an interrupted reviewer into a repair instruction', async () => {
    const observers: Observer[] = []
    const cycle = createRequirementReviewCycle({
      worktreeId: 'folder:workspace',
      runTitle: '需求',
      implementerPaneKey: paneKey,
      launchRound: async (_round, _reply, observer) => {
        observers.push(observer)
        return true
      }
    })
    await cycle.start()
    observers[0]?.onAgentStatus({
      state: 'done',
      prompt: 'review',
      interrupted: true,
      lastAssistantMessage: 'partial'
    })
    expect(send).not.toHaveBeenCalled()
    expect(useRequirementReviewState.getState().reviews[paneKey]?.phase).toBe('interrupted')
  })
})
