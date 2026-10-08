import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { verifyDfhisMacArchive } from './dfhis-mac-archive.mjs'

const directories = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

async function fixture(patch = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'orca-mac-release-'))
  directories.push(directory)
  const archive = join(directory, 'orca.zip')
  const evidence = join(directory, 'evidence.json')
  const bytes = Buffer.from('verified archive')
  await writeFile(archive, bytes)
  await writeFile(
    evidence,
    JSON.stringify({
      schemaVersion: 1,
      platform: 'darwin-arm64',
      version: '1.4.214-rc.0',
      commit: 'abc',
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      entitlementsVerified: true,
      runtimeVerified: true,
      ...patch
    })
  )
  return { archive, evidence }
}

it('accepts the exact version and commit verified on macOS', async () => {
  const { archive, evidence } = await fixture()
  await expect(
    verifyDfhisMacArchive(archive, evidence, '1.4.214-rc.0', 'abc')
  ).resolves.toMatchObject({ runtimeVerified: true })
})

it.each([
  { version: '1.4.164-dfhis.91' },
  { commit: 'other' },
  { size: 0 },
  { sha256: 'other' },
  { entitlementsVerified: false },
  { runtimeVerified: false },
  { platform: 'darwin-x64' }
])('refuses mismatched or unverified evidence %j', async (patch) => {
  const { archive, evidence } = await fixture(patch)
  await expect(verifyDfhisMacArchive(archive, evidence, '1.4.214-rc.0', 'abc')).rejects.toThrow(
    'macOS archive'
  )
})

it('refuses an archive changed after macOS validation', async () => {
  const { archive, evidence } = await fixture()
  await writeFile(archive, 'tampered archive')
  await expect(verifyDfhisMacArchive(archive, evidence, '1.4.214-rc.0', 'abc')).rejects.toThrow(
    'macOS archive'
  )
})
