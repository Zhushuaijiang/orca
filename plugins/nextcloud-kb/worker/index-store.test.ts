// The name index is expensive to build, so it must survive a worker restart via the plugin's
// private store. These lock down the encoding that persistence rests on: a finished crawl is
// restored as-is, another server's cache is never reused, and large crawls split across chunks.

import { test, assert } from 'orca/testing'
import type { JsonValue } from 'orca'
import type { KbEntry } from '../src/protocol'
import type { NextcloudConnection } from './nextcloud'
import {
  clearIndex,
  connectionFingerprint,
  persistIndex,
  restoreIndex,
  type IndexStorage
} from './index-store'

const connection: NextcloudConnection = {
  serverUrl: 'http://192.168.1.10:18100',
  username: 'ncadmin',
  appPassword: 'secret'
}

// Real storage serializes values, so the mock returns copies rather than shared references.
function memoryStorage(
  seed?: Map<string, JsonValue>
): IndexStorage & { values: Map<string, JsonValue> } {
  const values = seed ?? new Map<string, JsonValue>()
  return {
    values,
    async get(key) {
      const value = values.get(key)
      return value === undefined ? null : structuredClone(value)
    },
    async set(key, value) {
      values.set(key, structuredClone(value))
    },
    async delete(key) {
      values.delete(key)
    },
    async keys() {
      return [...values.keys()]
    }
  }
}

// The name index only stores [name, path, dir]; metadata is intentionally left zeroed on restore.
function entry(name: string, dir = false): KbEntry {
  return { name, path: `/${name}`, dir, size: 0, modifiedMs: null, etag: null, fileId: null }
}

test('a finished snapshot is restored intact on a fresh worker', async () => {
  const storage = memoryStorage()
  const entries = [entry('手麻.md'), entry('病历'), entry('病历/入院记录.md')]
  await persistIndex(storage, connection, {
    entries,
    complete: true,
    truncated: false,
    builtAt: 1
  })

  // A restart reads the same persisted store with no in-memory index.
  const restarted = memoryStorage(storage.values)
  const snapshot = await restoreIndex(restarted, connection)
  assert(snapshot, 'the persisted index is restored')
  assert.deepEqual(snapshot.entries, entries)
  assert.equal(snapshot.complete, true)
  assert.equal(snapshot.truncated, false)
})

test("another server's cache is never restored", async () => {
  const storage = memoryStorage()
  await persistIndex(storage, connection, {
    entries: [entry('手麻.md')],
    complete: true,
    truncated: false,
    builtAt: 1
  })

  const otherServer: NextcloudConnection = { ...connection, username: 'someone-else' }
  assert.notEqual(connectionFingerprint(connection), connectionFingerprint(otherServer))
  assert.equal(await restoreIndex(storage, otherServer), null)
})

test('clearIndex wipes the snapshot so a mutation cannot resurrect stale entries', async () => {
  const storage = memoryStorage()
  await persistIndex(storage, connection, {
    entries: [entry('旧文件.md')],
    complete: true,
    truncated: false,
    builtAt: 1
  })
  await clearIndex(storage)
  assert.equal(storage.values.size, 0)
  assert.equal(await restoreIndex(storage, connection), null)
})

test('a large snapshot is split across chunks and fully restored', async () => {
  const storage = memoryStorage()
  const entries: KbEntry[] = []
  for (let i = 0; i < 20_000; i += 1) {
    entries.push(entry(`目录${i}/文件${i}.md`))
  }
  await persistIndex(storage, connection, {
    entries,
    complete: true,
    truncated: false,
    builtAt: 1
  })
  const chunkKeys = [...storage.values.keys()].filter((key) => /\.c\d+$/.test(key))
  assert.ok(chunkKeys.length > 1, 'the snapshot spans multiple chunks')

  const snapshot = await restoreIndex(memoryStorage(storage.values), connection)
  assert(snapshot, 'the chunked snapshot is restored')
  assert.deepEqual(snapshot.entries, entries)
})

// The host counts a value's size in UTF-8 bytes, but JS string length counts CJK characters as
// one. Sizing by `.length` made CJK-dense chunks ~2x too big and `storage.set` refused them.
test('CJK-heavy chunks stay within the 256 KiB per-value cap', async () => {
  const storage = memoryStorage()
  const entries: KbEntry[] = []
  for (let i = 0; i < 20_000; i += 1) {
    entries.push(entry(`脑卒中患者入院病历记录${i}.md`))
  }
  await persistIndex(storage, connection, {
    entries,
    complete: true,
    truncated: false,
    builtAt: 1
  })
  const encoder = new TextEncoder()
  for (const [key, value] of storage.values) {
    if (/\.c\d+$/.test(key)) {
      const bytes = encoder.encode(JSON.stringify(value)).length
      assert.ok(bytes <= 256 * 1024, `chunk ${key} is ${bytes} bytes, over the 256 KiB cap`)
    }
  }
})
