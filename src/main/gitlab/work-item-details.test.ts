import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  glabExecFileAsyncMock,
  getGlabKnownHostsMock,
  resolveIssueSourceMock,
  glabRepoExecOptionsMock,
  acquireMock,
  releaseMock
} = vi.hoisted(() => ({
  glabExecFileAsyncMock: vi.fn(),
  getGlabKnownHostsMock: vi.fn(),
  resolveIssueSourceMock: vi.fn(),
  glabRepoExecOptionsMock: vi.fn(
    (
      repoPath: string,
      connectionId?: string | null,
      localGitOptions: { wslDistro?: string } = {}
    ) => (connectionId ? {} : { cwd: repoPath, ...localGitOptions })
  ),
  acquireMock: vi.fn(),
  releaseMock: vi.fn()
}))

vi.mock('./gl-utils', () => ({
  acquire: acquireMock,
  release: releaseMock,
  getGlabKnownHosts: getGlabKnownHostsMock,
  resolveIssueSource: resolveIssueSourceMock,
  glabExecFileAsync: glabExecFileAsyncMock,
  glabHostnameArgs: vi.fn(() => []),
  glabRepoExecOptions: glabRepoExecOptionsMock
}))

import { fetchMRFiles } from './mr-file-diffs'
import { getWorkItemDetails } from './work-item-details'

