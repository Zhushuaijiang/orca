import { readdirSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import { readDfHisEnvironmentConfigSync } from '../dfhis-environment/config'
import SyncDatabase from '../sqlite/sync-database'
import {
  kimiSessionIndexPathFromStatePath,
  readKimiWorkDirBySessionId,
  resolveKimiSessionsDir
} from './session-scanner-kimi-paths'
import { parseOpenCodeSqliteSession } from './session-scanner-opencode-sqlite'
import { parseAgentSessionFileCached } from './session-scanner-parse-cache'
import type { SessionFileCandidate } from './session-scanner-types'
import { extractString, parseJsonObject } from './session-scanner-values'

// Why: requirement ids live in agent-owned metadata stores (codex threads table,
// opencode session/part tables, kimi state.json + session index), so a query is
// a handful of SQL/readdir lookups instead of a transcript corpus scan.
export type YunxiaoSearchOptions = {
  codexHomeDir?: string
  opencodeDbPath?: string
  kimiSessionsDir?: string
  archiveWorkspacePath?: string
}

function compactId(value: string): string {
  return value.replace(/[^a-z0-9]+/g, '')
}

function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

function matchesText(
  text: string | null | undefined,
  normalized: string,
  compact: string
): boolean {
  if (!text) {
    return false
  }
  const lowered = text.toLowerCase()
  return lowered.includes(normalized) || (compact !== '' && compactId(lowered).includes(compact))
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
      return lowered === normalized || (compact !== '' && compactId(lowered) === compact)
    })
    .map((name) => join(root, name))
}

function codexStateDbPath(homeDir: string): string | null {
  let best: { path: string; version: number } | null = null
  for (const name of readdirSyncSafe(homeDir)) {
    const match = /^state_(\d+)\.sqlite$/.exec(name)
    const version = match ? Number(match[1]) : Number.NaN
    if (match && (!best || version > best.version)) {
      best = { path: join(homeDir, name), version }
    }
  }
  return best?.path ?? null
}

function readdirSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

type CodexThreadRow = {
  rollout_path: string | null
  cwd: string | null
  title: string | null
  first_user_message: string | null
  preview: string | null
}

function searchCodexRollouts(
  dbPath: string,
  normalized: string,
  compact: string,
  dirs: string[]
): string[] {
  let db: SyncDatabase | null = null
  try {
    db = new SyncDatabase(dbPath, { readonly: true, fileMustExist: true })
    const rows = db
      .prepare('SELECT rollout_path, cwd, title, first_user_message, preview FROM threads')
      .all() as CodexThreadRow[]
    return rows
      .filter(
        (row) =>
          matchesText(row.title, normalized, compact) ||
          matchesText(row.first_user_message, normalized, compact) ||
          matchesText(row.preview, normalized, compact) ||
          (row.cwd !== null && dirs.some((dir) => isPathInsideOrEqual(dir, row.cwd as string)))
      )
      .map((row) => row.rollout_path)
      .filter((path): path is string => typeof path === 'string' && path !== '')
  } catch {
    return []
  } finally {
    db?.close()
  }
}

function searchOpencodeSessionIds(dbPath: string, normalized: string, dirs: string[]): string[] {
  let db: SyncDatabase | null = null
  try {
    db = new SyncDatabase(dbPath, { readonly: true, fileMustExist: true })
    const ids = new Set<string>()
    const rows = db.prepare('SELECT id, directory, title FROM session').all() as {
      id: string
      directory: string | null
      title: string | null
    }[]
    for (const row of rows) {
      const loweredTitle = row.title?.toLowerCase() ?? ''
      if (
        loweredTitle.includes(normalized) ||
        (row.directory !== null &&
          dirs.some((dir) => isPathInsideOrEqual(dir, row.directory as string)))
      ) {
        ids.add(row.id)
      }
    }
    const partRows = db
      .prepare('SELECT DISTINCT session_id FROM part WHERE data LIKE ? ESCAPE ?')
      .all(likePattern(normalized), '\\') as { session_id: string }[]
    for (const row of partRows) {
      ids.add(row.session_id)
    }
    return [...ids]
  } catch {
    return []
  } finally {
    db?.close()
  }
}

