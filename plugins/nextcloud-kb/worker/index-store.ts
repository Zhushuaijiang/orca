// The name index is expensive to build (a full PROPFIND walk), so persist the finished
// snapshot in the plugin's private store and restore it when the worker restarts. Storage is
// capped per value, so entries are written as compact [name, path, dir] tuples across chunks.

import type { JsonValue } from 'orca/host'
import type { KbEntry } from '../src/protocol'
import type { NextcloudConnection } from './nextcloud'

export const INDEX_STORE_PREFIX = 'kb.nameIndex.v1'
// The host caps one value at 256 KiB and the whole store at 5 MiB, both counted in UTF-8 bytes
// (the store pretty-prints the file, so leave headroom). CJK names are ~3x their JS string length,
// so size chunks with TextEncoder, never `JSON.stringify(...).length`.
export const INDEX_CHUNK_BYTES = 180 * 1024
export const MAX_PERSISTED_BYTES = 3 * 1024 * 1024
export const MAX_INDEX_CHUNKS = 24
export const MAX_PERSISTED_ENTRIES = 60_000

type StoredEntry = [name: string, path: string, dir: 0 | 1]

type IndexHeader = {
  version: 1
  fingerprint: string
  builtAt: number
  complete: boolean
  truncated: boolean
  chunkCount: number
}

export type IndexSnapshot = {
  entries: KbEntry[]
  complete: boolean
  truncated: boolean
  builtAt: number
}

export type IndexStorage = {
  get(key: string): Promise<JsonValue | null>
  set(key: string, value: JsonValue): Promise<void>
  delete(key: string): Promise<void>
  keys(): Promise<string[]>
}

export function connectionFingerprint(connection: NextcloudConnection): string {
  return `${connection.serverUrl}|${connection.username}`
}

/** Deletes the snapshot, including chunk keys left by a previous, larger crawl. */
export async function clearIndex(storage: IndexStorage): Promise<void> {
  const keys = await storage.keys()
  for (const key of keys) {
    if (key.startsWith(INDEX_STORE_PREFIX)) {
      await storage.delete(key)
    }
  }
}

export async function persistIndex(
  storage: IndexStorage,
  connection: NextcloudConnection,
  snapshot: IndexSnapshot
): Promise<void> {
  await clearIndex(storage)
  const encoder = new TextEncoder()
  const tuples: StoredEntry[] = snapshot.entries
    .slice(0, MAX_PERSISTED_ENTRIES)
    .map((entry) => [entry.name, entry.path, entry.dir ? 1 : 0])
  const chunks: StoredEntry[][] = []
  let current: StoredEntry[] = []
  let chunkBytes = 2
  let totalBytes = 0
  for (const tuple of tuples) {
    const size = encoder.encode(JSON.stringify(tuple)).length + 1
    if (totalBytes + size > MAX_PERSISTED_BYTES) {
      break
    }
    if (current.length > 0 && chunkBytes + size > INDEX_CHUNK_BYTES) {
      chunks.push(current)
      current = []
      chunkBytes = 2
      if (chunks.length >= MAX_INDEX_CHUNKS) {
        break
      }
    }
    current.push(tuple)
    chunkBytes += size
    totalBytes += size
  }
  if (current.length > 0 && chunks.length < MAX_INDEX_CHUNKS) {
    chunks.push(current)
  }
  for (let i = 0; i < chunks.length; i += 1) {
    await storage.set(`${INDEX_STORE_PREFIX}.c${i}`, chunks[i])
  }
  const kept = chunks.reduce((count, chunk) => count + chunk.length, 0)
  const header: IndexHeader = {
    version: 1,
    fingerprint: connectionFingerprint(connection),
    builtAt: Date.now(),
    complete: snapshot.complete,
    truncated: snapshot.truncated || kept < tuples.length,
    chunkCount: chunks.length
  }
  await storage.set(`${INDEX_STORE_PREFIX}.header`, header)
}

function parseStoredEntry(value: unknown): StoredEntry | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null
  }
  const [name, path, dir] = value
  if (typeof name !== 'string' || typeof path !== 'string' || (dir !== 0 && dir !== 1)) {
    return null
  }
  return [name, path, dir]
}

export async function restoreIndex(
  storage: IndexStorage,
  connection: NextcloudConnection
): Promise<IndexSnapshot | null> {
  const raw = await storage.get(`${INDEX_STORE_PREFIX}.header`)
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null
  }
  if (
    !('version' in raw) ||
    raw.version !== 1 ||
    !('fingerprint' in raw) ||
    raw.fingerprint !== connectionFingerprint(connection) ||
    !('builtAt' in raw) ||
    typeof raw.builtAt !== 'number' ||
    !('complete' in raw) ||
    typeof raw.complete !== 'boolean' ||
    !('truncated' in raw) ||
    typeof raw.truncated !== 'boolean' ||
    !('chunkCount' in raw) ||
    typeof raw.chunkCount !== 'number'
  ) {
    return null
  }
  const chunkCount = Math.max(0, Math.min(MAX_INDEX_CHUNKS, Math.floor(raw.chunkCount)))
  const entries: KbEntry[] = []
  for (let i = 0; i < chunkCount; i += 1) {
    const chunk = await storage.get(`${INDEX_STORE_PREFIX}.c${i}`)
    if (!Array.isArray(chunk)) {
      return null
    }
    for (const item of chunk) {
      const stored = parseStoredEntry(item)
      if (stored === null) {
        return null
      }
      entries.push({
        name: stored[0],
        path: stored[1],
        dir: stored[2] === 1,
        size: 0,
        modifiedMs: null,
        etag: null,
        fileId: null
      })
    }
  }
  if (entries.length === 0) {
    return null
  }
  return {
    entries,
    complete: raw.complete,
    truncated: raw.truncated || entries.length > MAX_PERSISTED_ENTRIES,
    builtAt: Date.now()
  }
}
