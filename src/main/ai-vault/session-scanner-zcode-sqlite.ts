import type { AiVaultSession, AiVaultSessionPreviewMessage } from '../../shared/ai-vault-types'
import {
  addPreviewMessage,
  createAccumulator,
  finalizeSession,
  updateTimeline
} from './session-scanner-accumulator'
import {
  normalizeFullFirstUserPromptText,
  shouldCaptureFullFirstUserPrompt
} from './session-scanner-first-user-prompt'
import { readZcodeDatabase } from './session-scanner-zcode-sqlite-open'
import { normalizeTitleText } from './session-scanner-values'
import type SyncDatabase from '../sqlite/sync-database'
import { columnExists, tableExists } from '../opencode-usage/schema-helpers'

// Why: ZCode persists sessions in one SQLite DB (~/.zcode/cli/db/db.sqlite) with
// an OpenCode-family three-table schema. Only the session columns above were
// verifiable from the CLI bundle; message/part bodies were not, so the preview
// reader probes the schema at runtime and degrades to title+timestamps when
// neither known shape matches.

const ZCODE_SQLITE_PREVIEW_LIMIT = 5
// Why (#8864 twin): join preview parts against only the newest N messages so a
// heavy session's tool-output blobs cannot turn every refresh into a full scan.
const ZCODE_SQLITE_PREVIEW_MESSAGE_WINDOW = 100
const ZCODE_FIRST_USER_PROMPT_PART_LIMIT = 512

type SessionRow = {
  id: string
  title: string | null
  directory: string | null
  time_created: number
  time_updated: number
}

type PreviewRow = {
  role: string | null
  text: string | null
  part_data: string | null
  time_created: number
}

// The two message/part layouts this reader understands. 'columns' is the
// flattened shape (message.role + part.text); 'opencode-json' is OpenCode's
// message.data/part.data JSON documents. null means: no preview, count 0.
type ZcodePreviewShape = 'columns' | 'opencode-json' | null

function probeZcodePreviewShape(db: SyncDatabase): ZcodePreviewShape {
  if (!tableExists(db, 'message') || !tableExists(db, 'part')) {
    return null
  }
  if (
    columnExists(db, 'message', 'session_id') &&
    columnExists(db, 'message', 'id') &&
    columnExists(db, 'message', 'role') &&
    columnExists(db, 'message', 'time_created') &&
    columnExists(db, 'part', 'message_id') &&
    columnExists(db, 'part', 'text')
  ) {
    return 'columns'
  }
  if (
    columnExists(db, 'message', 'session_id') &&
    columnExists(db, 'message', 'id') &&
    columnExists(db, 'message', 'time_created') &&
    columnExists(db, 'message', 'data') &&
    columnExists(db, 'part', 'message_id') &&
    columnExists(db, 'part', 'time_created') &&
    columnExists(db, 'part', 'data')
  ) {
    return 'opencode-json'
  }
  return null
}

function messageCountQuery(db: SyncDatabase, shape: ZcodePreviewShape): string | null {
  if (!shape || !columnExists(db, 'message', 'session_id')) {
    return null
  }
  const rolePredicate =
    shape === 'columns'
      ? `role IN ('user','assistant')`
      : `json_extract(data, '$.role') IN ('user','assistant')`
  return `SELECT COUNT(*) AS count FROM message
          WHERE session_id = ? AND ${rolePredicate}`
}

const NON_EMPTY_TEXT_COLUMNS = `p.text IS NOT NULL AND TRIM(p.text) <> ''`

