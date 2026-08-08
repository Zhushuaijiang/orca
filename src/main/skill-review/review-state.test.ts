import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/orca-skill-review-state-test'
  }
}))

import { emptySkillReviewState, readSkillReviewState, writeSkillReviewState } from './review-state'

const temporaryDirectories: string[] = []

async function createStateDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-skill-review-state-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe('skill review state persistence', () => {
  it('returns empty state when the file is missing', async () => {
    const directory = await createStateDirectory()
    const state = await readSkillReviewState(path.join(directory, 'skill-review-state.json'))

    expect(state).toEqual(emptySkillReviewState())
  })

  it('round-trips state through an atomic write', async () => {
    const directory = await createStateDirectory()
    const statePath = path.join(directory, 'skill-review-state.json')
    const state = {
      lastReviewAtByTarget: { 'wt-1:claude': '2026-08-08T00:00:00.000Z' },
      lastCuratorRunAt: '2026-08-07T00:00:00.000Z'
    }
    await writeSkillReviewState(state, statePath)

    expect(await readSkillReviewState(statePath)).toEqual(state)
  })

  it('drops non-string target entries and invalid shapes', async () => {
    const directory = await createStateDirectory()
    const statePath = path.join(directory, 'skill-review-state.json')
    await writeFile(
      statePath,
      JSON.stringify({ lastReviewAtByTarget: { good: 'x', bad: 2 }, lastCuratorRunAt: 7 }),
      'utf8'
    )

    const state = await readSkillReviewState(statePath)
    expect(state.lastReviewAtByTarget).toEqual({ good: 'x' })
    expect(state.lastCuratorRunAt).toBeNull()
  })
})
