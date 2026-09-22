// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveYunxiaoReviewHandoff } from '../../../shared/yunxiao-review-handoff'
import {
  loadYunxiaoReviewHandoffPreference,
  readStoredYunxiaoReviewHandoffPreference,
  restoreYunxiaoReviewHandoffPreference,
  saveYunxiaoReviewHandoffPreference
} from './yunxiao-review-handoff-preference'

const STORAGE_KEY = 'orca.yunxiao.review-handoff.v1'

function automationWith(reviewHandoff: { enabled: boolean; agentId: 'grok' | 'codex' | 'claude' }) {
  return {
    yunxiaoTodoPool: {
      kind: 'yunxiao-todo-pool' as const,
      statuses: ['queued' as const],
      batchSize: 1,
      reviewHandoff
    }
  }
}

describe('Yunxiao review handoff preference', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('uses the default handoff when this computer has no saved choice', () => {
    expect(readStoredYunxiaoReviewHandoffPreference()).toBeNull()
    expect(loadYunxiaoReviewHandoffPreference()).toEqual(resolveYunxiaoReviewHandoff(null))
  })

  it('remembers the switch and agent after the page is opened again', () => {
    saveYunxiaoReviewHandoffPreference({ enabled: false, agentId: 'claude' })

    expect(loadYunxiaoReviewHandoffPreference()).toEqual({
      enabled: false,
      agentId: 'claude'
    })
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"agentId":"claude"')
  })

  it('keeps an explicit return to the default so a stale automation cannot replace it', () => {
    saveYunxiaoReviewHandoffPreference({ enabled: true, agentId: 'codex' })
    saveYunxiaoReviewHandoffPreference(resolveYunxiaoReviewHandoff(null))

    expect(readStoredYunxiaoReviewHandoffPreference()).toEqual({
      enabled: true,
      agentId: 'grok'
    })
  })

  it('ignores a stored value this build cannot launch', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: false, agentId: 'not-an-agent' }))

    expect(readStoredYunxiaoReviewHandoffPreference()).toBeNull()

    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(loadYunxiaoReviewHandoffPreference()).toEqual(resolveYunxiaoReviewHandoff(null))
  })

  it('adopts the automation choice when this computer has not chosen yet', async () => {
    const persist = vi.fn()

    await expect(
      restoreYunxiaoReviewHandoffPreference(
        automationWith({ enabled: false, agentId: 'codex' }),
        persist
      )
    ).resolves.toEqual({ enabled: false, agentId: 'codex' })
    expect(persist).not.toHaveBeenCalled()
    expect(readStoredYunxiaoReviewHandoffPreference()).toBeNull()
  })

  it('keeps the saved choice and writes it onto the automation when they differ', async () => {
    saveYunxiaoReviewHandoffPreference({ enabled: true, agentId: 'claude' })
    const persist = vi.fn().mockResolvedValue(undefined)

    await expect(
      restoreYunxiaoReviewHandoffPreference(
        automationWith({ enabled: true, agentId: 'grok' }),
        persist
      )
    ).resolves.toBeNull()
    expect(persist).toHaveBeenCalledWith({ enabled: true, agentId: 'claude' })
  })

  it('does not write the automation when the saved choice already matches', async () => {
    saveYunxiaoReviewHandoffPreference({ enabled: false, agentId: 'codex' })
    const persist = vi.fn()

    await restoreYunxiaoReviewHandoffPreference(
      automationWith({ enabled: false, agentId: 'codex' }),
      persist
    )

    expect(persist).not.toHaveBeenCalled()
  })
})