function buildPreviewQuery(shape: ZcodePreviewShape): string | null {
  if (!shape) {
    return null
  }
  if (shape === 'columns') {
    return `SELECT m.role AS role, p.text AS text, NULL AS part_data, m.time_created
            FROM (SELECT id, role, time_created FROM message
                  WHERE session_id = ?
                  ORDER BY time_created DESC, id DESC
                  LIMIT ${ZCODE_SQLITE_PREVIEW_MESSAGE_WINDOW}) m
            JOIN part p ON p.message_id = m.id
            WHERE m.role IN ('user','assistant') AND ${NON_EMPTY_TEXT_COLUMNS}
            ORDER BY m.time_created DESC, p.rowid DESC
            LIMIT ?`
  }
  return `SELECT json_extract(m.data, '$.role') AS role, NULL AS text, p.data AS part_data, m.time_created
          FROM (SELECT id, data, time_created FROM message
                WHERE session_id = ?
                ORDER BY time_created DESC, id DESC
                LIMIT ${ZCODE_SQLITE_PREVIEW_MESSAGE_WINDOW}) m
          JOIN part p ON p.message_id = m.id
          WHERE json_extract(m.data, '$.role') IN ('user','assistant')
            AND json_extract(p.data, '$.type') = 'text'
          ORDER BY m.time_created DESC, p.time_created DESC
          LIMIT ?`
}

function previewRowText(row: PreviewRow): string | null {
  if (row.text !== null && row.text !== undefined) {
    return row.text
  }
  if (!row.part_data) {
    return null
  }
  try {
    const parsed = JSON.parse(row.part_data) as unknown
    const record =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    return typeof record?.text === 'string' ? record.text : null
  } catch {
    return null
  }
}

function mapPreviewRole(role: string | null): AiVaultSessionPreviewMessage['role'] {
  if (role === 'user' || role === 'assistant' || role === 'system' || role === 'tool') {
    return role
  }
  return 'unknown'
}

function buildFirstUserPromptQuery(shape: ZcodePreviewShape): string | null {
  if (!shape) {
    return null
  }
  if (shape === 'columns') {
    return `SELECT p.text AS text
            FROM part p
            WHERE p.message_id = (
                    SELECT m.id
                    FROM message m
                    JOIN part fp ON fp.message_id = m.id
                    WHERE m.session_id = ?
                      AND m.role = 'user' AND ${NON_EMPTY_TEXT_COLUMNS}
                    ORDER BY m.time_created ASC, m.id ASC
                    LIMIT 1
                  )
              AND ${NON_EMPTY_TEXT_COLUMNS}
            ORDER BY p.rowid ASC
            LIMIT ${ZCODE_FIRST_USER_PROMPT_PART_LIMIT}`
  }
  return `SELECT p.data AS part_data
          FROM part p
          WHERE p.message_id = (
                  SELECT m.id
                  FROM message m
                  JOIN part fp ON fp.message_id = m.id
                  WHERE m.session_id = ?
                    AND json_extract(m.data, '$.role') = 'user'
                    AND json_extract(fp.data, '$.type') = 'text'
                  ORDER BY m.time_created ASC, m.id ASC
                  LIMIT 1
                )
            AND json_extract(p.data, '$.type') = 'text'
          ORDER BY p.time_created ASC, p.rowid ASC
          LIMIT ${ZCODE_FIRST_USER_PROMPT_PART_LIMIT}`
}

function readFirstUserPromptFromZcodeDb(
  db: SyncDatabase,
  shape: ZcodePreviewShape,
  sessionId: string
): string | null {
  const sql = buildFirstUserPromptQuery(shape)
  if (!sql) {
    return null
  }
  try {
    const rows = db.prepare(sql).all(sessionId) as PreviewRow[]
    const parts: string[] = []
    for (const row of rows) {
      const text = previewRowText(row)
      if (text) {
        parts.push(text)
      }
    }
    return parts.length > 0 ? normalizeFullFirstUserPromptText(parts.join('\n')) : null
  } catch {
    return null
  }
}

/**
 * Parse a single ZCode session from the SQLite database into an
 * `AiVaultSession`. Reads session metadata (title, cwd, timestamps) and, when
 * the message/part tables match a known shape, up to 5 preview messages plus a
 * message count. Unknown message/part schemas degrade to title+timestamps
 * rather than failing the row.
 * @param args.dbPath - Absolute path to the db.sqlite file.
 * @param args.sessionId - The session ID (primary key in the `session` table).
 * @param args.platform - The platform to use for resume command generation.
 * @returns The parsed `AiVaultSession`, or `null` if the session does not exist
 *   or the database lacks the required schema.
 */
