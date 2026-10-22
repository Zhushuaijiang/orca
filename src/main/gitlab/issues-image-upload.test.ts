import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type * as GlUtils from './gl-utils'

const {
  glabExecFileAsyncMock,
  glabApiWithHeadersMock,
  getIssueProjectRefMock,
  resolveIssueSourceMock,
  getGlabKnownHostsMock,
  acquireMock,
  releaseMock
} = vi.hoisted(() => ({
  glabExecFileAsyncMock: vi.fn(),
  glabApiWithHeadersMock: vi.fn(),
  getIssueProjectRefMock: vi.fn(),
  resolveIssueSourceMock: vi.fn(),
  getGlabKnownHostsMock: vi.fn(),
  acquireMock: vi.fn(),
  releaseMock: vi.fn()
}))

vi.mock('./gl-utils', async () => {
  const actual = await vi.importActual<typeof GlUtils>('./gl-utils')
  return {
    ...actual,
    glabExecFileAsync: glabExecFileAsyncMock,
    glabApiWithHeaders: glabApiWithHeadersMock,
    getIssueProjectRef: getIssueProjectRefMock,
    resolveIssueSource: resolveIssueSourceMock,
    getGlabKnownHosts: getGlabKnownHostsMock,
    acquire: acquireMock,
    release: releaseMock
  }
})

import { createIssue } from './issues'

