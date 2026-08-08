import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DfHisEnvironmentConfig } from '../dfhis-environment/config'

import {
  EXTERNAL_SKILL_SERVER_ORIGIN,
  resetSkillContributionServerOriginCache,
  resolveSkillContributionServerOrigin,
  skillPackUrlForOrigin
} from './server-origin'

const baseConfig = {
  dfhisSkillPackUrl: 'http://192.168.1.10:18800/static/downloads/dfhis/dfhis-skill-pack.json'
} as DfHisEnvironmentConfig

const fetchMock = vi.fn()

beforeEach(() => {
  resetSkillContributionServerOriginCache()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  delete process.env.SKILL_CONTRIB_SERVER_ORIGIN
})

describe('resolveSkillContributionServerOrigin', () => {
  it('returns the intranet origin when the probe succeeds', async () => {
    fetchMock.mockResolvedValue({ ok: true })

    const origin = await resolveSkillContributionServerOrigin(baseConfig)

    expect(origin).toBe('http://192.168.1.10:18800')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('http://192.168.1.10:18800/')
  })

  it('falls back to the public domain when the intranet is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('connect ETIMEDOUT'))

    const origin = await resolveSkillContributionServerOrigin(baseConfig)

    expect(origin).toBe(EXTERNAL_SKILL_SERVER_ORIGIN)
  })

  it('caches the resolved origin and shares one probe across concurrent calls', async () => {
    fetchMock.mockResolvedValue({ ok: true })

    const [a, b] = await Promise.all([
      resolveSkillContributionServerOrigin(baseConfig),
      resolveSkillContributionServerOrigin(baseConfig)
    ])
    const c = await resolveSkillContributionServerOrigin(baseConfig)

    expect(a).toBe('http://192.168.1.10:18800')
    expect(b).toBe(a)
    expect(c).toBe(a)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('honors the env override without probing', async () => {
    process.env.SKILL_CONTRIB_SERVER_ORIGIN = 'https://skill.example.com/'

    const origin = await resolveSkillContributionServerOrigin(baseConfig)

    expect(origin).toBe('https://skill.example.com')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips the probe when the configured origin is already the public domain', async () => {
    const origin = await resolveSkillContributionServerOrigin({
      dfhisSkillPackUrl: `${EXTERNAL_SKILL_SERVER_ORIGIN}/static/downloads/dfhis/dfhis-skill-pack.json`
    } as DfHisEnvironmentConfig)

    expect(origin).toBe(EXTERNAL_SKILL_SERVER_ORIGIN)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('skillPackUrlForOrigin', () => {
  it('keeps the configured path on the resolved origin', () => {
    expect(skillPackUrlForOrigin(baseConfig, EXTERNAL_SKILL_SERVER_ORIGIN)).toBe(
      `${EXTERNAL_SKILL_SERVER_ORIGIN}/static/downloads/dfhis/dfhis-skill-pack.json`
    )
  })
})
