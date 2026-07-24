import { afterEach, describe, expect, it, vi } from 'vitest'
import { listTools } from './mcp-http-transport'

describe('MCP HTTP transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists tool names from a JSON tools/list response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          result: {
            tools: [{ name: 'dfhis_agent_chat' }, { name: 'download_yunxiao_archive' }]
          }
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      listTools(
        { url: 'http://127.0.0.1/mcp', bearerToken: 'token', hasQueryToken: false },
        'session-1',
        1000
      )
    ).resolves.toEqual(['dfhis_agent_chat', 'download_yunxiao_archive'])
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1/mcp',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
          'Mcp-Session-Id': 'session-1'
        })
      })
    )
  })
})
