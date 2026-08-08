import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/orca-skill-review-curator-test' }
}))

import { runSkillReviewCuratorOnce } from './review-curator'
import { readSkillReviewState, writeSkillReviewState } from './review-state'
import type { SpawnReviewProcess } from './review-runner'

const temporaryDirectories: string[] = []

async function useIsolatedUserData(): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-skill-review-curator-'))
  temporaryDirectories.push(directory)
  process.env.ORCA_USER_DATA_PATH = directory
}

afterEach(async () => {
  delete process.env.ORCA_USER_DATA_PATH
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

function makeDeps(spawn: SpawnReviewProcess, overrides: Record<string, unknown> = {}) {
  return {
    homeDirectory: '/tmp/orca-curator-home',
    stateDirectory: '/tmp/orca-curator-state',
    spawnProcess: spawn,
    binaryExists: () => true,
    ...overrides
  }
}

describe('skill review curator', () => {
  it('does nothing when disabled', async () => {
    await useIsolatedUserData()
    const spawn = vi.fn()

    await runSkillReviewCuratorOnce(
      makeDeps(spawn as unknown as SpawnReviewProcess, { isEnabled: () => false })
    )
    expect(spawn).not.toHaveBeenCalled()
  })

  it('skips when the last curator run is still fresh', async () => {
    await useIsolatedUserData()
    await writeSkillReviewState({
      lastReviewAtByTarget: {},
      lastCuratorRunAt: new Date().toISOString()
    })
    const spawn = vi.fn()

    await runSkillReviewCuratorOnce(makeDeps(spawn as unknown as SpawnReviewProcess))
    expect(spawn).not.toHaveBeenCalled()
  })

  it('warns and skips when no supported agent binary exists', async () => {
    await useIsolatedUserData()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const spawn = vi.fn()

    await runSkillReviewCuratorOnce(
      makeDeps(spawn as unknown as SpawnReviewProcess, { binaryExists: () => false })
    )

    expect(spawn).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('runs the curator prompt and records the run timestamp', async () => {
    await useIsolatedUserData()
    const capture: { prompt?: string } = {}
    const spawn: SpawnReviewProcess = async (_spec, prompt) => {
      capture.prompt = prompt
      return { exitCode: 0, timedOut: false, outputTail: 'done' }
    }

    await runSkillReviewCuratorOnce(makeDeps(spawn))

    expect(capture.prompt).toContain('绝不删除任何文件')
    expect(capture.prompt).toContain('.agents')
    const state = await readSkillReviewState()
    expect(state.lastCuratorRunAt).not.toBeNull()
  })

  it('does not record a timestamp when the run fails', async () => {
    await useIsolatedUserData()
    const failingSpawn: SpawnReviewProcess = async () => ({
      exitCode: 1,
      timedOut: false,
      outputTail: 'boom'
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await runSkillReviewCuratorOnce(makeDeps(failingSpawn))

    expect((await readSkillReviewState()).lastCuratorRunAt).toBeNull()
    vi.restoreAllMocks()
  })
})
