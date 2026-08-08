import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SKILL_REVIEW_WRITE_GUARD_SCRIPT } from './write-guard-script'

let root: string
let guardPath: string
let rootsPath: string
const worktreeCwd = () => path.join(root, 'repo')

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'orca-write-guard-'))
  await mkdir(path.join(root, 'home', '.agents', 'skills'), { recursive: true })
  await mkdir(path.join(root, 'home', '.agents', 'memory'), { recursive: true })
  await mkdir(worktreeCwd(), { recursive: true })
  await writeFile(path.join(root, 'home', '.agents', 'memory', 'MEMORY.md'), '', 'utf8')
  guardPath = path.join(root, 'guard.mjs')
  rootsPath = path.join(root, 'roots.json')
  await writeFile(guardPath, SKILL_REVIEW_WRITE_GUARD_SCRIPT, 'utf8')
  await writeFile(
    rootsPath,
    JSON.stringify({
      directories: [path.join(root, 'home', '.agents', 'skills')],
      files: [path.join(root, 'home', '.agents', 'memory', 'MEMORY.md')]
    }),
    'utf8'
  )
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

async function runGuard(payload: object): Promise<{ code: number }> {
  return new Promise((resolve) => {
    const child = execFile('node', [guardPath, '--roots-file', rootsPath], (err) => {
      resolve({ code: err ? ((err as { code?: number }).code ?? -1) : 0 })
    })
    child.stdin?.end(JSON.stringify(payload))
  })
}

describe('write-guard script', () => {
  it('allows writes inside the skills directory and to MEMORY.md', async () => {
    expect(
      (
        await runGuard({
          tool_name: 'Write',
          tool_input: { file_path: path.join(root, 'home', '.agents', 'skills', 'x', 'SKILL.md') },
          cwd: worktreeCwd()
        })
      ).code
    ).toBe(0)
    expect(
      (
        await runGuard({
          tool_name: 'Edit',
          tool_input: { file_path: path.join(root, 'home', '.agents', 'memory', 'MEMORY.md') },
          cwd: worktreeCwd()
        })
      ).code
    ).toBe(0)
  })

  it('denies writes outside the roots, relative escapes, and Bash', async () => {
    const cases = [
      {
        tool_name: 'Write',
        tool_input: { file_path: path.join(worktreeCwd(), 'src.ts') },
        cwd: worktreeCwd()
      },
      { tool_name: 'Write', tool_input: { file_path: 'src/evil.ts' }, cwd: worktreeCwd() },
      {
        tool_name: 'Write',
        tool_input: { file_path: path.join(root, 'home', '.agents', 'skills', '..', '..', 'x') },
        cwd: worktreeCwd()
      },
      { tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: worktreeCwd() }
    ]
    for (const payload of cases) {
      expect((await runGuard(payload)).code).toBe(2)
    }
  })

  it('denies sibling-prefix paths and symlinked parents escaping the root', async () => {
    expect(
      (
        await runGuard({
          tool_name: 'Write',
          tool_input: { file_path: path.join(root, 'home', '.agents', 'skills-evil', 'x') },
          cwd: worktreeCwd()
        })
      ).code
    ).toBe(2)

    await symlink(worktreeCwd(), path.join(root, 'home', '.agents', 'skills', 'spoof'))
    expect(
      (
        await runGuard({
          tool_name: 'Write',
          tool_input: {
            file_path: path.join(root, 'home', '.agents', 'skills', 'spoof', 'pwned.ts')
          },
          cwd: worktreeCwd()
        })
      ).code
    ).toBe(2)
  })

  it('allows read-only tools and fails open on malformed payloads', async () => {
    expect(
      (
        await runGuard({
          tool_name: 'Read',
          tool_input: { file_path: '/etc/hosts' },
          cwd: worktreeCwd()
        })
      ).code
    ).toBe(0)
  })
})
