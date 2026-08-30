import { basename } from 'node:path'
import type { AiVaultScanIssue } from '../../shared/ai-vault-types'
import { isWslUncPath } from '../../shared/wsl-paths'
import SyncDatabase from '../sqlite/sync-database'
import { classifySqliteReadFailure } from '../sqlite/sqlite-read-failure'
import { openCodeBusyTimeoutMs } from './session-scanner-opencode-sqlite-open'
import { errorMessage } from './session-scanner-values'

// Why (#15036, measured on the OpenCode twin): SQLite's 0 ms default busy
// timeout fails a contended open in ~1 ms, and over a \\wsl.localhost share
// Windows cannot take SQLite's locks at all, so waiting there is provably
// useless. The policy is shared with the OpenCode reader for exactly this
// reason; only the agent copy below differs.

/**
 * Run one synchronous read against a ZCode database.
 *
 * Read-only, plus `query_only` as a belt-and-suspenders guard so a bug in a
 * SELECT list can never mutate the user's db.sqlite.
 * @param args.dbPath - Absolute path to a db.sqlite file.
 * @param args.read - Synchronous reader; its result must be fully materialized.
 * @returns The reader's value; rethrows whatever SQLite raised.
 */
export function readZcodeDatabase<T>(args: { dbPath: string; read: (db: SyncDatabase) => T }): T {
  const db = new SyncDatabase(args.dbPath, {
    readonly: true,
    fileMustExist: true,
    timeout: openCodeBusyTimeoutMs(args.dbPath)
  })
  try {
    db.pragma('query_only = ON')
    return args.read(db)
  } finally {
    db.close()
  }
}

/**
 * Describe a whole-database read failure as a scan issue.
 *
 * Kinded so the panel renders this copy instead of counting a failed *source*
 * as a skipped *transcript* (same shape as the OpenCode twin).
 * @param dbPath - Absolute path to the db.sqlite that could not be read.
 * @param error - The thrown value from the read.
 * @returns A kinded scan issue with actionable copy.
 */
export function zcodeDatabaseScanIssue(dbPath: string, error: unknown): AiVaultScanIssue {
  const name = basename(dbPath)
  const kind = classifySqliteReadFailure({ error, databaseFileExists: true })
  const overWslShare = isWslUncPath(dbPath)
  const detail =
    kind === 'contended' && !overWslShare
      ? `ZCode is writing to ${name} right now, so its history was skipped. It is read again on the next refresh.`
      : kind === 'unreadable'
        ? `ZCode history in ${name} could not be read: ${errorMessage(error)}`
        : `ZCode history in ${name} could not be read. ${
            overWslShare
              ? 'Windows cannot open SQLite databases over the \\\\wsl.localhost share, so this history has to be read from inside the distro.'
              : 'Its write-ahead log cannot be opened read-only on this filesystem. Exit ZCode cleanly to flush the log.'
          }`
  return { agent: 'zcode', kind: 'scope', path: dbPath, message: detail }
}