describe('getWorkItemDetails', () => {
  beforeEach(() => {
    glabExecFileAsyncMock.mockReset()
    getGlabKnownHostsMock.mockReset()
    resolveIssueSourceMock.mockReset()
    glabRepoExecOptionsMock.mockClear()
    acquireMock.mockReset()
    releaseMock.mockReset()
    acquireMock.mockResolvedValue(undefined)
    getGlabKnownHostsMock.mockResolvedValue(['gitlab.com'])
    resolveIssueSourceMock.mockResolvedValue({
      source: { host: 'gitlab.com', path: 'g/p' },
      fellBack: false
    })
  })

  it('caps MR detail discussions, jobs, and file diffs to one API page', async () => {
    glabExecFileAsyncMock.mockImplementation(async (args: string[]) => {
      const endpoint = args.at(-1)
      if (endpoint === 'projects/g%2Fp/merge_requests/12') {
        return {
          stdout: JSON.stringify({
            id: 120,
            iid: 12,
            title: 'Bound detail payloads',
            state: 'opened',
            web_url: 'https://gitlab.com/g/p/-/merge_requests/12',
            updated_at: '2026-05-31T12:00:00Z',
            source_branch: 'feature/bounds',
            target_branch: 'main',
            description: 'MR body',
            sha: 'head-sha',
            diff_refs: { base_sha: 'base-sha', start_sha: 'start-sha' },
            head_pipeline: { id: 99 }
          })
        }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/discussions?per_page=100') {
        return {
          stdout: JSON.stringify([
            {
              id: 'discussion-1',
              notes: [
                {
                  id: 1,
                  body: 'Review note',
                  created_at: '2026-05-31T12:01:00Z',
                  author: { username: 'alice', avatar_url: 'https://example.com/a.png' }
                }
              ]
            }
          ])
        }
      }
      if (endpoint === 'projects/g%2Fp/pipelines/99/jobs?per_page=100') {
        return {
          stdout: JSON.stringify([
            {
              id: 10,
              name: 'verify',
              stage: 'test',
              status: 'success',
              web_url: 'https://gitlab.com/g/p/-/jobs/10',
              duration: 12
            }
          ])
        }
      }
      if (endpoint === 'projects/g%2Fp/pipelines/99/bridges?per_page=100') {
        return { stdout: '[]' }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/reviewers') {
        return { stdout: '[]' }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/approvals') {
        return { stdout: JSON.stringify({ approvals_required: 0, approvals_left: 0 }) }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/approval_state') {
        return { stdout: JSON.stringify({ rules: [] }) }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/diffs?per_page=100') {
        return {
          stdout: JSON.stringify([
            {
              new_path: 'src/app.ts',
              old_path: 'src/app.ts',
              diff: '@@ -1 +1 @@\n-old\n+new'
            }
          ])
        }
      }
      throw new Error(`unexpected glab call: ${args.join(' ')}`)
    })

    const details = await getWorkItemDetails('/repo', 12, 'mr')

    expect(details?.comments).toHaveLength(1)
    expect(details?.pipelineJobs).toHaveLength(1)
    expect(details?.files).toHaveLength(1)
    expect(details?.files?.[0]).toMatchObject({
      path: 'src/app.ts',
      additions: 1,
      deletions: 1
    })
    expect(glabExecFileAsyncMock.mock.calls.map(([args]) => args)).toContainEqual([
      'api',
      'projects/g%2Fp/merge_requests/12/diffs?per_page=100'
    ])
    expect(glabExecFileAsyncMock.mock.calls.flatMap(([args]) => args)).not.toContain('--paginate')
  })

  it('falls back to legacy MR changes when the diffs endpoint is unavailable', async () => {
    glabExecFileAsyncMock.mockImplementation(async (args: string[]) => {
      const endpoint = args.at(-1)
      if (endpoint === 'projects/g%2Fp/merge_requests/12') {
        return {
          stdout: JSON.stringify({
            id: 120,
            iid: 12,
            title: 'Legacy changes',
            state: 'opened',
            web_url: 'https://gitlab.com/g/p/-/merge_requests/12',
            updated_at: '2026-05-31T12:00:00Z',
            description: 'MR body',
            changes_count: '1',
            head_pipeline: null,
            reviewers: []
          })
        }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/discussions?per_page=100') {
        return { stdout: '[]' }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/reviewers') {
        return { stdout: '[]' }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/approvals') {
        return { stdout: JSON.stringify({ approvals_required: 0, approvals_left: 0 }) }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/approval_state') {
        return { stdout: JSON.stringify({ rules: [] }) }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/diffs?per_page=100') {
        throw new Error('404 Not Found')
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/changes') {
        return {
          stdout: JSON.stringify({
            changes: [
              {
                new_path: 'src/legacy.ts',
                old_path: 'src/legacy.ts',
                diff: '@@ -1 +1 @@\n-old\n+new'
              }
            ]
          })
        }
      }
      throw new Error(`unexpected glab call: ${args.join(' ')}`)
    })

    const details = await getWorkItemDetails('/repo', 12, 'mr')

    expect(details?.filesUnavailable).toBeUndefined()
    expect(details?.files).toHaveLength(1)
    expect(details?.files?.[0]?.path).toBe('src/legacy.ts')
    expect(glabExecFileAsyncMock.mock.calls.map(([args]) => args)).toContainEqual([
      'api',
      'projects/g%2Fp/merge_requests/12/changes'
    ])
  })

  it('marks MR files unavailable when both diff endpoints fail', async () => {
    glabExecFileAsyncMock.mockImplementation(async (args: string[]) => {
      const endpoint = args.at(-1)
      if (endpoint === 'projects/g%2Fp/merge_requests/12') {
        return {
          stdout: JSON.stringify({
            id: 120,
            iid: 12,
            title: 'Unavailable changes',
            state: 'opened',
            web_url: 'https://gitlab.com/g/p/-/merge_requests/12',
            updated_at: '2026-05-31T12:00:00Z',
            description: 'MR body',
            changes_count: '1',
            head_pipeline: null,
            reviewers: []
          })
        }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/discussions?per_page=100') {
        return { stdout: '[]' }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/reviewers') {
        return { stdout: '[]' }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/approvals') {
        return { stdout: JSON.stringify({ approvals_required: 0, approvals_left: 0 }) }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/approval_state') {
        return { stdout: JSON.stringify({ rules: [] }) }
      }
      if (
        endpoint === 'projects/g%2Fp/merge_requests/12/diffs?per_page=100' ||
        endpoint === 'projects/g%2Fp/merge_requests/12/changes'
      ) {
        throw new Error('diff unavailable')
      }
      throw new Error(`unexpected glab call: ${args.join(' ')}`)
    })

    const details = await getWorkItemDetails('/repo', 12, 'mr')

    expect(details?.files).toEqual([])
    expect(details?.filesUnavailable).toBe(true)
  })

  it('routes local WSL MR detail fetches through project resolution and glab options', async () => {
    const localGitOptions = { wslDistro: 'Ubuntu' }
    glabExecFileAsyncMock.mockImplementation(async (args: string[]) => {
      const endpoint = args.at(-1)
      if (endpoint === 'projects/g%2Fp/merge_requests/12') {
        return {
          stdout: JSON.stringify({
            id: 120,
            iid: 12,
            title: 'WSL detail',
            state: 'opened',
            web_url: 'https://gitlab.com/g/p/-/merge_requests/12',
            updated_at: '2026-06-16T00:00:00Z',
            description: 'MR body',
            sha: 'head-sha',
            head_pipeline: null,
            reviewers: []
          })
        }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/discussions?per_page=100') {
        return { stdout: '[]' }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/reviewers') {
        return { stdout: '[]' }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/approvals') {
        return { stdout: JSON.stringify({ approvals_required: 0, approvals_left: 0 }) }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/approval_state') {
        return { stdout: JSON.stringify({ rules: [] }) }
      }
      if (endpoint === 'projects/g%2Fp/merge_requests/12/diffs?per_page=100') {
        return { stdout: '[]' }
      }
      throw new Error(`unexpected glab call: ${args.join(' ')}`)
    })

    const details = await getWorkItemDetails(
      '/repo',
      12,
      'mr',
      undefined,
      null,
      undefined,
      localGitOptions
    )

    expect(details?.item.number).toBe(12)
    expect(resolveIssueSourceMock).toHaveBeenCalledWith(
      '/repo',
      undefined,
      ['gitlab.com'],
      null,
      localGitOptions
    )
    expect(glabExecFileAsyncMock.mock.calls.every((call) => call[1]?.wslDistro === 'Ubuntu')).toBe(
      true
    )
  })
})