async function searchKimiStatePaths(
  sessionsDir: string,
  normalized: string,
  compact: string,
  dirs: string[]
): Promise<string[]> {
  const hits: string[] = []
  let workspaceEntries: string[]
  try {
    workspaceEntries = (await readdir(sessionsDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
  for (const workspaceName of workspaceEntries) {
    const workspaceDir = join(sessionsDir, workspaceName)
    let sessionNames: string[]
    try {
      sessionNames = (await readdir(workspaceDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    } catch {
      continue
    }
    for (const sessionName of sessionNames) {
      const statePath = join(workspaceDir, sessionName, 'state.json')
      let record: Record<string, unknown> | null
      try {
        record = parseJsonObject(await readFile(statePath, 'utf-8'))
      } catch {
        continue
      }
      const workDirs = await readKimiWorkDirBySessionId(
        kimiSessionIndexPathFromStatePath(statePath)
      )
      const cwd = workDirs.get(sessionName) ?? null
      if (
        matchesText(extractString(record?.title), normalized, compact) ||
        matchesText(extractString(record?.lastPrompt), normalized, compact) ||
        (cwd !== null && dirs.some((dir) => isPathInsideOrEqual(dir, cwd)))
      ) {
        hits.push(statePath)
      }
    }
  }
  return hits
}

async function parseFileCandidate(
  agent: 'codex' | 'kimi',
  path: string
): Promise<AiVaultSession | null> {
  try {
    const fileStat = await stat(path)
    const candidate: SessionFileCandidate = {
      agent,
      file: {
        path,
        mtimeMs: fileStat.mtimeMs,
        modifiedAt: fileStat.mtime.toISOString(),
        sizeBytes: fileStat.size
      },
      codexHome: null
    }
    return await parseAgentSessionFileCached(candidate, process.platform)
  } catch {
    return null
  }
}

export async function searchYunxiaoSessions(
  yunxiaoId: string,
  options: YunxiaoSearchOptions = {}
): Promise<{ sessions: AiVaultSession[] }> {
  const normalized = yunxiaoId.trim().toLowerCase().slice(0, 200)
  if (!normalized) {
    return { sessions: [] }
  }
  const compact = compactId(normalized)
  const root = options.archiveWorkspacePath ?? readDfHisEnvironmentConfigSync().archiveWorkspacePath
  const dirs = await matchedRequirementDirs(root, normalized, compact)

  const codexDb = options.codexHomeDir
    ? codexStateDbPath(options.codexHomeDir)
    : codexStateDbPath(join(homedir(), '.codex'))
  const opencodeDb =
    options.opencodeDbPath ?? join(homedir(), '.local', 'share', 'opencode', 'opencode.db')
  const kimiSessions = options.kimiSessionsDir ?? resolveKimiSessionsDir()

  const [codexRollouts, opencodeIds, kimiStates] = await Promise.all([
    Promise.resolve(codexDb ? searchCodexRollouts(codexDb, normalized, compact, dirs) : []),
    Promise.resolve(searchOpencodeSessionIds(opencodeDb, normalized, dirs)),
    searchKimiStatePaths(kimiSessions, normalized, compact, dirs)
  ])

  const parsed = await Promise.all([
    ...codexRollouts.map((path) => parseFileCandidate('codex', path)),
    ...kimiStates.map((path) => parseFileCandidate('kimi', path)),
    ...opencodeIds.map((sessionId) =>
      parseOpenCodeSqliteSession({
        dbPath: opencodeDb,
        sessionId,
        platform: process.platform
      }).catch(() => null)
    )
  ])

  const byId = new Map<string, AiVaultSession>()
  for (const session of parsed) {
    if (session && !byId.has(session.id)) {
      byId.set(session.id, session)
    }
  }
  const sessions = [...byId.values()].sort(
    (left, right) =>
      Date.parse(right.updatedAt ?? right.modifiedAt) -
      Date.parse(left.updatedAt ?? left.modifiedAt)
  )
  return { sessions }
}
