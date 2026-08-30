import type { AiVaultAgent, AiVaultScanIssue } from '../../shared/ai-vault-types'
import { buildZcodeSqliteCandidatePath } from './session-scanner-zcode-sqlite-paths'
import { readZcodeDatabase, zcodeDatabaseScanIssue } from './session-scanner-zcode-sqlite-open'
import type { SessionFileCandidate } from './session-scanner-types'
import type SyncDatabase from '../sqlite/sync-database'
import { columnExists, tableExists } from '../opencode-usage/schema-helpers'

// Why: ZCode (OpenCode-family storage) keeps every session in one SQLite DB at
// ~/.zcode/cli/db/db.sqlite. Listing needs only identity and recency; the parse
// path loads metadata only for candidates it actually uses.

type SessionRow = {
  id: string
  time_created: number
  time_updated: number
}

function canReadZcodeSessions(db: SyncDatabase): boolean {
  return (
    tableExists(db, 'session') &&
    columnExists(db, 'session', 'time_created') &&
    columnExists(db, 'session', 'time_updated')
  )
}

function buildSessionListQuery(db: SyncDatabase, limited: boolean): string {
  // Why: OpenCode-family stores mark child sessions (parent_id) and archived
  // sessions (time_archived); neither is independently resumable, so both stay
  // out of the list. Column-guarded so an older schema without them still lists.
  const parentIdPredicate = columnExists(db, 'session', 'parent_id') ? 'AND parent_id IS NULL' : ''
  const archivedPredicate = columnExists(db, 'session', 'time_archived')
    ? 'AND time_archived IS NULL'
    : ''

  return `SELECT id, time_created, time_updated
          FROM session
          WHERE 1=1 ${parentIdPredicate} ${archivedPredicate}
          ORDER BY CASE WHEN time_updated > 0 THEN time_updated ELSE time_created END DESC
          ${limited ? 'LIMIT ?' : ''}`
}

function rowToCandidate(row: SessionRow, dbPath: string): SessionFileCandidate {
  const mtimeMs =
    typeof row.time_updated === 'number' && row.time_updated > 0
      ? row.time_updated
      : row.time_created
  return {
    agent: 'zcode' as AiVaultAgent,
    file: {
      path: buildZcodeSqliteCandidatePath(dbPath, row.id),
      mtimeMs,
      modifiedAt: new Date(mtimeMs).toISOString()
    },
    codexHome: null
  }
}

/**
 * List ZCode sessions from one or more SQLite databases as synthetic
 * `SessionFileCandidate` entries. Each candidate's file path is a synthetic
 * `<dbPath>#<sessionId>` string that the parser dispatcher routes to
 * `parseZcodeSqliteSession`. Databases that lack the `session` table are
 * silently skipped; errors are recorded as scan issues.
 * @param args.dbPaths - Absolute paths to db.sqlite files to scan.
 * @param args.limit - Maximum number of sessions to return per database.
 * @param args.issues - Collected scan issues to append errors to.
 * @returns Array of synthetic candidates sorted by effective recency.
 */
export async function listZcodeSqliteSessions(args: {
  dbPaths: readonly string[]
  limit: number
  issues: AiVaultScanIssue[]
}): Promise<SessionFileCandidate[]> {
  const candidates: SessionFileCandidate[] = []
  for (const dbPath of args.dbPaths) {
    try {
      const rows = readZcodeDatabase({
        dbPath,
        read: (db) => readSessionRows(db, args.limit)
      })
      for (const row of rows) {
        candidates.push(rowToCandidate(row, dbPath))
      }
    } catch (err) {
      // A whole DB failed, not one transcript: kinded so the panel says so.
      args.issues.push(zcodeDatabaseScanIssue(dbPath, err))
    }
  }
  return candidates.sort((left, right) => right.file.mtimeMs - left.file.mtimeMs)
}

function readSessionRows(db: SyncDatabase, limit: number): SessionRow[] {
  if (!canReadZcodeSessions(db)) {
    return []
  }
  const limited = Number.isFinite(limit)
  const statement = db.prepare(buildSessionListQuery(db, limited))
  return (limited ? statement.all(limit) : statement.all()) as SessionRow[]
}
