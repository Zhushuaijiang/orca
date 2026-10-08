import { expect, it } from 'vitest'
import type { TranscriptMessage } from '../ai-vault/session-transcript-consumers'
import { SessionSearchIndexWriter } from './session-search-index-writer'
import {
  openSessionSearchIndexFile,
  syntheticCandidate,
  syntheticSession
} from './session-search-index-test-fixture'
import { searchMessageRows } from './session-search-message-rows'

function heapAfterGc(): number {
  if (!globalThis.gc) {
    throw new Error('Retention test requires --expose-gc (config/vitest.config.ts)')
  }
  void /reset/.test('reset')
  globalThis.gc()
  globalThis.gc()
  return process.memoryUsage().heapUsed
}

it.each(['tool', 'user', 'assistant'] as const)(
  'keeps buffered %s rows without retaining their multi-MB messages',
  (role) => {
    const before = heapAfterGc()
    const rows: TranscriptMessage[] = []
    for (let index = 0; index < 64; index++) {
      const row = searchMessageRows([
        { role, text: `${index}:${'x'.repeat(1024 * 1024)}`, timestamp: null }
      ]).next().value
      if (row) {
        rows.push(row)
      }
    }
    expect(heapAfterGc() - before).toBeLessThan(2 * 1024 * 1024)
    expect(rows).toHaveLength(64)
    expect(rows.every((row) => row.text.length === (role === 'tool' ? 3072 : 8000))).toBe(true)
    expect(rows[63]?.text.startsWith('63:')).toBe(true)
  }
)

it('commits named reads before concurrent buffers can fill the scanner heap', async () => {
  const index = await openSessionSearchIndexFile('ss-buffer-retention')
  const writer = new SessionSearchIndexWriter(index.db)
  const session = syntheticSession()
  try {
    const write = writer.beginWrite(syntheticCandidate(), 'replace', 0, () => session)
    if (!write) {
      throw new Error('Expected a new transcript write')
    }
    const text = 'searchable '.repeat(800)
    for (let position = 0; position < 600; position++) {
      write.add({ role: 'user', text, timestamp: null })
    }
    expect(index.db.prepare('SELECT byte_offset FROM files').get()).toEqual({ byte_offset: -1 })
    expect(write.commit({ session, byteOffset: 12345, incomplete: false })).toBe(true)
    expect(index.db.prepare('SELECT count(*) AS n FROM messages').get()).toEqual({ n: 1200 })
    expect(index.db.prepare('SELECT byte_offset FROM files').get()).toEqual({ byte_offset: 12345 })
  } finally {
    writer.close()
    await index.close()
  }
})

it('bounds the row objects buffered for transcripts with tiny messages', async () => {
  const index = await openSessionSearchIndexFile('ss-tiny-message-retention')
  const writer = new SessionSearchIndexWriter(index.db)
  const session = syntheticSession()
  try {
    const write = writer.beginWrite(syntheticCandidate(), 'replace', 0, () => session)
    if (!write) {
      throw new Error('Expected a new transcript write')
    }
    for (let position = 0; position < 5000; position++) {
      write.add({ role: 'user', text: 'x', timestamp: null })
    }
    expect(index.db.prepare('SELECT count(*) AS n FROM messages').get()).toEqual({ n: 4096 })
    expect(write.commit({ session, byteOffset: 12345, incomplete: false })).toBe(true)
    expect(index.db.prepare('SELECT count(*) AS n FROM messages').get()).toEqual({ n: 5000 })
  } finally {
    writer.close()
    await index.close()
  }
})
