import { basename } from 'node:path'

// Why: keep the synthetic candidate-path helpers separate from the SQLite
// discovery/parser (mirroring the OpenCode split) so both the scanner and the
// agent-parser dispatcher can import them without pulling SyncDatabase in.

const ZCODE_SQLITE_PATH_SEPARATOR = '#'

/**
 * Build a synthetic candidate path that encodes the SQLite DB path and session
 * ID as `<dbPath>#<sessionId>`. Used by the discovery layer so SQLite-backed
 * ZCode sessions flow through the same FileWithMtime pipeline as file-backed
 * agents.
 * @param dbPath - Absolute path to the db.sqlite file.
 * @param sessionId - The ZCode session ID (primary key in the session table).
 * @returns The synthetic candidate path string.
 */
export function buildZcodeSqliteCandidatePath(dbPath: string, sessionId: string): string {
  return `${dbPath}${ZCODE_SQLITE_PATH_SEPARATOR}${sessionId}`
}

/**
 * Parse a synthetic candidate path back into its DB path and session ID parts.
 * Validates that the DB basename is `db*.sqlite` so real filesystem paths that
 * happen to contain `#` are never misrouted to the SQLite parser.
 * @param candidatePath - The synthetic path to parse.
 * @returns `{ dbPath, sessionId }` if the path is a valid synthetic candidate, `null` otherwise.
 */
export function splitZcodeSqliteCandidate(
  candidatePath: string
): { dbPath: string; sessionId: string } | null {
  const separatorIndex = candidatePath.lastIndexOf(ZCODE_SQLITE_PATH_SEPARATOR)
  if (separatorIndex <= 0 || separatorIndex === candidatePath.length - 1) {
    return null
  }
  const dbPath = candidatePath.slice(0, separatorIndex)
  const sessionId = candidatePath.slice(separatorIndex + 1)
  if (!dbPath || !sessionId) {
    return null
  }
  // Why: ZCode's store is db.sqlite (dash-suffixed profile variants allowed) so
  // a real path that merely contains '#' is never misrouted to this parser.
  if (!/^db(?:-[A-Za-z0-9_.-]+)?\.sqlite$/i.test(basename(dbPath))) {
    return null
  }
  return { dbPath, sessionId }
}
