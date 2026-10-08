import { expect, it } from 'vitest'
import { preserveMacDownload } from './dfhis-windows-only-release.mjs'
import { parseArgs } from './publish-orca-desktop-release.mjs'

const mac = {
  filename: 'orca-macos-arm64.zip',
  download_name: 'orca-macos-arm64-old.zip',
  path: 'releases/old/orca-macos-arm64.zip',
  size: 123,
  sha256: 'a'.repeat(64)
}

it('preserves the previous macOS artifact and its actual version', () => {
  expect(preserveMacDownload({ version: 'old', downloads: { macos: mac } })).toEqual({
    ...mac,
    version: 'old'
  })
  expect(
    preserveMacDownload({
      version: 'new-windows',
      downloads: { macos: { ...mac, version: 'old' } }
    })
  ).toEqual({ ...mac, version: 'old' })
})

it.each([undefined, {}, { path: '../other' }, { sha256: 'invalid' }, { size: 0 }])(
  'rejects missing or invalid existing macOS metadata %j',
  (patch) => {
    const downloads = patch === undefined ? {} : { macos: { ...mac, ...patch } }
    const version = patch && Object.keys(patch).length === 0 ? undefined : 'old'
    expect(() => preserveMacDownload({ version, downloads })).toThrow('existing valid macOS')
  }
)

it('Windows-only publishing never requests a macOS build or skill-pack update', () => {
  expect(parseArgs(['--windows-only'])).toMatchObject({
    windowsOnly: true,
    buildMac: false,
    publishSkillPack: false
  })
  expect(() => parseArgs(['--windows-only', '--mac-archive', 'mac.zip'])).toThrow(
    'cannot be combined'
  )
})
