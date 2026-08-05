import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  resetYunxiaoIndexForTests,
  searchYunxiaoSessions,
  type YunxiaoIndexOptions
} from './yunxiao-requirement-index'

let root: string
let options: YunxiaoIndexOptions

beforeAll(async () => {
  root = join(tmpdir(), `orca-yunxiao-index-test-${process.pid}-${Date.now()}`)
  const archive = join(root, 'archive')
  const codexDir = join(root, 'codex-sessions')
  const kimiSessions = join(root, 'kimi-home', 'sessions')
  const kimiSession = join(kimiSessions, 'wd_app_abc', 'session_kimi-1')

  await mkdir(join(archive, 'DFHIS-123'), { recursive: true })
  await mkdir(codexDir, { recursive: true })
  await mkdir(join(kimiSession, 'agents', 'main'), { recursive: true })

  const codexCwd = join(archive, 'DFHIS-123')
  await writeFile(
    join(codexDir, 'rollout-a.jsonl'),
    `${JSON.stringify({ type: 'session_meta', payload: { cwd: codexCwd } })}\n${JSON.stringify({
      type: 'event_msg',
      payload: { message: 'please fix DFHIS-123' }
    })}\n`
  )
  // cwd-only association: transcript never mentions the requirement id.
  await writeFile(
    join(codexDir, 'rollout-b.jsonl'),
    `${JSON.stringify({ type: 'session_meta', payload: { cwd: codexCwd } })}\n${JSON.stringify({
      type: 'event_msg',
      payload: { message: 'unrelated chatter' }
    })}\n`
  )

  await writeFile(
    join(root, 'kimi-home', 'session_index.jsonl'),
    `${JSON.stringify({ sessionId: 'session_kimi-1', workDir: codexCwd })}\n`
  )
  await writeFile(
    join(kimiSession, 'state.json'),
    JSON.stringify({
      title: 'fix the login bug',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T01:00:00.000Z',
      agents: { main: { type: 'main', parentAgentId: null } }
    })
  )
  await writeFile(
    join(kimiSession, 'agents', 'main', 'wire.jsonl'),
    `${JSON.stringify({
      type: 'context.append_message',
      message: { role: 'user', origin: { kind: 'user' }, content: 'resume DFHIS-123 repair' }
    })}\n`
  )

  options = {
    codexSessionsDir: codexDir,
    kimiSessionsDir: kimiSessions,
    archiveWorkspacePath: archive,
    indexPath: join(root, 'yunxiao-index.json')
  }
})

afterAll(() => {
  resetYunxiaoIndexForTests()
})

describe('yunxiao requirement index', () => {
  it('finds codex and kimi sessions by token, compact form, and cwd', async () => {
    resetYunxiaoIndexForTests()
    const byToken = await searchYunxiaoSessions('DFHIS-123', options)
    const agents = byToken.sessions.map((session) => session.agent).sort()
    // rollout-a (token), rollout-b (cwd), kimi-1 (token + cwd).
    expect(agents).toEqual(['codex', 'codex', 'kimi'])

    const compact = await searchYunxiaoSessions('dfhis123', options)
    expect(compact.sessions).toHaveLength(3)

    const miss = await searchYunxiaoSessions('DFHIS-999', options)
    expect(miss.sessions).toHaveLength(0)
  })

  it('picks up newly written transcripts incrementally', async () => {
    const late = join(options.codexSessionsDir as string, 'rollout-c.jsonl')
    await writeFile(
      late,
      `${JSON.stringify({ type: 'session_meta', payload: { cwd: '/tmp/elsewhere' } })}\n${JSON.stringify(
        { type: 'event_msg', payload: { message: 'DFHIS-123 follow-up' } }
      )}\n`
    )
    const result = await searchYunxiaoSessions('DFHIS-123', options)
    expect(result.sessions).toHaveLength(4)
  })
})
