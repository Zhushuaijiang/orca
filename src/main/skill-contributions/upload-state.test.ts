import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/orca-skill-contrib-state-test'
  }
}))

import {
  aggregateSkillFilesSha256,
  readSkillContributionState,
  writeSkillContributionState
} from './upload-state'

const temporaryDirectories: string[] = []

async function createStateDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-skill-contrib-state-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe('aggregateSkillFilesSha256', () => {
  it('is independent of file order', () => {
    const first = aggregateSkillFilesSha256([
      { path: 'b.md', sha256: '2'.repeat(64) },
      { path: 'a.md', sha256: '1'.repeat(64) }
    ])
    const second = aggregateSkillFilesSha256([
      { path: 'a.md', sha256: '1'.repeat(64) },
      { path: 'b.md', sha256: '2'.repeat(64) }
    ])

    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when any file hash changes', () => {
    const base = aggregateSkillFilesSha256([{ path: 'a.md', sha256: '1'.repeat(64) }])
    const changed = aggregateSkillFilesSha256([{ path: 'a.md', sha256: '3'.repeat(64) }])

    expect(base).not.toBe(changed)
  })
})

describe('skill contribution state persistence', () => {
  it('round-trips state through an atomic write', async () => {
    const directory = await createStateDirectory()
    const statePath = path.join(directory, 'skill-contributions-state.json')
    const state = {
      lastRunAt: '2026-08-07T00:00:00.000Z',
      skills: { 'my-skill': 'a'.repeat(64) }
    }

    await writeSkillContributionState(state, statePath)

    expect(await readSkillContributionState(statePath)).toEqual(state)
  })

  it('returns an empty state for a missing or corrupt file', async () => {
    const directory = await createStateDirectory()
    const missingPath = path.join(directory, 'missing.json')
    expect(await readSkillContributionState(missingPath)).toEqual({ lastRunAt: null, skills: {} })

    const corruptPath = path.join(directory, 'corrupt.json')
    await writeFile(corruptPath, 'not json', 'utf8')
    expect(await readSkillContributionState(corruptPath)).toEqual({ lastRunAt: null, skills: {} })
  })

  it('drops non-string skill hash entries when reading', async () => {
    const directory = await createStateDirectory()
    const statePath = path.join(directory, 'state.json')
    await writeFile(
      statePath,
      JSON.stringify({ lastRunAt: 42, skills: { good: 'abc', bad: 7 } }),
      'utf8'
    )

    expect(await readSkillContributionState(statePath)).toEqual({
      lastRunAt: null,
      skills: { good: 'abc' }
    })
  })
})
