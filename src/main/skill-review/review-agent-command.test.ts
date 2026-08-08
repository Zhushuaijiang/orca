import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildReviewAgentSpawnSpec,
  buildReviewEnvironment,
  computeSkillReviewWriteRoots
} from './review-agent-command'

const temporaryDirectories: string[] = []

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe('computeSkillReviewWriteRoots', () => {
  it('always includes the universal skills dir and memory file', () => {
    const roots = computeSkillReviewWriteRoots('/home/u', 'kimi')

    expect(roots.directories).toContain(path.join('/home/u', '.agents', 'skills'))
    expect(roots.directories).toContain(path.join('/home/u', '.agents', 'memory'))
    expect(roots.files).toEqual([path.join('/home/u', '.agents', 'memory', 'MEMORY.md')])
  })

  it('adds the agent-dedicated skills dir when one is verified', () => {
    const roots = computeSkillReviewWriteRoots('/home/u', 'claude')

    expect(roots.directories).toContain(path.join('/home/u', '.claude', 'skills'))
  })
})

describe('buildReviewEnvironment', () => {
  it('strips ORCA_* variables so review sessions never post hooks to Orca', () => {
    vi.stubEnv('ORCA_AGENT_HOOK_PORT', '1234')
    vi.stubEnv('PATH', '/usr/bin')

    const env = buildReviewEnvironment({ EXTRA: '1' })

    expect(env.ORCA_AGENT_HOOK_PORT).toBeUndefined()
    expect(env.PATH).toBe('/usr/bin')
    expect(env.EXTRA).toBe('1')
  })
})

describe('buildReviewAgentSpawnSpec', () => {
  it('builds a restricted claude spec with scoped edit rules', async () => {
    const home = await createTempDirectory('orca-review-home-')
    const state = await createTempDirectory('orca-review-state-')

    const spec = await buildReviewAgentSpawnSpec({
      agent: 'claude',
      homeDirectory: home,
      stateDirectory: state
    })

    expect(spec).not.toBeNull()
    expect(spec!.command).toBe('claude')
    const args = spec!.args.join(' ')
    expect(args).toContain('--permission-mode default')
    expect(args).toContain(`Edit(//${home.replace(/^\//, '')}/.agents/skills/**)`)
    expect(args).toContain('--add-dir')
    expect(args).not.toContain('Bash')
  })

  it('prepares an isolated kimi staging home with the write-guard hook', async () => {
    const home = await createTempDirectory('orca-review-home-')
    const state = await createTempDirectory('orca-review-state-')
    const realKimiHome = path.join(home, '.kimi-code')
    await mkdir(realKimiHome, { recursive: true })
    await writeFile(
      path.join(realKimiHome, 'config.toml'),
      'model = "k2"\n\n# >>> orca-managed-kimi-hooks (managed by Orca; do not edit) >>>\n[[hooks]]\nevent = "Stop"\ncommand = "/old/kimi-hook.sh"\n# <<< orca-managed-kimi-hooks <<<\n',
      'utf8'
    )
    vi.stubEnv('KIMI_CODE_HOME', realKimiHome)

    const spec = await buildReviewAgentSpawnSpec({
      agent: 'kimi',
      homeDirectory: home,
      stateDirectory: state
    })

    expect(spec).not.toBeNull()
    expect(spec!.args).toEqual(['--print', '--quiet'])
    const stagingHome = spec!.env.KIMI_CODE_HOME!
    expect(stagingHome).toBe(path.join(state, 'kimi-home'))
    expect(existsSync(path.join(stagingHome, 'skill-review-write-guard.mjs'))).toBe(true)
    expect(existsSync(path.join(stagingHome, 'skill-review-roots.json'))).toBe(true)
    const config = await readFile(path.join(stagingHome, 'config.toml'), 'utf8')
    // 用户配置保留，Orca managed 块被替换成写保护 hook
    expect(config).toContain('model = "k2"')
    expect(config).not.toContain('/old/kimi-hook.sh')
    expect(config).toContain('event = "PreToolUse"')
    expect(config).toContain('skill-review-write-guard.mjs')
  })

  it('returns null for agents without a headless spec', async () => {
    const home = await createTempDirectory('orca-review-home-')
    const state = await createTempDirectory('orca-review-state-')

    expect(
      await buildReviewAgentSpawnSpec({
        agent: 'gemini',
        homeDirectory: home,
        stateDirectory: state
      })
    ).toBeNull()
  })
})
