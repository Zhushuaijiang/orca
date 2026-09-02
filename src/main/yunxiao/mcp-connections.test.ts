import { describe, expect, it } from 'vitest'
import { getHisMcpToolToken } from './mcp-connections'

describe('getHisMcpToolToken', () => {
  it('prefers the bearer token over the URL query token', () => {
    expect(
      getHisMcpToolToken({
        url: 'http://192.168.1.10:9020/mcp?t=url-token',
        bearerToken: 'bearer-token',
        hasQueryToken: true
      })
    ).toBe('bearer-token')
  })

  it('falls back to the URL t query when no bearer token is set', () => {
    expect(
      getHisMcpToolToken({
        url: 'http://192.168.1.10:9020/mcp?t=url-token',
        bearerToken: null,
        hasQueryToken: true
      })
    ).toBe('url-token')
  })

  it('returns an empty string for an invalid URL without a bearer token', () => {
    expect(getHisMcpToolToken({ url: 'not-a-url', bearerToken: null, hasQueryToken: false })).toBe(
      ''
    )
  })
})
