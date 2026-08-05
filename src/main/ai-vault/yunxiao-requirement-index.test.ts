import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { beforeAll, describe, expect, it } from 'vitest'
import { searchYunxiaoSessions, type YunxiaoSearchOptions } from './yunxiao-requirement-index'

let options: YunxiaoSearchOptions

beforeAll(async () => {
  const root = join(tmpdir(), `orca-yunxiao-search-test-${process.pid}-${Date.now()}`)
  const archive = join(root, 'archive')
  const codexHome = join(root, 'codex-home')
  const kimiSessions = join(root, 'kimi-home', 'sessions')
  const kimiSession = join(kimiSessions, 'wd_app_abc', 'session_kimi-1')
  const requirementDir = join(archive, 'DFHIS-123')

  await mkdir(requirementDir, { recursive: true })
  await mkdir(codexHome, { recursive: true })
  await mkdir(join(kimiSession, 'agents', 'main'), { recursive: true })

  const rolloutA = join(codexHome, 'rollout-a.jsonl')
  const rolloutB = join(codexHome, 'rollout-b.jsonl')
  for (const [path, text] of [
    [rolloutA, 'please fix DFHIS-123'],
    [rolloutB, 'unrelated chatter']
  ] as const) {
    await writeFile(
      path,
      `${JSON.stringify({ type: 'session_meta', payload: { cwd: requirementDir } })}\n${JSON.stringify(
        { type: 'event_msg', payload: { message: text } }
      )}\n`
    )
  }

  const codexDb = new DatabaseSync(join(codexHome, 'state_9.sqlite'))
  codexDb.exec(
    'CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL, cwd TEXT NOT NULL, title TEXT NOT NULL, first_user_message TEXT NOT NULL, preview TEXT NOT NULL)'
  )
  codexDb
    .prepare('INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?)')
    .run('thread-a', rolloutA, '/elsewhere', 'fix DFHIS-123 login', '', '')
  // cwd-only association: no token anywhere in the metadata.
  codexDb
    .prepare('INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?)')
    .run('thread-b', rolloutB, requirementDir, 'chatter', '', '')
  codexDb.close()

  await writeFile(
    join(root, 'kimi-home', 'session_index.jsonl'),
    `${JSON.stringify({ sessionId: 'session_kimi-1', workDir: requirementDir })}\n`
  )
  await writeFile(
    join(kimiSession, 'state.json'),
    JSON.stringify({
      title: 'resume the DFHIS-123 repair',
      lastPrompt: 'resume the DFHIS-123 repair',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T01:00:00.000Z',
      agents: { main: { type: 'main', parentAgentId: null } }
    })
  )

  options = {
    codexHomeDir: codexHome,
    opencodeDbPath: join(root, 'missing-opencode.db'),
    kimiSessionsDir: kimiSessions,
    archiveWorkspacePath: archive
  }
})

describe('yunxiao requirement search', () => {
  it('finds codex and kimi sessions by token, compact form, and cwd', async () => {
    const result = await searchYunxiaoSessions('DFHIS-123', options)
    expect(result.sessions.map((session) => session.agent).sort()).toEqual([
      'codex',
      'codex',
      'kimi'
    ])

    const compact = await searchYunxiaoSessions('dfhis123', options)
    expect(compact.sessions).toHaveLength(3)

    const miss = await searchYunxiaoSessions('DFHIS-999', options)
    expect(miss.sessions).toHaveLength(0)
  })
})
