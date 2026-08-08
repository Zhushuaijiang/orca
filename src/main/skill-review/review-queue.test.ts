import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () =>
      process.env.ORCA_SKILL_REVIEW_TEST_USER_DATA ?? '/tmp/orca-skill-review-queue-test'
  }
}))

import {
  createSkillReviewQueue,
  skillReviewTargetKey,
  type SkillReviewRequest
} from './review-queue'

const temporaryDirectories: string[] = []

async function useIsolatedUserData(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-skill-review-queue-'))
  temporaryDirectories.push(directory)
  process.env.ORCA_USER_DATA_PATH = directory
  return directory
}

afterEach(async () => {
  delete process.env.ORCA_USER_DATA_PATH
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

function makeRequest(overrides: Partial<SkillReviewRequest> = {}): SkillReviewRequest {
  return {
    worktreeId: 'wt-1',
    agent: 'claude',
    paneKey: 'pane-1',
    receivedAt: Date.now(),
    ...overrides
  }
}

describe('skill review queue', () => {
  it('runs requests serially in order', async () => {
    await useIsolatedUserData()
    const order: string[] = []
    let inFlight = 0
    const queue = createSkillReviewQueue({
      run: async (request) => {
        inFlight += 1
        expect(inFlight).toBe(1)
        await new Promise((resolve) => setTimeout(resolve, 5))
        order.push(request.worktreeId)
        inFlight -= 1
      },
      throttleMs: 0
    })

    queue.enqueue(makeRequest({ worktreeId: 'wt-1' }))
    queue.enqueue(makeRequest({ worktreeId: 'wt-2' }))
    await queue.idle()

    expect(order).toEqual(['wt-1', 'wt-2'])
  })

  it('throttles repeat reviews for the same worktree+agent within the window', async () => {
    await useIsolatedUserData()
    const runs: string[] = []
    const queue = createSkillReviewQueue({
      run: async (request) => {
        runs.push(skillReviewTargetKey(request))
      },
      throttleMs: 30 * 60_000
    })

    queue.enqueue(makeRequest())
    await queue.idle()
    queue.enqueue(makeRequest())
    await queue.idle()
    queue.enqueue(makeRequest({ agent: 'codex' }))
    await queue.idle()

    expect(runs).toEqual(['wt-1:claude', 'wt-1:codex'])
  })

  it('drops sessions younger than the minimum age', async () => {
    await useIsolatedUserData()
    const runs: string[] = []
    const queue = createSkillReviewQueue({
      run: async (request) => {
        runs.push(request.worktreeId)
      },
      throttleMs: 0,
      minSessionMs: 2 * 60_000
    })

    queue.enqueue(makeRequest({ sessionStartedAt: Date.now() - 30_000 }))
    queue.enqueue(makeRequest({ worktreeId: 'wt-2', sessionStartedAt: Date.now() - 10 * 60_000 }))
    queue.enqueue(makeRequest({ worktreeId: 'wt-3' }))
    await queue.idle()

    expect(runs).toEqual(['wt-2', 'wt-3'])
  })

  it('keeps only the latest pending request per target while one is running', async () => {
    await useIsolatedUserData()
    const runs: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const queue = createSkillReviewQueue({
      run: async (request) => {
        if (request.paneKey === 'slow') {
          await gate
        }
        runs.push(request.paneKey)
      },
      throttleMs: 0
    })

    queue.enqueue(makeRequest({ paneKey: 'slow' }))
    await new Promise((resolve) => setImmediate(resolve))
    queue.enqueue(makeRequest({ paneKey: 'first' }))
    queue.enqueue(makeRequest({ paneKey: 'second' }))
    release()
    await queue.idle()

    expect(runs).toEqual(['slow', 'second'])
  })

  it('warns and continues when a run throws', async () => {
    await useIsolatedUserData()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const runs: string[] = []
    const queue = createSkillReviewQueue({
      run: async (request) => {
        if (request.worktreeId === 'wt-bad') {
          throw new Error('boom')
        }
        runs.push(request.worktreeId)
      },
      throttleMs: 0
    })

    queue.enqueue(makeRequest({ worktreeId: 'wt-bad' }))
    queue.enqueue(makeRequest({ worktreeId: 'wt-good' }))
    await queue.idle()

    expect(runs).toEqual(['wt-good'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
