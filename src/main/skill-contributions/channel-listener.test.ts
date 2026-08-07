import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const identityMock = vi.fn()
const uploadMock = vi.fn(async () => ({ uploaded: [], unchanged: [], skipped: [] }))

let configDirectory: string
let configPath: string

vi.mock('../dfhis-environment/config', () => ({
  getDfHisEnvironmentConfigPath: () => configPath,
  readDfHisEnvironmentConfigSync: () => ({
    dfhisSkillPackUrl: 'http://192.168.1.10:18800/static/downloads/dfhis/dfhis-skill-pack.json',
    skillContributionUploadToken: 'test-token'
  })
}))
vi.mock('./contributor-identity', () => ({
  getContributorIdentity: () => identityMock()
}))
vi.mock('./uploader', () => ({
  resolveSkillContributionUploadToken: () => 'test-token',
  runSkillContributionUpload: () => uploadMock()
}))

import {
  SseBlockSplitter,
  parseSseEventBlock,
  startSkillContributionChannel,
  stopSkillContributionChannel
} from './channel-listener'

const fetchMock = vi.fn()

function streamFrom(text: string): ReadableStream<Uint8Array> {
  const encoded = new TextEncoder().encode(text)
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded)
      controller.close()
    }
  })
}

function emptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close()
    }
  })
}

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve()
  }
}

beforeEach(() => {
  configDirectory = mkdtempSync(path.join(tmpdir(), 'orca-skill-channel-test-'))
  configPath = path.join(configDirectory, 'dfhis-environment.json')
  writeFileSync(configPath, '{}', 'utf8')
  identityMock.mockResolvedValue({ yunxiaoUserId: 'u-1', name: 'Alice', organization: 'DFHIS' })
  uploadMock.mockResolvedValue({ uploaded: [], unchanged: [], skipped: [] })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  stopSkillContributionChannel()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  rmSync(configDirectory, { recursive: true, force: true })
})

describe('parseSseEventBlock', () => {
  it('ignores comment (heartbeat) lines', () => {
    expect(parseSseEventBlock(': heartbeat')).toBeNull()
    expect(parseSseEventBlock(': heartbeat\nevent: collect\ndata: {"requestedAt":"t"}')).toEqual({
      event: 'collect',
      data: '{"requestedAt":"t"}'
    })
  })

  it('parses event and data lines with CRLF endings', () => {
    expect(parseSseEventBlock('event: collect\r\ndata: {}\r')).toEqual({
      event: 'collect',
      data: '{}'
    })
  })

  it('joins multi-line data with newlines', () => {
    expect(parseSseEventBlock('data: a\ndata: b')).toEqual({ event: 'message', data: 'a\nb' })
  })
})

describe('SseBlockSplitter', () => {
  it('holds an incomplete block until the next chunk completes it', () => {
    const splitter = new SseBlockSplitter()
    expect(splitter.push('event: collect\nda')).toEqual([])
    expect(splitter.push('ta: {}\n\n')).toEqual(['event: collect\ndata: {}'])
    expect(splitter.flush()).toEqual([])
  })

  it('emits multiple complete blocks at once', () => {
    const splitter = new SseBlockSplitter()
    expect(splitter.push(': hb\n\nevent: a\ndata: 1\n\n')).toEqual([': hb', 'event: a\ndata: 1'])
  })
})

describe('startSkillContributionChannel', () => {
  it('triggers one upload when a collect event arrives', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: streamFrom(': heartbeat\n\nevent: collect\ndata: {"requestedAt":"t"}\n\n')
    })

    startSkillContributionChannel()
    await flushAsync()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://192.168.1.10:18800/api/skill-contributions/channel?userId=u-1')
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('test-token')
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })

  it('skips duplicate collect events while an upload is still running', async () => {
    let resolveUpload: ((value: unknown) => void) | undefined
    uploadMock.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve
      }) as never
    )
    fetchMock.mockResolvedValue({
      ok: true,
      body: streamFrom('event: collect\ndata: {}\n\nevent: collect\ndata: {}\n\n')
    })

    startSkillContributionChannel()
    await flushAsync()

    expect(uploadMock).toHaveBeenCalledTimes(1)
    resolveUpload?.({ uploaded: [], unchanged: [], skipped: [] })
    await flushAsync()
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })

  it('reconnects with exponential backoff after the stream ends', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(async () => ({ ok: true, body: emptyStream() }))

    startSkillContributionChannel()
    await flushAsync()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5_000)
    await flushAsync()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(9_999)
    await flushAsync()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1)
    await flushAsync()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not send a request when the contributor identity is null', async () => {
    identityMock.mockResolvedValue(null)

    startSkillContributionChannel()
    await flushAsync()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(uploadMock).not.toHaveBeenCalled()
  })
})
