import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  appendMemoryPointerToInstructionFiles,
  ensureAgentMemoryFile,
  getAgentMemoryFilePath,
  memoryPointerLine
} from './memory-store'

const temporaryDirectories: string[] = []

async function createHomeDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-skill-review-home-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe('ensureAgentMemoryFile', () => {
  it('creates the memory file with a header on first run', async () => {
    const home = await createHomeDirectory()
    const memoryPath = await ensureAgentMemoryFile(home)

    expect(memoryPath).toBe(getAgentMemoryFilePath(home))
    const content = await readFile(memoryPath, 'utf8')
    expect(content).toContain('Orca')
    expect(content).toContain('# 用户偏好与长期记忆')
  })

  it('does not overwrite an existing memory file', async () => {
    const home = await createHomeDirectory()
    const memoryPath = await ensureAgentMemoryFile(home)
    await writeFile(memoryPath, 'user content', 'utf8')

    await ensureAgentMemoryFile(home)
    expect(await readFile(memoryPath, 'utf8')).toBe('user content')
  })
})

describe('appendMemoryPointerToInstructionFiles', () => {
  it('appends the pointer to existing instruction files only', async () => {
    const home = await createHomeDirectory()
    const claudePath = path.join(home, '.claude', 'CLAUDE.md')
    await mkdir(path.dirname(claudePath), { recursive: true })
    await writeFile(claudePath, '# my rules', 'utf8')

    const touched = await appendMemoryPointerToInstructionFiles(home)

    expect(touched).toEqual([claudePath])
    const content = await readFile(claudePath, 'utf8')
    expect(content).toContain(memoryPointerLine(home))
    // codex/gemini files must not be created
    await expect(readFile(path.join(home, '.codex', 'AGENTS.md'), 'utf8')).rejects.toThrow()
  })

  it('is idempotent on repeat runs', async () => {
    const home = await createHomeDirectory()
    const claudePath = path.join(home, '.claude', 'CLAUDE.md')
    await mkdir(path.dirname(claudePath), { recursive: true })
    await writeFile(claudePath, '# my rules\n', 'utf8')

    await appendMemoryPointerToInstructionFiles(home)
    const second = await appendMemoryPointerToInstructionFiles(home)

    expect(second).toEqual([])
    const content = await readFile(claudePath, 'utf8')
    expect(content.split(memoryPointerLine(home))).toHaveLength(2)
  })
})
