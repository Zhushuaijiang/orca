import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AiVaultScanIssue } from '../../shared/ai-vault-types'
import { wslGatedReaddir } from '../native-chat/wsl-transcript-fs-access'
import { WslTranscriptFsError } from '../native-chat/wsl-transcript-fs-gate'
import { recordSessionScanIssue } from './session-scan-issues'
import { sessionRootDirs } from './session-scanner-roots'
import { splitZcodeSqliteCandidate } from './session-scanner-zcode-sqlite-paths'
import { listZcodeSqliteSessions } from './session-scanner-zcode-sqlite-list'
import type {
  AiVaultScanOptions,
  SessionFileCandidate,
  SessionFileDiscovery
} from './session-scanner-types'

// Why: ZCode's sessions all live in one SQLite DB per home (~/.zcode/cli/db/
// db.sqlite), so it needs the OpenCode-style shape-specific discovery: the db
// file is listed, then expanded into one synthetic <dbPath>#<sessionId>
// candidate per session row. The generic AI_VAULT_AGENT_SOURCES walk is
// 1-file→1-session and cannot expand a database.

const ZCODE_DB_DIR = join(homedir(), '.zcode', 'cli', 'db')

export function zcodeDiscoveries(
  options: AiVaultScanOptions,
  wslHomeDirs: readonly string[],
  limit: number,
  issues: AiVaultScanIssue[]
): Promise<SessionFileDiscovery>[] {
  const dbDirs = sessionRootDirs(options.zcodeDbDir ?? ZCODE_DB_DIR, wslHomeDirs, [
    '.zcode',
    'cli',
    'db'
  ])
  return dbDirs.map((dbDir) => discoverZcodeSessions({ dbDir, limit, issues }))
}

async function discoverZcodeSessions(args: {
  dbDir: string
  limit: number
  issues: AiVaultScanIssue[]
}): Promise<SessionFileDiscovery> {
  const dbPaths = await listZcodeDatabasesInDirectory(args.dbDir, args.issues)
  const candidates =
    dbPaths.length === 0
      ? []
      : await listZcodeSqliteSessions({ dbPaths, limit: args.limit, issues: args.issues })
  return { agent: 'zcode', rootDir: args.dbDir, files: dedupeZcodeCandidates(candidates) }
}

// Why: the same session id can appear in more than one db (e.g. a copied
// profile variant); keep only the newest row, like the OpenCode list layer.
function dedupeZcodeCandidates(candidates: SessionFileCandidate[]): SessionFileCandidate['file'][] {
  const bySessionId = new Map<string, SessionFileCandidate['file']>()
  for (const candidate of candidates) {
    const parsed = splitZcodeSqliteCandidate(candidate.file.path)
    if (!parsed) {
      continue
    }
    const previous = bySessionId.get(parsed.sessionId)
    if (!previous || candidate.file.mtimeMs > previous.mtimeMs) {
      bySessionId.set(parsed.sessionId, candidate.file)
    }
  }
  return [...bySessionId.values()].sort((left, right) => right.mtimeMs - left.mtimeMs)
}

async function listZcodeDatabasesInDirectory(
  dbDir: string,
  issues: AiVaultScanIssue[]
): Promise<string[]> {
  try {
    const entries = await wslGatedReaddir(dbDir, 'scan')
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sqlite'))
      .map((entry) => join(dbDir, entry.name))
      .sort()
  } catch (error) {
    // Why: a missing ~/.zcode/cli/db just means the CLI is not installed — a
    // clean empty result, never an error. Only a stalled WSL dir is reportable
    // (an empty list would otherwise read as "ZCode not used").
    if (error instanceof WslTranscriptFsError) {
      recordSessionScanIssue(issues, { agent: 'zcode', path: dbDir, message: error.message })
    }
    return []
  }
}
