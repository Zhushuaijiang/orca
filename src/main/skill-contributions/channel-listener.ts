import { existsSync } from 'node:fs'
import {
  getDfHisEnvironmentConfigPath,
  readDfHisEnvironmentConfigSync
} from '../dfhis-environment/config'
import { getContributorIdentity } from './contributor-identity'
import { resolveSkillContributionUploadToken, runSkillContributionUpload } from './uploader'

const FIRST_RECONNECT_DELAY_MS = 5_000
const MAX_RECONNECT_DELAY_MS = 5 * 60_000

export type SseEvent = { event: string; data: string }

export function parseSseEventBlock(block: string): SseEvent | null {
  let event = 'message'
  const dataLines: string[] = []
  let hasField = false
  for (const rawLine of block.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (!line || line.startsWith(':')) {
      continue
    }
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) {
      value = value.slice(1)
    }
    if (field === 'event') {
      event = value
      hasField = true
    } else if (field === 'data') {
      dataLines.push(value)
      hasField = true
    }
  }
  return hasField ? { event, data: dataLines.join('\n') } : null
}

/** Incremental splitter: SSE events are separated by a blank line. */
export class SseBlockSplitter {
  private buffer = ''

  push(chunk: string): string[] {
    this.buffer += chunk
    const blocks: string[] = []
    let separator = this.buffer.indexOf('\n\n')
    while (separator !== -1) {
      blocks.push(this.buffer.slice(0, separator))
      this.buffer = this.buffer.slice(separator + 2)
      separator = this.buffer.indexOf('\n\n')
    }
    return blocks
  }

  flush(): string[] {
    const tail = this.buffer
    this.buffer = ''
    return tail.trim() ? [tail] : []
  }
}

let started = false
let uploading = false
let abortController: AbortController | null = null

function triggerUpload(): void {
  if (uploading) {
    return
  }
  uploading = true
  void runSkillContributionUpload().finally(() => {
    uploading = false
  })
}

async function readEventStream(body: ReadableStream<Uint8Array>): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const splitter = new SseBlockSplitter()
  const dispatch = (blocks: string[]): void => {
    for (const block of blocks) {
      if (parseSseEventBlock(block)?.event === 'collect') {
        triggerUpload()
      }
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      dispatch(splitter.push(decoder.decode(value, { stream: true })))
    }
    dispatch(splitter.push(decoder.decode()))
    dispatch(splitter.flush())
  } finally {
    reader.releaseLock()
  }
}

function sleepUnref(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref()
  })
}

async function runChannelLoop(): Promise<void> {
  const identity = await getContributorIdentity().catch(() => null)
  if (!identity || !started) {
    started = false
    return
  }
  const config = readDfHisEnvironmentConfigSync()
  const url = `${new URL(config.dfhisSkillPackUrl).origin}/api/skill-contributions/channel?userId=${encodeURIComponent(identity.yunxiaoUserId)}`
  const headers = {
    Accept: 'text/event-stream',
    'X-API-Key': resolveSkillContributionUploadToken(config)
  }
  let reconnectDelay = FIRST_RECONNECT_DELAY_MS
  while (started) {
    try {
      abortController = new AbortController()
      const response = await fetch(url, { headers, signal: abortController.signal })
      if (!response.ok || !response.body) {
        throw new Error(`channel request failed with status ${response.status}`)
      }
      const connectedAt = Date.now()
      await readEventStream(response.body)
      // Why: only a connection that outlived its own backoff counts as healthy;
      // an instantly-dropped stream must keep growing the delay.
      if (Date.now() - connectedAt >= reconnectDelay) {
        reconnectDelay = FIRST_RECONNECT_DELAY_MS
      }
    } catch (error) {
      if (!started) {
        break
      }
      // Why: a hidden background task must never surface failures to the app.
      console.warn(
        '[skill-contributions] channel disconnected:',
        error instanceof Error ? error.message : String(error)
      )
    }
    if (!started) {
      break
    }
    await sleepUnref(reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
  }
  abortController = null
}

export function startSkillContributionChannel(): void {
  if (started) {
    return
  }
  // Why: no DFHIS config file means the machine never opted into DFHIS; stay silent.
  if (!existsSync(getDfHisEnvironmentConfigPath())) {
    return
  }
  started = true
  void runChannelLoop().catch((error: unknown) => {
    started = false
    console.warn(
      '[skill-contributions] channel loop failed:',
      error instanceof Error ? error.message : String(error)
    )
  })
}

export function stopSkillContributionChannel(): void {
  started = false
  abortController?.abort()
  abortController = null
}
