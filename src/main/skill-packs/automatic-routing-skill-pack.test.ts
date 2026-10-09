import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_SKILL_HOME_DIRECTORIES,
  UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY
} from '../../shared/agent-skill-home-directories'
import { ensureAutomaticRoutingSkillInstalled } from './automatic-routing-skill-pack'

vi.mock('../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ getVersion: () => '1.4.214-test', isPackaged: () => false })
}))
const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('automatic routing discovery skill installation', () => {
  it('installs the version-matched skill for every known agent root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-auto-routing-pack-'))
    directories.push(root)
    const home = join(root, 'home')
    await ensureAutomaticRoutingSkillInstalled(home, join(root, 'state'))
    for (const parts of [
      UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY,
      ...Object.values(AGENT_SKILL_HOME_DIRECTORIES)
    ]) {
      if (!parts) {
        continue
      }
      const skill = await readFile(join(home, ...parts, 'orca-auto-routing', 'SKILL.md'), 'utf8')
      expect(skill).toContain('ORCA skills get orca-auto-routing')
      expect(skill).toContain('ORCA_AUXILIARY_REQUEST=1')
    }
  })
  it('preserves a user-edited skill during a later startup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-auto-routing-edited-'))
    directories.push(root)
    const home = join(root, 'home')
    const state = join(root, 'state')
    await ensureAutomaticRoutingSkillInstalled(home, state)
    const file = join(
      home,
      ...UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY,
      'orca-auto-routing',
      'SKILL.md'
    )
    const modified = `${await readFile(file, 'utf8')}\nUser-specific routing rules.\n`
    await writeFile(file, modified)
    await ensureAutomaticRoutingSkillInstalled(home, state)
    expect(await readFile(file, 'utf8')).toBe(modified)
  })
})
