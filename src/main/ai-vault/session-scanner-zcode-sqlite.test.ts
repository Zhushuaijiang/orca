import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import Database from '../sqlite/sync-database'
import { scanAiVaultSessions } from './session-scanner'
import { withFullFirstUserPromptCapture } from './session-scanner-first-user-prompt-capture'
import { isolatedScanRoots } from './session-scanner-test-fixtures'
import {
  buildZcodeSqliteCandidatePath,
  splitZcodeSqliteCandidate
} from './session-scanner-zcode-sqlite-paths'
import { listZcodeSqliteSessions } from './session-scanner-zcode-sqlite-list'
import { parseZcodeSqliteSession } from './session-scanner-zcode-sqlite'
import { zcodeDiscoveries } from './session-scanner-zcode-sources'
import type { AiVaultScanIssue } from '../../shared/ai-vault-types'

let tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

function createTempDbDir(): { dir: string; db: Database.Database; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'orca-zcode-sqlite-'))
  tempDirs.push(dir)
  const path = join(dir, 'db.sqlite')
  return { dir, db: new Database(path), path }
}

// The verified ZCode 3.10.1 schema: session columns are contractual; the
// message/part bodies use the flattened column shape (role + text).
function applyZcodeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      workspace_id TEXT,
      parent_id TEXT,
      slug TEXT NOT NULL,
      directory TEXT NOT NULL,
      path TEXT,
      title TEXT NOT NULL,
      version TEXT NOT NULL,
      share_url TEXT,
      summary_additions INTEGER,
      summary_deletions INTEGER,
      summary_files INTEGER,
      summary_diffs TEXT,
      revert TEXT,
      permission TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      time_compacting INTEGER,
      time_archived INTEGER
    );
    CREATE TABLE message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES session(id),
      role TEXT NOT NULL,
      text TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    );
    CREATE TABLE part (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES message(id),
      session_id TEXT NOT NULL,
      type TEXT,
      text TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    );
  `)
}

// OpenCode's JSON-document message/part layout, accepted as a fallback shape.
function applyZcodeOpencodeJsonSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      directory TEXT NOT NULL,
      title TEXT NOT NULL,
      version TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      time_archived INTEGER
    );
    CREATE TABLE message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE part (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL
    );
  `)
}

