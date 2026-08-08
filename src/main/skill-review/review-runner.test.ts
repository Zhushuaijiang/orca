import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/orca-skill-review-runner-test' }
}))

import { runSkillReview, type SpawnReviewProcess } from './review-runner'
import type { SkillReviewRequest } from './review-queue'

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

async function createGitWorktree(): Promise<string> {
  const directory = await createTempDirectory('orca-review-runner-git-')
  await execFileAsync('git', ['init'], { cwd: directory })
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: directory })
  await execFileAsync('git', ['config', 'user.name', 'test'], { cwd: directory })
  await writeFile(path.join(directory, 'code.ts'), 'clean\n', 'utf8')
  await execFileAsync('git', ['add', '.'], { cwd: directory })
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: directory })
  return directory
}

afterEach(async () => {
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

function okSpawn(capture: { prompt?: string }): SpawnReviewProcess {
  return async (_spec, prompt) => {
    capture.prompt = prompt
    return { exitCode: 0, timedOut: false, outputTail: '无沉淀' }
  }
}

describe('runSkillReview', () => {
  it('skips when the worktree no longer exists', async () => {
    const spawn = vi.fn()
    await runSkillReview(makeRequest(), {
      resolveWorktreePath: () => null,
      spawnProcess: spawn as unknown as SpawnReviewProcess
    })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('skips sessions with a tiny transcript', async () => {
    const worktree = await createGitWorktree()
    const transcript = path.join(worktree, 't.jsonl')
    await writeFile(transcript, '{}', 'utf8')
    const spawn = vi.fn()

    await runSkillReview(makeRequest({ transcriptPath: transcript }), {
      resolveWorktreePath: () => worktree,
      spawnProcess: spawn as unknown as SpawnReviewProcess,
      homeDirectory: await createTempDirectory('orca-review-runner-home-'),
      stateDirectory: await createTempDirectory('orca-review-runner-state-')
    })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('runs the review with the transcript path in the prompt', async () => {
    const worktree = await createGitWorktree()
    const transcript = path.join(worktree, 't.jsonl')
    await writeFile(transcript, 'x'.repeat(4096), 'utf8')
    const home = await createTempDirectory('orca-review-runner-home-')
    const capture: { prompt?: string } = {}

    await runSkillReview(makeRequest({ transcriptPath: transcript }), {
      resolveWorktreePath: () => worktree,
      spawnProcess: okSpawn(capture),
      homeDirectory: home,
      stateDirectory: await createTempDirectory('orca-review-runner-state-')
    })

    expect(capture.prompt).toContain(transcript)
    expect(capture.prompt).toContain('.agents')
    // memory 层已幂等建立
    expect(existsSync(path.join(home, '.agents', 'memory', 'MEMORY.md'))).toBe(true)
  })

  it('reverts unauthorized worktree writes made by the review agent', async () => {
    const worktree = await createGitWorktree()
    const tamperingSpawn: SpawnReviewProcess = async (_spec, _prompt, cwd) => {
      await writeFile(path.join(cwd, 'code.ts'), 'tampered\n', 'utf8')
      await writeFile(path.join(cwd, 'agent-note.ts'), 'oops\n', 'utf8')
      return { exitCode: 0, timedOut: false, outputTail: 'done' }
    }

    await runSkillReview(makeRequest(), {
      resolveWorktreePath: () => worktree,
      spawnProcess: tamperingSpawn,
      homeDirectory: await createTempDirectory('orca-review-runner-home-'),
      stateDirectory: await createTempDirectory('orca-review-runner-state-')
    })

    expect(await readFile(path.join(worktree, 'code.ts'), 'utf8')).toBe('clean\n')
    expect(existsSync(path.join(worktree, 'agent-note.ts'))).toBe(false)
  })

  it('skips agents without a headless spec and only warns', async () => {
    const worktree = await createGitWorktree()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const spawn = vi.fn()

    await runSkillReview(makeRequest({ agent: 'gemini' }), {
      resolveWorktreePath: () => worktree,
      spawnProcess: spawn as unknown as SpawnReviewProcess,
      homeDirectory: await createTempDirectory('orca-review-runner-home-'),
      stateDirectory: await createTempDirectory('orca-review-runner-state-')
    })

    expect(spawn).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
