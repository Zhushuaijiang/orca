import { createReadStream } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import type { AiVaultAgent, AiVaultSession } from '../../shared/ai-vault-types'
import { readDfHisEnvironmentConfigSync } from '../dfhis-environment/config'
import { getCanonicalUserDataPath } from '../persistence'
import {
  kimiPrimaryAgentWirePath,
  kimiSessionIdFromStatePath,
  kimiSessionIndexPathFromStatePath,
  readKimiWorkDirBySessionId
} from './session-scanner-kimi-paths'
import { parseAgentSessionFileCached } from './session-scanner-parse-cache'
import { discoverAiVaultSessionSources } from './session-scanner-source-discovery'
import type { SessionFileCandidate } from './session-scanner-types'
import { asRecord, extractString, parseJsonObject } from './session-scanner-values'

// Why: requirement ids (DFHIS-31782) are uppercase-prefixed; lowercase model or
// branch tokens would flood the index with noise.
const YUNXIAO_TOKEN_PATTERN = /[A-Z][A-Z0-9_]{1,15}-\d{1,8}(?!\d)/g
const INDEX_SCHEMA_VERSION = 1
const INDEX_DISCOVERY_LIMIT = 100_000
const SCAN_CONCURRENCY = 8
const MAX_IDS_PER_FILE = 500
const CHUNK_SIZE = 4 * 1024 * 1024
// Longer than any token so tokens straddling a chunk boundary survive in carry.
const CHUNK_OVERLAP = 64
const INDEXED_AGENTS = new Set<AiVaultAgent>(['codex', 'kimi'])

export type YunxiaoIndexOptions = {
  codexSessionsDir?: string
  kimiSessionsDir?: string
  archiveWorkspacePath?: string
  indexPath?: string
}

type YunxiaoIndexEntry = {
  agent: AiVaultAgent
  mtimeMs: number
  sizeBytes: number | null
  cwd: string | null
  ids: string[]
}

let entries = new Map<string, YunxiaoIndexEntry>()
let loadedFromPath: string | null = null
let buildPromise: Promise<void> | null = null

export function resetYunxiaoIndexForTests(): void {
  entries = new Map()
  loadedFromPath = null
  buildPromise = null
}

function indexPathFor(options: YunxiaoIndexOptions): string {
  return (
    options.indexPath ?? join(getCanonicalUserDataPath(), 'ai-vault', 'yunxiao-session-index.json')
  )
}

async function loadPersistedEntries(options: YunxiaoIndexOptions): Promise<void> {
  const indexPath = indexPathFor(options)
  if (loadedFromPath === indexPath) {
    return
  }
  loadedFromPath = indexPath
  entries = new Map()
  try {
    const file = JSON.parse(await readFile(indexPath, 'utf-8')) as {
      schemaVersion?: unknown
      entries?: unknown
    }
    if (file.schemaVersion !== INDEX_SCHEMA_VERSION || !Array.isArray(file.entries)) {
      return
    }
    for (const item of file.entries) {
      if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string') {
        continue
      }
      const entry = item[1] as YunxiaoIndexEntry
      if (typeof entry?.mtimeMs === 'number' && Array.isArray(entry.ids)) {
        entries.set(item[0], entry)
      }
    }
  } catch {
    // Missing/corrupt index degrades to a full rebuild.
  }
}

async function persistEntries(options: YunxiaoIndexOptions): Promise<void> {
  try {
    await writeFile(
      indexPathFor(options),
      JSON.stringify({ schemaVersion: INDEX_SCHEMA_VERSION, entries: [...entries.entries()] }),
      'utf-8'
    )
  } catch {
    // A failed save just costs a rebuild next launch.
  }
}

function collectIds(text: string, into: Set<string>): void {
  if (into.size >= MAX_IDS_PER_FILE) {
    return
  }
  for (const token of text.match(YUNXIAO_TOKEN_PATTERN) ?? []) {
    into.add(token.toLowerCase())
    if (into.size >= MAX_IDS_PER_FILE) {
      return
    }
  }
}

// Why: chunked Buffer-level scanning reads gigabyte corpora at disk speed; the
// JSONL parsers (line split + JSON.parse) are what made cold scans slow.
async function scanTranscriptForIds(path: string): Promise<string[]> {
  const ids = new Set<string>()
  let carry = ''
  await new Promise<void>((resolve) => {
    const stream = createReadStream(path, { encoding: 'utf-8', highWaterMark: CHUNK_SIZE })
    stream.on('data', (chunk: string) => {
      const text = carry + chunk
      carry = text.slice(-CHUNK_OVERLAP)
      collectIds(text, ids)
      if (ids.size >= MAX_IDS_PER_FILE) {
        stream.destroy()
      }
    })
    stream.on('error', () => resolve())
    stream.on('close', () => resolve())
  })
  return [...ids]
}

async function readCodexCwd(path: string): Promise<string | null> {
  const lines = createInterface({ input: createReadStream(path, 'utf-8'), crlfDelay: Infinity })
  let read = 0
  try {
    for await (const line of lines) {
      if (read++ >= 5) {
        break
      }
      const cwd = extractString(asRecord(parseJsonObject(line)?.payload)?.cwd)
      if (cwd) {
        return cwd
      }
    }
  } catch {
    return null
  } finally {
    lines.close()
  }
  return null
}

