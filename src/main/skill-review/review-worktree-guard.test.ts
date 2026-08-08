import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import {
  restoreUnauthorizedWorktreeChanges,
  snapshotWorktreeChanges
} from './review-worktree-guard'

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []

async function createGitWorktree(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-skill-review-git-'))
  temporaryDirectories.push(directory)
  await execFileAsync('git', ['init'], { cwd: directory })
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: directory })
  await execFileAsync('git', ['config', 'user.name', 'test'], { cwd: directory })
  await writeFile(path.join(directory, 'clean.ts'), 'clean\n', 'utf8')
  await writeFile(path.join(directory, 'dirty.ts'), 'original\n', 'utf8')
  await execFileAsync('git', ['add', '.'], { cwd: directory })
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: directory })
  // Why: 评审前就脏的文件——还原时绝不能动它。
  await writeFile(path.join(directory, 'dirty.ts'), 'user work in progress\n', 'utf8')
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe('worktree change guard', () => {
  it('returns null snapshot for non-git directories', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'orca-skill-review-plain-'))
    temporaryDirectories.push(directory)

    expect(await snapshotWorktreeChanges(directory)).toBeNull()
    const result = await restoreUnauthorizedWorktreeChanges(directory, null)
    expect(result).toEqual({ reverted: [], removed: [] })
  })

  it('reverts newly dirtied tracked files and removes new untracked files', async () => {
    const directory = await createGitWorktree()
    const before = await snapshotWorktreeChanges(directory)

    await writeFile(path.join(directory, 'clean.ts'), 'tampered\n', 'utf8')
    await writeFile(path.join(directory, 'agent-made.ts'), 'unauthorized\n', 'utf8')

    const result = await restoreUnauthorizedWorktreeChanges(directory, before)

    expect(result.reverted).toEqual(['clean.ts'])
    expect(result.removed).toEqual(['agent-made.ts'])
    expect(await readFile(path.join(directory, 'clean.ts'), 'utf8')).toBe('clean\n')
    expect(existsSync(path.join(directory, 'agent-made.ts'))).toBe(false)
    // 评审前已脏的文件保持用户原样
    expect(await readFile(path.join(directory, 'dirty.ts'), 'utf8')).toBe('user work in progress\n')
  })

  it('is a no-op when nothing changed', async () => {
    const directory = await createGitWorktree()
    const before = await snapshotWorktreeChanges(directory)

    const result = await restoreUnauthorizedWorktreeChanges(directory, before)
    expect(result).toEqual({ reverted: [], removed: [] })
    expect(await readFile(path.join(directory, 'clean.ts'), 'utf8')).toBe('clean\n')
  })
})
