import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectDir = resolve(import.meta.dirname, '../..')

describe('DFHIS auto-release wiring', () => {
  it('post-commit hook launches the pipeline detached and never blocks the commit', () => {
    const hook = readFileSync(join(projectDir, '.husky/post-commit'), 'utf8')
    expect(hook).toContain('dfhis-auto-release.mjs')
    expect(hook).toContain('--from-hook')
    expect(hook).toContain('nohup')
    expect(hook).toContain('ORCA_AUTO_RELEASE_DISABLED')
    expect(hook.trimEnd().endsWith('exit 0')).toBe(true)
  })

  it('pipeline guards against self-triggering on its own version-bump commits', () => {
    const source = readFileSync(join(projectDir, 'config/scripts/dfhis-auto-release.mjs'), 'utf8')
    expect(source).toContain('RELEASE_COMMIT_PATTERN')
    expect(source).toContain('prepareNextReleaseVersion')
    expect(source).toContain('commitAndPushReleaseVersion')
    expect(source).toContain('win-update-survival-e2e.yml')
    expect(source).toContain('publish-orca-desktop-release.mjs')
    expect(source).toContain('ORCA_RELEASE_SSH_PASSWORD')
  })

  it('local credentials file stays out of git', () => {
    const gitignore = readFileSync(join(projectDir, '.gitignore'), 'utf8')
    expect(gitignore).toContain('.dfhis-auto-release.env')
  })

  it('publisher UI exposes the one-click pipeline endpoint and status panel', () => {
    const server = readFileSync(
      join(projectDir, 'config/scripts/orca-release-publisher.mjs'),
      'utf8'
    )
    const page = readFileSync(
      join(projectDir, 'config/scripts/orca-release-publisher-page.mjs'),
      'utf8'
    )
    expect(server).toContain("'/api/release-all'")
    expect(server).toContain('readAutoRelease')
    expect(page).toContain('releaseAll')
    expect(page).toContain('自动发布流水线')
  })
})