describe('GitLab MR file diff counts', () => {
  async function fileFor(diff: string) {
    glabExecFileAsyncMock.mockResolvedValueOnce({
      stdout: JSON.stringify([{ new_path: 'src/app.ts', diff }])
    })
    const files = await fetchMRFiles('/repo', { host: 'gitlab.com', path: 'g/p' }, 12)
    expect(files).toHaveLength(1)
    return files[0]
  }

  beforeEach(() => glabExecFileAsyncMock.mockReset())

  it('counts header-like content inside the header-less payload GitLab returns', async () => {
    expect(await fileFor('@@ -1 +1 @@\n--- old comment\n+++ new comment')).toMatchObject({
      additions: 1,
      deletions: 1
    })
  })

  it('ignores prefixes before the first hunk', async () => {
    expect(await fileFor('--- a/x\n+++ b/x\n+not a hunk\n-unknown')).toMatchObject({
      additions: 0,
      deletions: 0
    })
  })

  it('accumulates asymmetric counts across hunks', async () => {
    expect(await fileFor('@@ -1 +1 @@\n-a\n+b\n@@ -5 +5,2 @@\n-c\n+d\n+e')).toMatchObject({
      additions: 3,
      deletions: 2
    })
  })

  it('counts CRLF and Unicode content using line prefixes', async () => {
    expect(await fileFor('@@ -1 +1 @@\r\n-é\r\n+🚀\r\n')).toMatchObject({
      additions: 1,
      deletions: 1
    })
  })

  it('treats a lone CR as content within a removed line', async () => {
    expect(await fileFor('@@ -1 +1 @@\n-old\r+new')).toMatchObject({
      additions: 0,
      deletions: 1
    })
  })

  it('counts a large diff without splitting it into an array of lines', async () => {
    const diff = `@@ -1 +1 @@\n${'-old\n+new\n context\n'.repeat(10000)}`
    const split = vi.spyOn(String.prototype, 'split')
    try {
      expect(await fileFor(diff)).toMatchObject({ additions: 10000, deletions: 10000 })
      expect(split).not.toHaveBeenCalled()
    } finally {
      split.mockRestore()
    }
  })
})
