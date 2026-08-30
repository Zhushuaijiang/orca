import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import Database from '../sqlite/sync-database'

export function isolatedScanRoots(root: string) {
  return {
    claudeProjectsDir: join(root, 'claude-projects'),
    codexSessionsDir: join(root, 'codex-sessions'),
    geminiSessionsDir: join(root, 'gemini-sessions'),
    antigravityBrainDir: join(root, 'antigravity-brain'),
    copilotSessionsDir: join(root, 'copilot-sessions'),
    cursorProjectsDir: join(root, 'cursor-projects'),
    opencodeStorageDir: join(root, 'opencode-storage'),
    // Why: prevent the SQLite scanner from picking up the real
    // ~/.local/share/opencode/opencode.db during tests.
    opencodeDbPaths: [] as readonly string[],
    grokSessionsDir: join(root, 'grok-sessions'),
    devinTranscriptsDir: join(root, 'devin-transcripts'),
    hermesSessionsDir: join(root, 'hermes-sessions'),
    rovoSessionsDir: join(root, 'rovo-sessions'),
    openclawStateDir: join(root, 'openclaw-state'),
    openclawLegacyStateDir: join(root, 'openclaw-legacy-state'),
    piSessionsDir: join(root, 'pi-sessions'),
    ompSessionsDir: join(root, 'omp-sessions'),
    primeAgentSessionsDir: join(root, 'prime-agent-sessions'),
    droidSessionsDir: join(root, 'droid-sessions'),
    droidProjectsDir: join(root, 'droid-projects'),
    clineSessionsDir: join(root, 'cline-sessions'),
    kimiSessionsDir: join(root, 'kimi-sessions'),
    codebuddyProjectsDir: join(root, 'codebuddy-projects'),
    // Why: prevent the ZCode scanner from picking up the real
    // ~/.zcode/cli/db/db.sqlite during tests.
    zcodeDbDir: join(root, 'zcode-db')
  }
}

export function jsonLines(records: unknown[]): string {
  return records.map((record) => JSON.stringify(record)).join('\n')
}

export async function writeJsonlFile(filePath: string, records: unknown[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, jsonLines(records))
}

export async function writeAntigravityTranscript(
  brainDir: string,
  sessionId: string,
  records: unknown[]
): Promise<string> {
  const transcriptPath = join(brainDir, sessionId, '.system_generated', 'logs', 'transcript.jsonl')
  await writeJsonlFile(transcriptPath, records)
  return transcriptPath
}

export function writeAntigravityHistory(brainDir: string, records: unknown[]): Promise<void> {
  return writeJsonlFile(join(dirname(brainDir), 'history.jsonl'), records)
}

// Message-graph fixtures for the Pi forks: each writes one session transcript
// and returns its path, since both agents resume by absolute transcript path.
export async function writeOmpScannerFixture(sessionsDir: string): Promise<string> {
  const sessionFile = join(sessionsDir, 'omp-session.jsonl')
  await writeJsonlFile(sessionFile, [
    {
      type: 'session',
      version: 3,
      id: 'omp-session',
      title: 'OMP session title',
      timestamp: '2026-05-01T10:08:30.000Z',
      cwd: '/tmp/omp'
    },
    {
      type: 'model_change',
      model: 'gpt-5.4-mini',
      timestamp: '2026-05-01T10:08:30.500Z'
    },
    {
      type: 'message',
      timestamp: '2026-05-01T10:08:31.000Z',
      message: { role: 'user', content: [{ type: 'text', text: 'OMP title' }] }
    },
    {
      type: 'message',
      timestamp: '2026-05-01T10:08:32.000Z',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'OMP answer' }],
        model: 'gpt-5.4-mini',
        // totalTokens deliberately != input+output so the assertion proves
        // the explicit-total field is read, not an input/output sum.
        usage: { input: 10, output: 5, totalTokens: 160 }
      }
    }
  ])
  return sessionFile
}

// Prime Agent shares Pi's message-graph format (and its `modelId` key) but
// reads its own ~/.prime/agent/sessions root.
export async function writePrimeAgentScannerFixture(sessionsDir: string): Promise<string> {
  const sessionFile = join(sessionsDir, 'prime-agent-session.jsonl')
  await writeJsonlFile(sessionFile, [
    {
      type: 'session',
      version: 3,
      id: 'prime-agent-session',
      timestamp: '2026-05-01T10:08:40.000Z',
      cwd: '/tmp/prime-agent'
    },
    {
      type: 'model_change',
      provider: 'prime-intellect',
      modelId: 'inference/big-model',
      timestamp: '2026-05-01T10:08:40.500Z'
    },
    {
      type: 'message',
      timestamp: '2026-05-01T10:08:41.000Z',
      message: { role: 'user', content: [{ type: 'text', text: 'Prime Agent title' }] }
    }
  ])
  return sessionFile
}

export function writeAntigravityScannerFixture(
  brainDir: string,
  sessionId: string
): Promise<string> {
  return writeAntigravityTranscript(brainDir, sessionId, [
    {
      source: 'USER_EXPLICIT',
      type: 'USER_INPUT',
      created_at: '2026-05-01T10:02:30.000Z',
      content: '<USER_REQUEST>Antigravity title</USER_REQUEST>'
    },
    {
      source: 'MODEL',
      type: 'PLANNER_RESPONSE',
      created_at: '2026-05-01T10:02:31.000Z',
      content: 'Done'
    }
  ])
}

// ZCode: one SQLite db (db.sqlite) under the injected db dir, holding one
// session row plus column-shape message/part rows for the preview.
export async function writeZcodeScannerFixture(dbDir: string): Promise<string> {
  await mkdir(dbDir, { recursive: true })
  const dbPath = join(dbDir, 'db.sqlite')
  const db = new Database(dbPath)
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
  db.prepare(
    `INSERT INTO session (id, project_id, slug, directory, title, version,
       time_created, time_updated)
     VALUES ('sess_zcode-session', 'proj-1', 'slug', '/tmp/zcode', 'ZCode vault title', '0.16.5',
       1777634012000, 1777634013000)`
  ).run()
  db.prepare(
    `INSERT INTO message (id, session_id, role, text, time_created, time_updated)
     VALUES ('zmsg_1', 'sess_zcode-session', 'user', NULL, 1777634012000, 1777634012000)`
  ).run()
  db.prepare(
    `INSERT INTO part (id, message_id, session_id, type, text, time_created, time_updated)
     VALUES ('zprt_1', 'zmsg_1', 'sess_zcode-session', 'text', 'ZCode vault title',
       1777634012000, 1777634012000)`
  ).run()
  db.close()
  return dbPath
}