describe('gitlab issue inline image uploads', () => {
  beforeEach(() => {
    glabExecFileAsyncMock.mockReset()
    glabApiWithHeadersMock.mockReset()
    getIssueProjectRefMock.mockReset()
    resolveIssueSourceMock.mockReset()
    getGlabKnownHostsMock.mockReset()
    acquireMock.mockReset()
    releaseMock.mockReset()
    acquireMock.mockResolvedValue(undefined)
    getGlabKnownHostsMock.mockResolvedValue(['gitlab.com'])
    resolveIssueSourceMock.mockImplementation(async () => ({
      source: await getIssueProjectRefMock(),
      fellBack: false
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uploads inline data URI images before creating a GitLab issue', async () => {
    const repoPath = await mkdtemp(join(tmpdir(), 'orca-gitlab-issue-test-'))
    getIssueProjectRefMock.mockResolvedValueOnce({ host: 'gitlab.com', path: 'stablyai/orca' })
    glabExecFileAsyncMock
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          markdown: '![Image #1](/uploads/abc/image-1.png)'
        })
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          iid: 924,
          web_url: 'https://gitlab.com/stablyai/orca/-/issues/924'
        })
      })

    const body = 'Before\n![Image #1](data:image/png;base64,aGVsbG8=)\nAfter'

    try {
      await expect(createIssue(repoPath, 'New issue', body)).resolves.toEqual({
        ok: true,
        number: 924,
        url: 'https://gitlab.com/stablyai/orca/-/issues/924'
      })
      expect(glabExecFileAsyncMock).toHaveBeenNthCalledWith(
        1,
        [
          'api',
          '-X',
          'POST',
          'projects/stablyai%2Forca/uploads',
          '--form',
          expect.stringMatching(/^file=@.*\/orca-gitlab-upload-[^/]+\/image-1\.png$/)
        ],
        { cwd: repoPath }
      )
      expect(glabExecFileAsyncMock).toHaveBeenNthCalledWith(
        2,
        [
          'api',
          '-X',
          'POST',
          'projects/stablyai%2Forca/issues',
          '-f',
          'title=New issue',
          '-f',
          'description=Before\n![Image #1](/uploads/abc/image-1.png)\nAfter'
        ],
        { cwd: repoPath }
      )
    } finally {
      await rm(repoPath, { recursive: true, force: true })
    }
  })

  it('falls back to a content-length multipart upload when glab rejects image upload', async () => {
    const repoPath = await mkdtemp(join(tmpdir(), 'orca-gitlab-issue-test-'))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            markdown: '![Image #1](/uploads/fallback/image-1.png)'
          })
        )
    })
    vi.stubGlobal('fetch', fetchMock)
    getIssueProjectRefMock.mockResolvedValueOnce({
      host: '192.168.1.206',
      path: 'df-ygt/df-ygt-biz-shujumx'
    })
    glabExecFileAsyncMock
      .mockRejectedValueOnce(new Error('HTTP 400 Bad Request'))
      .mockResolvedValueOnce({
        stdout: '',
        stderr:
          '✓ REST API Endpoint: http://192.168.1.206/api/v4/\n✓ Token found: **************************'
      })
      .mockResolvedValueOnce({ stdout: 'secret-token\n' })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          iid: 925,
          web_url: 'http://192.168.1.206/df-ygt/df-ygt-biz-shujumx/-/issues/925'
        })
      })

    const body = 'Before\n![Image #1](data:image/png;base64,aGVsbG8=)\nAfter'

    try {
      await expect(createIssue(repoPath, 'New issue', body)).resolves.toEqual({
        ok: true,
        number: 925,
        url: 'http://192.168.1.206/df-ygt/df-ygt-biz-shujumx/-/issues/925'
      })
      expect(glabExecFileAsyncMock).toHaveBeenNthCalledWith(
        2,
        ['auth', 'status', '--hostname', '192.168.1.206'],
        { cwd: repoPath }
      )
      expect(glabExecFileAsyncMock).toHaveBeenNthCalledWith(
        3,
        ['config', 'get', 'token', '--host', '192.168.1.206'],
        { cwd: repoPath }
      )
      expect(fetchMock).toHaveBeenCalledWith(
        new URL('http://192.168.1.206/api/v4/projects/df-ygt%2Fdf-ygt-biz-shujumx/uploads'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Length': expect.any(String),
            'Content-Type': expect.stringMatching(/^multipart\/form-data; boundary=/),
            'PRIVATE-TOKEN': 'secret-token'
          }),
          body: expect.any(ArrayBuffer)
        })
      )
      expect(glabExecFileAsyncMock).toHaveBeenNthCalledWith(
        4,
        [
          'api',
          '-X',
          'POST',
          'projects/df-ygt%2Fdf-ygt-biz-shujumx/issues',
          '-f',
          'title=New issue',
          '-f',
          'description=Before\n![Image #1](/uploads/fallback/image-1.png)\nAfter'
        ],
        { cwd: repoPath }
      )
    } finally {
      await rm(repoPath, { recursive: true, force: true })
    }
  })

  it('uses the REST endpoint host token when a GitLab host alias auth status exits 401', async () => {
    const repoPath = await mkdtemp(join(tmpdir(), 'orca-gitlab-issue-test-'))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            markdown: '![Image #1](/uploads/fallback/image-1.png)'
          })
        )
    })
    vi.stubGlobal('fetch', fetchMock)
    getIssueProjectRefMock.mockResolvedValueOnce({
      host: 'gitlab.df-mic.com',
      path: 'df-ygt/df-ygt-main'
    })
    glabExecFileAsyncMock
      .mockRejectedValueOnce(new Error('HTTP 400 Bad Request'))
      .mockRejectedValueOnce(
        new Error(
          [
            'gitlab.df-mic.com x gitlab.df-mic.com: API call failed: GET http://192.168.1.206/api/v4/user: 401',
            '✓ REST API Endpoint: http://192.168.1.206/api/v4/',
            '✓ Token found: **************************'
          ].join('\n')
        )
      )
      .mockResolvedValueOnce({ stdout: 'endpoint-host-token\n' })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          iid: 926,
          web_url: 'http://192.168.1.206/df-ygt/df-ygt-main/-/issues/926'
        })
      })

    const body = 'Before\n![Image #1](data:image/png;base64,aGVsbG8=)\nAfter'

    try {
      await expect(createIssue(repoPath, 'New issue', body)).resolves.toEqual({
        ok: true,
        number: 926,
        url: 'http://192.168.1.206/df-ygt/df-ygt-main/-/issues/926'
      })
      expect(glabExecFileAsyncMock).toHaveBeenNthCalledWith(
        2,
        ['auth', 'status', '--hostname', 'gitlab.df-mic.com'],
        { cwd: repoPath }
      )
      expect(glabExecFileAsyncMock).toHaveBeenNthCalledWith(
        3,
        ['config', 'get', 'token', '--host', '192.168.1.206'],
        { cwd: repoPath }
      )
      expect(fetchMock).toHaveBeenCalledWith(
        new URL('http://192.168.1.206/api/v4/projects/df-ygt%2Fdf-ygt-main/uploads'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'PRIVATE-TOKEN': 'endpoint-host-token'
          })
        })
      )
      expect(glabExecFileAsyncMock).toHaveBeenNthCalledWith(
        4,
        [
          'api',
          '-X',
          'POST',
          'projects/df-ygt%2Fdf-ygt-main/issues',
          '-f',
          'title=New issue',
          '-f',
          'description=Before\n![Image #1](/uploads/fallback/image-1.png)\nAfter'
        ],
        { cwd: repoPath }
      )
    } finally {
      await rm(repoPath, { recursive: true, force: true })
    }
  })

  it('does not create a GitLab issue when inline image upload fails', async () => {
    const repoPath = await mkdtemp(join(tmpdir(), 'orca-gitlab-issue-test-'))
    getIssueProjectRefMock.mockResolvedValueOnce({ host: 'gitlab.com', path: 'stablyai/orca' })
    glabExecFileAsyncMock
      .mockRejectedValueOnce(new Error('HTTP 413 Payload Too Large'))
      .mockRejectedValueOnce(new Error('not authenticated'))

    const body = '![Image #1](data:image/png;base64,aGVsbG8=)'

    try {
      await expect(createIssue(repoPath, 'New issue', body)).resolves.toEqual({
        ok: false,
        error:
          'Could not upload GitLab issue image: HTTP 413 Payload Too Large; fallback upload failed: not authenticated'
      })
      expect(glabExecFileAsyncMock).toHaveBeenCalledTimes(2)
    } finally {
      await rm(repoPath, { recursive: true, force: true })
    }
  })
})
