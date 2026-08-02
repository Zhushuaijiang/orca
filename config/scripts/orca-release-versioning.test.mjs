import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareNextReleaseVersion, versionGreaterThan } from './orca-release-versioning.mjs'

async function withRepo(version, mappingVersions, run) {
  const repoRoot = await mkdtemp(join(tmpdir(), 'orca-release-versioning-'))
  try {
    await writeFile(join(repoRoot, 'package.json'), `${JSON.stringify({ version })}\n`)
    await mkdir(join(repoRoot, 'resources', 'skills'), { recursive: true })
    await writeFile(
      join(repoRoot, 'resources', 'skills', 'release-mapping.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        releases: mappingVersions.map((appVersion) => ({
          appVersion,
          skills: { 'orca-cli': 35 }
        }))
      })}\n`
    )
    return await run(repoRoot)
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
  }
}

describe('orca-release-versioning', () => {
  it('compares tagged prerelease versions numerically within the same tag', () => {
    expect(versionGreaterThan('1.4.164-dfhis.12', '1.4.164-dfhis.11')).toBe(true)
    expect(versionGreaterThan('1.4.164-dfhis.11', '1.4.164-dfhis.12')).toBe(false)
    expect(versionGreaterThan('1.4.164-rc.2', '1.4.164-rc.10')).toBe(false)
    expect(versionGreaterThan('1.4.164-rc.10', '1.4.164-rc.2')).toBe(true)
    expect(versionGreaterThan('1.4.164', '1.4.164-rc.10')).toBe(true)
    expect(versionGreaterThan('1.4.165-dfhis.1', '1.4.164-dfhis.99')).toBe(true)
  })

  it('bumps dfhis-tagged versions instead of failing or falling back to rc', async () => {
    await withRepo(
      '1.4.164-dfhis.12',
      ['1.4.164-dfhis.11', '1.4.164-dfhis.12'],
      async (repoRoot) => {
        const result = await prepareNextReleaseVersion(repoRoot, '1.4.164-dfhis.12', {
          force: true
        })
        expect(result.nextVersion).toBe('1.4.164-dfhis.13')
        expect(result.changed).toBe(true)
      }
    )
  })

  it('keeps rc tagging for rc-versioned packages', async () => {
    await withRepo('1.4.164-rc.3', ['1.4.164-rc.3'], async (repoRoot) => {
      const result = await prepareNextReleaseVersion(repoRoot, '1.4.164-rc.3', { force: true })
      expect(result.nextVersion).toBe('1.4.164-rc.4')
      expect(result.changed).toBe(true)
    })
  })

  it('treats a newer current version as already prepared without force', async () => {
    await withRepo('1.4.164-dfhis.12', ['1.4.164-dfhis.12'], async (repoRoot) => {
      const result = await prepareNextReleaseVersion(repoRoot, '1.4.164-dfhis.11')
      expect(result.changed).toBe(false)
      expect(result.nextVersion).toBe('1.4.164-dfhis.12')
    })
  })
})
