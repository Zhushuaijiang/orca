import { describe, expect, it } from 'vitest'

import { createSkillReviewTrigger, type SkillReviewTriggerEvent } from './review-trigger'
import type { SkillReviewRequest } from './review-queue'

function makePayload(overrides: Partial<SkillReviewTriggerEvent> = {}): SkillReviewTriggerEvent {
  return {
    paneKey: 'pane-1',
    hookEventName: 'Stop',
    worktreeId: 'repo-1::/repo/wt-1',
    source: 'claude',
    connectionId: null,
    ...overrides
  }
}

function createHarness(options: { enabled?: boolean; now?: number } = {}) {
  const enqueued: SkillReviewRequest[] = []
  const trigger = createSkillReviewTrigger({
    enqueue: (request) => enqueued.push(request),
    isEnabled: async () => options.enabled ?? true,
    now: () => options.now ?? 1_000_000
  })
  return { trigger, enqueued }
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

describe('skill review trigger', () => {
  it('enqueues a review on Stop with transcript metadata', async () => {
    const { trigger, enqueued } = createHarness()
    trigger(
      makePayload({
        providerSession: {
          key: 'session_id',
          id: 'session-1',
          transcriptPath: '/t/session-1.jsonl'
        }
      })
    )
    await flushMicrotasks()

    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]).toMatchObject({
      worktreeId: 'repo-1::/repo/wt-1',
      agent: 'claude',
      transcriptPath: '/t/session-1.jsonl',
      providerSessionId: 'session-1',
      sessionStartedAt: 1_000_000
    })
  })

  it('fires on SessionEnd and ignores other events and replays', async () => {
    const { trigger, enqueued } = createHarness()
    trigger(makePayload({ hookEventName: 'PreToolUse' }))
    trigger(makePayload({ hookEventName: 'Stop', isReplay: true }))
    trigger(makePayload({ hookEventName: 'SessionEnd' }))
    await flushMicrotasks()

    expect(enqueued).toHaveLength(1)
  })

  it('skips SSH (connectionId) events — the remote Orca reviews those', async () => {
    const { trigger, enqueued } = createHarness()
    trigger(makePayload({ connectionId: 'ssh-1' }))
    await flushMicrotasks()

    expect(enqueued).toHaveLength(0)
  })

  it('drops events without worktreeId or source', async () => {
    const { trigger, enqueued } = createHarness()
    trigger(makePayload({ worktreeId: undefined }))
    trigger(makePayload({ source: undefined }))
    trigger(makePayload({ paneKey: '' }))
    await flushMicrotasks()

    expect(enqueued).toHaveLength(0)
  })

  it('does nothing when the service is disabled', async () => {
    const { trigger, enqueued } = createHarness({ enabled: false })
    trigger(makePayload())
    await flushMicrotasks()

    expect(enqueued).toHaveLength(0)
  })
})
