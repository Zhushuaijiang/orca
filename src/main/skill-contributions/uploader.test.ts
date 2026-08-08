import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CollectedSkill } from './collect-local-skills'
import type { SkillContributionUploadState } from './upload-state'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/orca-skill-contrib-uploader-test'
  }
}))

const readConfigMock = vi.fn()
const getIdentityMock = vi.fn()
const collectMock = vi.fn()
let inMemoryState: SkillContributionUploadState
const writeStateMock = vi.fn(async (state: SkillContributionUploadState) => {
  inMemoryState = state
})

vi.mock('../dfhis-environment/config', () => ({
  readDfHisEnvironmentConfigSync: () => readConfigMock()
}))
vi.mock('./contributor-identity', () => ({
  getContributorIdentity: () => getIdentityMock()
}))
vi.mock('./collect-local-skills', () => ({
  collectLocalSkills: () => collectMock()
}))
vi.mock('./remote-pack-aggregates', () => ({
  fetchRemoteOfficialAggregates: async () => new Map<string, Set<string>>()
}))
vi.mock('./server-origin', () => ({
  resolveSkillContributionServerOrigin: async () => 'http://192.168.1.10:18800',
  skillPackUrlForOrigin: (_config: unknown, origin: string) =>
    `${origin}/static/downloads/dfhis/dfhis-skill-pack.json`
}))
vi.mock('./upload-state', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return {
    ...original,
    readSkillContributionState: async () => inMemoryState,
    writeSkillContributionState: (state: SkillContributionUploadState) => writeStateMock(state)
  }
})

import {
  DEFAULT_SKILL_CONTRIB_UPLOAD_TOKEN,
  resolveSkillContributionUploadToken,
  runSkillContributionUpload
} from './uploader'
import { aggregateSkillFilesSha256 } from './upload-state'

function skill(name: string, content: string): CollectedSkill {
  return {
    name,
    sourceHomes: ['agents'],
    files: [
      {
        path: 'SKILL.md',
        sha256: content.padEnd(64, '0').slice(0, 64),
        contentBase64: Buffer.from(content).toString('base64')
      }
    ]
  }
}

const baseConfig = {
  dfhisSkillPackUrl: 'http://192.168.1.10:18800/static/downloads/dfhis/dfhis-skill-pack.json',
  skillContributionUploadToken: ''
}

const fetchMock = vi.fn()

beforeEach(() => {
  inMemoryState = { lastRunAt: null, skills: {} }
  readConfigMock.mockReturnValue(baseConfig)
  getIdentityMock.mockResolvedValue({
    yunxiaoUserId: 'u-1',
    name: 'Alice',
    organization: 'DFHIS'
  })
  collectMock.mockResolvedValue({ skills: [], skipped: [] })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  delete process.env.SKILL_CONTRIB_UPLOAD_TOKEN
})

describe('token and url resolution', () => {
  it('prefers env over config over the default token', () => {
    expect(resolveSkillContributionUploadToken(baseConfig as never)).toBe(
      DEFAULT_SKILL_CONTRIB_UPLOAD_TOKEN
    )
    expect(
      resolveSkillContributionUploadToken({
        ...baseConfig,
        skillContributionUploadToken: 'config-token'
      } as never)
    ).toBe('config-token')
    process.env.SKILL_CONTRIB_UPLOAD_TOKEN = 'env-token'
    expect(
      resolveSkillContributionUploadToken({
        ...baseConfig,
        skillContributionUploadToken: 'config-token'
      } as never)
    ).toBe('env-token')
  })
})

describe('runSkillContributionUpload', () => {
  it('does nothing without a contributor identity', async () => {
    getIdentityMock.mockResolvedValue(null)

    const result = await runSkillContributionUpload()

    expect(result).toEqual({ uploaded: [], unchanged: [], skipped: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uploads changed skills and records their aggregate hashes', async () => {
    const changed = skill('my-skill', 'new-content')
    const alreadyUploaded = skill('old-skill', 'old-content')
    inMemoryState.skills['old-skill'] = aggregateSkillFilesSha256(alreadyUploaded.files)
    collectMock.mockResolvedValue({
      skills: [alreadyUploaded, changed],
      skipped: [{ name: 'huge', reason: 'skill-too-large' }]
    })
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, results: [{ skill: 'my-skill', status: 'stored' }] })
    })

    const result = await runSkillContributionUpload()

    expect(result).toEqual({
      uploaded: ['my-skill'],
      unchanged: ['old-skill'],
      skipped: ['huge']
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://192.168.1.10:18800/api/skill-contributions')
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe(
      DEFAULT_SKILL_CONTRIB_UPLOAD_TOKEN
    )
    const body = JSON.parse(init.body as string) as {
      schemaVersion: number
      contributor: { yunxiaoUserId: string }
      skills: { name: string }[]
    }
    expect(body.schemaVersion).toBe(1)
    expect(body.contributor.yunxiaoUserId).toBe('u-1')
    expect(body.skills.map((entry) => entry.name)).toEqual(['my-skill'])
    expect(inMemoryState.skills['my-skill']).toBe(aggregateSkillFilesSha256(changed.files))
    expect(inMemoryState.lastRunAt).toBeTruthy()
  })

  it('reports an error and keeps state untouched on a 401', async () => {
    collectMock.mockResolvedValue({ skills: [skill('my-skill', 'content')], skipped: [] })
    fetchMock.mockResolvedValue({ ok: false, status: 401 })

    const result = await runSkillContributionUpload()

    expect(result.error).toBe('upload failed with status 401')
    expect(result.uploaded).toEqual([])
    expect(writeStateMock).not.toHaveBeenCalled()
  })

  it('swallows network exceptions into the error field', async () => {
    collectMock.mockResolvedValue({ skills: [skill('my-skill', 'content')], skipped: [] })
    fetchMock.mockRejectedValue(new Error('connection refused'))

    const result = await runSkillContributionUpload()

    expect(result.error).toBe('connection refused')
    expect(writeStateMock).not.toHaveBeenCalled()
  })

  it('splits oversized uploads into sequential batches', async () => {
    const bigContent = 'x'.repeat(3 * 1024 * 1024)
    collectMock.mockResolvedValue({
      skills: [skill('big-a', bigContent), skill('big-b', bigContent)],
      skipped: []
    })
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, results: [] })
    })

    const result = await runSkillContributionUpload()

    expect(result.error).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      skills: { name: string }[]
    }
    const secondBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as {
      skills: { name: string }[]
    }
    expect(firstBody.skills.map((entry) => entry.name)).toEqual(['big-a'])
    expect(secondBody.skills.map((entry) => entry.name)).toEqual(['big-b'])
    expect(inMemoryState.skills['big-a']).toBeTruthy()
    expect(inMemoryState.skills['big-b']).toBeTruthy()
  })

  it('skips the request when every skill matches the stored state', async () => {
    const existing = skill('my-skill', 'same')
    inMemoryState.skills['my-skill'] = aggregateSkillFilesSha256(existing.files)
    collectMock.mockResolvedValue({ skills: [existing], skipped: [] })

    const result = await runSkillContributionUpload()

    expect(result).toEqual({ uploaded: [], unchanged: ['my-skill'], skipped: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