// An unrecognized message/part layout: the parser must degrade to
// title+timestamps instead of failing the row.
function applyZcodeUnknownBodySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      directory TEXT NOT NULL,
      title TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    );
    CREATE TABLE message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    );
    CREATE TABLE part (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      blob BLOB
    );
  `)
}

function insertZcodeSession(
  db: Database.Database,
  args: {
    id: string
    title?: string
    directory?: string
    timeCreated: number
    timeUpdated: number
    parentId?: string | null
    timeArchived?: number | null
  }
): void {
  // Why: the variant schemas carry fewer session columns than the verified
  // one, so build the INSERT from the columns this database actually has.
  const columns = new Set(
    (db.prepare('PRAGMA table_info(session)').all() as { name?: string }[]).map((row) => row.name)
  )
  const names = ['id', 'directory', 'title', 'time_created', 'time_updated']
  const values: (string | number | null)[] = [
    args.id,
    args.directory ?? '/tmp/zcode',
    args.title ?? 'ZCode title',
    args.timeCreated,
    args.timeUpdated
  ]
  const optional: [string, string | number | null][] = [
    ['project_id', 'proj-1'],
    ['parent_id', args.parentId ?? null],
    ['slug', `slug-${args.id}`],
    ['version', '0.16.5'],
    ['time_archived', args.timeArchived ?? null]
  ]
  for (const [name, value] of optional) {
    if (columns.has(name)) {
      names.push(name)
      values.push(value)
    }
  }
  db.prepare(
    `INSERT INTO session (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`
  ).run(...values)
}

function insertZcodeMessage(
  db: Database.Database,
  args: { id: string; sessionId: string; role: 'user' | 'assistant'; timeCreated: number }
): void {
  db.prepare(
    `INSERT INTO message (id, session_id, role, text, time_created, time_updated)
     VALUES (?, ?, ?, NULL, ?, ?)`
  ).run(args.id, args.sessionId, args.role, args.timeCreated, args.timeCreated)
}

function insertZcodePart(
  db: Database.Database,
  args: { id: string; messageId: string; sessionId: string; timeCreated: number; text: string }
): void {
  db.prepare(
    `INSERT INTO part (id, message_id, session_id, type, text, time_created, time_updated)
     VALUES (?, ?, ?, 'text', ?, ?, ?)`
  ).run(args.id, args.messageId, args.sessionId, args.text, args.timeCreated, args.timeCreated)
}

describe('zcode sqlite candidate paths', () => {
  it('round-trips a synthetic db#session path', () => {
    const built = buildZcodeSqliteCandidatePath('/home/u/.zcode/cli/db/db.sqlite', 'sess_1')
    expect(built).toBe('/home/u/.zcode/cli/db/db.sqlite#sess_1')
    expect(splitZcodeSqliteCandidate(built)).toEqual({
      dbPath: '/home/u/.zcode/cli/db/db.sqlite',
      sessionId: 'sess_1'
    })
  })

  it('rejects non-db.sqlite basenames so real # paths are not misrouted', () => {
    expect(splitZcodeSqliteCandidate('/tmp/notes#mine.md#sess_1')).toBeNull()
    expect(splitZcodeSqliteCandidate('/tmp/db.sqllite#sess_1')).toBeNull()
    expect(splitZcodeSqliteCandidate('db.sqlite#')).toBeNull()
    expect(splitZcodeSqliteCandidate('/tmp/db.sqlite')).toBeNull()
  })
})

describe('listZcodeSqliteSessions', () => {
  it('excludes archived and child sessions and sorts by time_updated desc', async () => {
    const { db, path } = createTempDbDir()
    applyZcodeSchema(db)
    insertZcodeSession(db, {
      id: 'sess_old',
      timeCreated: 1_777_634_000_000,
      timeUpdated: 1_777_634_001_000
    })
    insertZcodeSession(db, {
      id: 'sess_new',
      timeCreated: 1_777_634_002_000,
      timeUpdated: 1_777_634_003_000
    })
    insertZcodeSession(db, {
      id: 'sess_archived',
      timeCreated: 1_777_634_000_000,
      timeUpdated: 1_777_634_004_000,
      timeArchived: 1_777_634_004_500
    })
    insertZcodeSession(db, {
      id: 'sess_child',
      timeCreated: 1_777_634_000_000,
      timeUpdated: 1_777_634_005_000,
      parentId: 'sess_new'
    })
    db.close()

    const issues: AiVaultScanIssue[] = []
    const candidates = await listZcodeSqliteSessions({ dbPaths: [path], limit: 10, issues })
    expect(issues).toEqual([])
    expect(candidates.map((c) => c.file.path)).toEqual([
      buildZcodeSqliteCandidatePath(path, 'sess_new'),
      buildZcodeSqliteCandidatePath(path, 'sess_old')
    ])
    expect(candidates[0].agent).toBe('zcode')
    expect(candidates[0].file.mtimeMs).toBe(1_777_634_003_000)
  })

  it('returns [] when the session table is missing and records missing files as issues', async () => {
    const { db, path } = createTempDbDir()
    db.exec('CREATE TABLE other (id TEXT)')
    db.close()
    expect(await listZcodeSqliteSessions({ dbPaths: [path], limit: 10, issues: [] })).toEqual([])

    const issues: AiVaultScanIssue[] = []
    expect(
      await listZcodeSqliteSessions({
        dbPaths: ['/nonexistent/.zcode/cli/db/db.sqlite'],
        limit: 10,
        issues
      })
    ).toEqual([])
    expect(issues).toHaveLength(1)
    expect(issues[0].agent).toBe('zcode')
    expect(issues[0].kind).toBe('scope')
  })
})

describe('parseZcodeSqliteSession', () => {
  it('builds an AiVaultSession with title, cwd, timestamps, preview, and resume command', async () => {
    const { db, path } = createTempDbDir()
    applyZcodeSchema(db)
    insertZcodeSession(db, {
      id: 'sess_1',
      title: 'Ship the release',
      directory: '/tmp/zcode',
      timeCreated: 1_777_634_000_000,
      timeUpdated: 1_777_634_001_000
    })
    insertZcodeMessage(db, {
      id: 'zmsg_1',
      sessionId: 'sess_1',
      role: 'user',
      timeCreated: 1_777_634_000_500
    })
    insertZcodePart(db, {
      id: 'zprt_1',
      messageId: 'zmsg_1',
      sessionId: 'sess_1',
      timeCreated: 1_777_634_000_500,
      text: 'Plan the release'
    })
    insertZcodeMessage(db, {
      id: 'zmsg_2',
      sessionId: 'sess_1',
      role: 'assistant',
      timeCreated: 1_777_634_000_900
    })
    insertZcodePart(db, {
      id: 'zprt_2',
      messageId: 'zmsg_2',
      sessionId: 'sess_1',
      timeCreated: 1_777_634_001_000,
      text: 'Shipped'
    })
    db.close()

    const session = await parseZcodeSqliteSession({
      dbPath: path,
      sessionId: 'sess_1',
      platform: 'darwin'
    })
    expect(session).not.toBeNull()
    expect(session!.agent).toBe('zcode')
    expect(session!.sessionId).toBe('sess_1')
    expect(session!.filePath).toBe(path)
    expect(session!.title).toBe('Ship the release')
    expect(session!.cwd).toBe('/tmp/zcode')
    expect(session!.createdAt).toBe(new Date(1_777_634_000_000).toISOString())
    expect(session!.updatedAt).toBe(new Date(1_777_634_001_000).toISOString())
    expect(session!.resumeCommand).toBe("cd '/tmp/zcode' && zcode --resume 'sess_1'")
    expect(session!.messageCount).toBe(2)
    expect(session!.previewMessages).toHaveLength(2)
    expect(session!.previewMessages[0]).toEqual({
      role: 'user',
      text: 'Plan the release',
      timestamp: new Date(1_777_634_000_500).toISOString()
    })
    expect(session!.previewMessages[1]).toEqual({
      role: 'assistant',
      text: 'Shipped',
      timestamp: new Date(1_777_634_000_900).toISOString()
    })
  })

  it('reads previews from the OpenCode JSON message/part layout too', async () => {
    const { db, path } = createTempDbDir()
    applyZcodeOpencodeJsonSchema(db)
    insertZcodeSession(db, {
      id: 'sess_json',
      timeCreated: 1_777_634_000_000,
      timeUpdated: 1_777_634_001_000
    })
    db.prepare(
      `INSERT INTO message (id, session_id, time_created, time_updated, data)
       VALUES ('zmsg_j1', 'sess_json', 1777634000500, 1777634000500, ?)`
    ).run(JSON.stringify({ role: 'user' }))
    db.prepare(
      `INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
       VALUES ('zprt_j1', 'zmsg_j1', 'sess_json', 1777634000500, 1777634000500, ?)`
    ).run(JSON.stringify({ type: 'text', text: 'json-shaped hello' }))
    db.close()

    const session = await parseZcodeSqliteSession({
      dbPath: path,
      sessionId: 'sess_json',
      platform: 'darwin'
    })
    expect(session!.messageCount).toBe(1)
    expect(session!.previewMessages[0].text).toBe('json-shaped hello')
    expect(session!.previewMessages[0].role).toBe('user')
  })

  it('degrades to title+timestamps when message/part columns are unrecognized', async () => {
    const { db, path } = createTempDbDir()
    applyZcodeUnknownBodySchema(db)
    insertZcodeSession(db, {
      id: 'sessOpaque',
      title: 'Opaque body schema',
      timeCreated: 1_777_634_000_000,
      timeUpdated: 1_777_634_001_000
    })
    db.prepare(
      `INSERT INTO message (id, session_id, time_created, time_updated)
       VALUES ('zmsg_o1', 'sessOpaque', 1777634000500, 1777634000500)`
    ).run()
    db.prepare(`INSERT INTO part (id, message_id, blob) VALUES ('zprt_o1', 'zmsg_o1', x'00')`).run()
    db.close()

    const session = await parseZcodeSqliteSession({
      dbPath: path,
      sessionId: 'sessOpaque',
      platform: 'darwin'
    })
    expect(session).not.toBeNull()
    expect(session!.title).toBe('Opaque body schema')
    expect(session!.cwd).toBe('/tmp/zcode')
    expect(session!.createdAt).toBe(new Date(1_777_634_000_000).toISOString())
    expect(session!.messageCount).toBe(0)
    expect(session!.previewMessages).toEqual([])
  })

  it('flags a trimmed preview window and captures the full first user prompt', async () => {
    const { db, path } = createTempDbDir()
    applyZcodeSchema(db)
    insertZcodeSession(db, {
      id: 'sess_fp',
      timeCreated: 1_777_634_000_000,
      timeUpdated: 1_777_634_900_000
    })
    insertZcodeMessage(db, {
      id: 'zmsg_first',
      sessionId: 'sess_fp',
      role: 'user',
      timeCreated: 1_777_634_000_000
    })
    insertZcodePart(db, {
      id: 'zprt_first',
      messageId: 'zmsg_first',
      sessionId: 'sess_fp',
      timeCreated: 10,
      text: 'the opening ask'
    })
    for (let i = 0; i < 6; i += 1) {
      insertZcodeMessage(db, {
        id: `zmsg_late_${i}`,
        sessionId: 'sess_fp',
        role: 'user',
        timeCreated: 1_777_634_500_000 + i
      })
      insertZcodePart(db, {
        id: `zprt_late_${i}`,
        messageId: `zmsg_late_${i}`,
        sessionId: 'sess_fp',
        timeCreated: 100 + i,
        text: `later ask ${i}`
      })
    }
    db.close()

    const session = await withFullFirstUserPromptCapture(() =>
      parseZcodeSqliteSession({ dbPath: path, sessionId: 'sess_fp', platform: 'darwin' })
    )
    expect(session!.previewMessagesTruncated).toBe(true)
    expect(session!.previewMessages).toHaveLength(5)
    expect(session!.previewMessages.some((m) => m.text === 'the opening ask')).toBe(false)
    expect(session!.firstUserPrompt).toBe('the opening ask')
  })

  it('returns null for unknown session ids and session-less databases', async () => {
    const { db, path } = createTempDbDir()
    applyZcodeSchema(db)
    insertZcodeSession(db, {
      id: 'sess_real',
      timeCreated: 1_777_634_000_000,
      timeUpdated: 1_777_634_001_000
    })
    db.close()
    expect(
      await parseZcodeSqliteSession({ dbPath: path, sessionId: 'sess_missing', platform: 'darwin' })
    ).toBeNull()

    const { db: emptyDb, path: emptyPath } = createTempDbDir()
    emptyDb.exec('CREATE TABLE other (id TEXT)')
    emptyDb.close()
    expect(
      await parseZcodeSqliteSession({ dbPath: emptyPath, sessionId: 'sess_1', platform: 'darwin' })
    ).toBeNull()
  })
})

describe('zcodeDiscoveries', () => {
  it('treats a missing db dir as a clean empty result, never an error', async () => {
    const issues: AiVaultScanIssue[] = []
    const discoveries = await Promise.all(
      zcodeDiscoveries({ zcodeDbDir: '/nonexistent/.zcode/cli/db' }, [], 10, issues)
    )
    expect(issues).toEqual([])
    expect(discoveries).toHaveLength(1)
    expect(discoveries[0].files).toEqual([])
  })

  it('scans the WSL home root beside the local root', async () => {
    const local = createTempDbDir()
    applyZcodeSchema(local.db)
    insertZcodeSession(local.db, {
      id: 'sess_local',
      timeCreated: 1_777_634_000_000,
      timeUpdated: 1_777_634_001_000
    })
    local.db.close()

    const wslHome = mkdtempSync(join(tmpdir(), 'orca-zcode-wsl-'))
    tempDirs.push(wslHome)
    const wslDbDir = join(wslHome, '.zcode', 'cli', 'db')
    mkdirSync(wslDbDir, { recursive: true })
    const wslDb = new Database(join(wslDbDir, 'db.sqlite'))
    applyZcodeSchema(wslDb)
    insertZcodeSession(wslDb, {
      id: 'sess_wsl',
      timeCreated: 1_777_634_002_000,
      timeUpdated: 1_777_634_003_000
    })
    wslDb.close()

    const issues: AiVaultScanIssue[] = []
    const discoveries = await Promise.all(
      zcodeDiscoveries({ zcodeDbDir: local.dir }, [wslHome], 10, issues)
    )
    expect(issues).toEqual([])
    const paths = discoveries.flatMap((d) => d.files.map((f) => f.path))
    expect(paths).toContain(buildZcodeSqliteCandidatePath(local.path, 'sess_local'))
    expect(paths).toContain(buildZcodeSqliteCandidatePath(join(wslDbDir, 'db.sqlite'), 'sess_wsl'))
  })

  it('surfaces ZCode sessions through scanAiVaultSessions with an injected db dir', async () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-zcode-scan-'))
    tempDirs.push(root)
    const roots = isolatedScanRoots(root)
    const dbDir = join(root, 'zcode-db')
    mkdirSync(dbDir, { recursive: true })
    const db = new Database(join(dbDir, 'db.sqlite'))
    applyZcodeSchema(db)
    insertZcodeSession(db, {
      id: 'sess_scan',
      title: 'Scanned ZCode session',
      directory: '/tmp/zcode',
      timeCreated: 1_777_634_000_000,
      timeUpdated: 1_777_634_001_000
    })
    insertZcodeMessage(db, {
      id: 'zmsg_scan',
      sessionId: 'sess_scan',
      role: 'user',
      timeCreated: 1_777_634_000_500
    })
    insertZcodePart(db, {
      id: 'zprt_scan',
      messageId: 'zmsg_scan',
      sessionId: 'sess_scan',
      timeCreated: 1_777_634_000_500,
      text: 'Scanned ZCode session'
    })
    db.close()

    const result = await scanAiVaultSessions({
      ...roots,
      zcodeDbDir: dbDir,
      platform: 'darwin',
      limit: 50
    })
    expect(result.issues).toEqual([])
    const session = result.sessions.find((s) => s.agent === 'zcode')
    expect(session).toBeDefined()
    expect(session!.sessionId).toBe('sess_scan')
    expect(session!.title).toBe('Scanned ZCode session')
    expect(session!.cwd).toBe('/tmp/zcode')
    expect(session!.messageCount).toBe(1)
    expect(session!.resumeCommand).toBe("cd '/tmp/zcode' && zcode --resume 'sess_scan'")
  })
})
