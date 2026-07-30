import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { resolveReleaseFeedConfig } from './updater-release-feed-config'

function writePackageJson(contents: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'orca-release-feed-'))
  const path = join(dir, 'package.json')
  writeFileSync(path, JSON.stringify(contents), 'utf8')
  return path
}

describe('resolveReleaseFeedConfig', () => {
  it('defaults to the public GitHub release feed', () => {
    expect(resolveReleaseFeedConfig(undefined, {})).toEqual({
      mode: 'github',
      atomUrl: 'https://github.com/stablyai/orca/releases.atom',
      downloadBaseUrl: 'https://github.com/stablyai/orca/releases/download',
      latestDownloadUrl: 'https://github.com/stablyai/orca/releases/latest/download'
    })
  })

  it('disables release checks from packaged metadata', () => {
    const packageJsonPath = writePackageJson({
      orca: { releaseFeed: { mode: 'disabled' } }
    })

    expect(resolveReleaseFeedConfig(packageJsonPath, {})).toEqual({ mode: 'disabled' })
  })

  it('lets environment variables override packaged feed metadata', () => {
    const packageJsonPath = writePackageJson({
      orca: { releaseFeed: { mode: 'disabled' } }
    })

    expect(
      resolveReleaseFeedConfig(packageJsonPath, {
        ORCA_RELEASE_FEED_MODE: 'github',
        ORCA_RELEASE_ATOM_URL: 'https://updates.example.test/releases.atom',
        ORCA_RELEASE_DOWNLOAD_BASE_URL: 'https://updates.example.test/releases/download',
        ORCA_RELEASE_LATEST_DOWNLOAD_URL: 'https://updates.example.test/releases/latest/download'
      })
    ).toEqual({
      mode: 'github',
      atomUrl: 'https://updates.example.test/releases.atom',
      downloadBaseUrl: 'https://updates.example.test/releases/download',
      latestDownloadUrl: 'https://updates.example.test/releases/latest/download'
    })
  })
})