async function scanCandidate(
  candidate: SessionFileCandidate
): Promise<{ cwd: string | null; ids: string[] }> {
  if (candidate.agent === 'codex') {
    const [cwd, ids] = await Promise.all([
      readCodexCwd(candidate.file.path),
      scanTranscriptForIds(candidate.file.path)
    ])
    return { cwd, ids }
  }
  // Kimi: metadata lives in state.json + the shared session index; conversation
  // text in the sibling wire transcript.
  let record: Record<string, unknown> | null = null
  try {
    record = parseJsonObject(await readFile(candidate.file.path, 'utf-8'))
  } catch {
    record = null
  }
  const workDirs = await readKimiWorkDirBySessionId(
    kimiSessionIndexPathFromStatePath(candidate.file.path)
  )
  const cwd = workDirs.get(kimiSessionIdFromStatePath(candidate.file.path)) ?? null
  return {
    cwd,
    ids: await scanTranscriptForIds(kimiPrimaryAgentWirePath(candidate.file.path, record))
  }
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(SCAN_CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        await worker(items[next++])
      }
    })
  )
}

async function ensureIndexBuilt(options: YunxiaoIndexOptions): Promise<void> {
  buildPromise ??= (async () => {
    await loadPersistedEntries(options)
    const discoveries = await discoverAiVaultSessionSources({
      options: {
        codexSessionsDir: options.codexSessionsDir,
        kimiSessionsDir: options.kimiSessionsDir
      },
      limitPerAgent: INDEX_DISCOVERY_LIMIT,
      issues: []
    })
    const candidates: SessionFileCandidate[] = discoveries.flatMap((discovery) =>
      INDEXED_AGENTS.has(discovery.agent)
        ? discovery.files.map((file) => ({ agent: discovery.agent, file, codexHome: null }))
        : []
    )
    const seen = new Set<string>()
    const changed: SessionFileCandidate[] = []
    for (const candidate of candidates) {
      seen.add(candidate.file.path)
      const entry = entries.get(candidate.file.path)
      if (
        !entry ||
        entry.agent !== candidate.agent ||
        entry.mtimeMs !== candidate.file.mtimeMs ||
        entry.sizeBytes !== (candidate.file.sizeBytes ?? null)
      ) {
        changed.push(candidate)
      }
    }
    for (const path of entries.keys()) {
      if (!seen.has(path)) {
        entries.delete(path)
      }
    }
    if (changed.length > 0) {
      await runPool(changed, async (candidate) => {
        const scanned = await scanCandidate(candidate)
        entries.set(candidate.file.path, {
          agent: candidate.agent,
          mtimeMs: candidate.file.mtimeMs,
          sizeBytes: candidate.file.sizeBytes ?? null,
          cwd: scanned.cwd,
          ids: scanned.ids
        })
      })
      await persistEntries(options)
    }
  })().finally(() => {
    buildPromise = null
  })
  return buildPromise
}

// Why: the one-time raw scan of the transcript corpus runs minutes on large
// corpora; start it shortly after launch so the first tab query is warm, and
// unref so a quick quit isn't held open by the timer.
export function scheduleYunxiaoIndexWarmup(delayMs = 15_000): void {
  const timer = setTimeout(() => {
    void ensureIndexBuilt({}).catch(() => undefined)
  }, delayMs)
  timer.unref?.()
}

function compactId(value: string): string {
  return value.replace(/[^a-z0-9]+/g, '')
}

async function matchedRequirementDirs(
  root: string,
  normalized: string,
  compact: string
): Promise<string[]> {
  let names: string[]
  try {
    names = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
  return names
    .filter((name) => {
      const lowered = name.toLowerCase()
      return lowered === normalized || (compact && compactId(lowered) === compact)
    })
    .map((name) => join(root, name))
}

export async function searchYunxiaoSessions(
  yunxiaoId: string,
  options: YunxiaoIndexOptions = {}
): Promise<{ sessions: AiVaultSession[] }> {
  const normalized = yunxiaoId.trim().toLowerCase()
  if (!normalized) {
    return { sessions: [] }
  }
  await ensureIndexBuilt(options)
  const compact = compactId(normalized)
  const root = options.archiveWorkspacePath ?? readDfHisEnvironmentConfigSync().archiveWorkspacePath
  const dirs = await matchedRequirementDirs(root, normalized, compact)

  const hits: SessionFileCandidate[] = []
  for (const [path, entry] of entries) {
    const tokenHit = entry.ids.some(
      (id) =>
        id.includes(normalized) || (compact && id.replace(/[^a-z0-9]+/g, '').includes(compact))
    )
    const cwd = entry.cwd
    const cwdHit = cwd !== null && dirs.some((dir) => isPathInsideOrEqual(dir, cwd))
    if (tokenHit || cwdHit) {
      hits.push({
        agent: entry.agent,
        file: {
          path,
          mtimeMs: entry.mtimeMs,
          modifiedAt: new Date(entry.mtimeMs).toISOString(),
          sizeBytes: entry.sizeBytes ?? undefined
        },
        codexHome: null
      })
    }
  }

  const parsed = await Promise.all(
    hits.map((candidate) => parseAgentSessionFileCached(candidate, process.platform))
  )
  const sessions = parsed
    .filter((session): session is AiVaultSession => session !== null)
    .sort(
      (left, right) =>
        Date.parse(right.updatedAt ?? right.modifiedAt) -
        Date.parse(left.updatedAt ?? left.modifiedAt)
    )
  return { sessions }
}