export async function parseZcodeSqliteSession(args: {
  dbPath: string
  sessionId: string
  platform: NodeJS.Platform
}): Promise<AiVaultSession | null> {
  return readZcodeDatabase({
    dbPath: args.dbPath,
    read: (db) => readSession({ db, ...args })
  })
}

// Extracted so the open wrapper owns the handle's lifetime.
function readSession(args: {
  db: SyncDatabase
  dbPath: string
  sessionId: string
  platform: NodeJS.Platform
}): AiVaultSession | null {
  const { db, dbPath, sessionId, platform } = args
  if (
    !tableExists(db, 'session') ||
    !columnExists(db, 'session', 'time_created') ||
    !columnExists(db, 'session', 'time_updated')
  ) {
    return null
  }
  const titleColumn = columnExists(db, 'session', 'title') ? 'title' : 'NULL'
  const directoryColumn = columnExists(db, 'session', 'directory') ? 'directory' : 'NULL'
  const row = db
    .prepare(
      `SELECT id, ${titleColumn} AS title, ${directoryColumn} AS directory,
              time_created, time_updated
       FROM session WHERE id = ? LIMIT 1`
    )
    .get(sessionId) as SessionRow | undefined
  if (!row || row.id !== sessionId) {
    return null
  }

  const mtimeMs =
    typeof row.time_updated === 'number' && row.time_updated > 0
      ? row.time_updated
      : row.time_created
  // Why: discovery uses a synthetic db#session path only for parser routing.
  // The UI's log open/reveal actions need a real filesystem path.
  const accumulator = createAccumulator({
    agent: 'zcode',
    file: {
      path: dbPath,
      mtimeMs,
      modifiedAt: new Date(mtimeMs).toISOString()
    },
    sessionId
  })
  accumulator.title = normalizeTitleText(row.title ?? '')
  accumulator.cwd = row.directory
  updateTimeline(accumulator, row.time_created)
  updateTimeline(accumulator, row.time_updated)

  const shape = probeZcodePreviewShape(db)
  const countSql = messageCountQuery(db, shape)
  if (countSql) {
    try {
      const counted = db.prepare(countSql).get(sessionId) as { count?: number } | undefined
      accumulator.messageCount = counted?.count ?? 0
    } catch {
      accumulator.messageCount = 0
    }
  }

  const previewSql = buildPreviewQuery(shape)
  if (previewSql) {
    try {
      // Why: ask for one extra row so an exactly-full window is not mistaken
      // for a trimmed one (the accumulator cannot detect SQL-side truncation).
      const probedRows = db
        .prepare(previewSql)
        .all(sessionId, ZCODE_SQLITE_PREVIEW_LIMIT + 1) as PreviewRow[]
      if (probedRows.length > ZCODE_SQLITE_PREVIEW_LIMIT) {
        accumulator.previewMessagesTruncated = true
      }
      // Newest-first; push in chronological order so the accumulator's ring
      // buffer keeps the newest ZCODE_SQLITE_PREVIEW_LIMIT messages.
      const previewRows = probedRows.slice(0, ZCODE_SQLITE_PREVIEW_LIMIT)
      for (let i = previewRows.length - 1; i >= 0; i--) {
        const previewRow = previewRows[i]
        if (!previewRow) {
          continue
        }
        const text = previewRowText(previewRow)
        if (!text) {
          continue
        }
        addPreviewMessage(accumulator, {
          role: mapPreviewRole(previewRow.role),
          text,
          timestamp: previewRow.time_created,
          seedFirstUserPrompt: false
        })
      }
    } catch {
      // Unknown message/part shape mid-read: keep title+timestamps only.
    }
  }

  if (shouldCaptureFullFirstUserPrompt()) {
    accumulator.firstUserPrompt = readFirstUserPromptFromZcodeDb(db, shape, sessionId)
  }

  return finalizeSession(accumulator, platform)
}
