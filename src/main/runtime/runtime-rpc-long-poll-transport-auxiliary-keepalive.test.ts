import './rpc/unused-default-rpc-methods.test-fixture'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'
import { readRuntimeMetadata } from './runtime-metadata'
import { createLongPollServer as createServer } from './runtime-rpc-long-poll-server.test-fixture'
import { openFramedSession, sleep } from './runtime-rpc-test-harness'

vi.mock('../git/worktree', () => {
  const worktrees = [
    {
      path: '/tmp/worktree-a',
      head: 'abc',
      branch: 'feature/foo',
      isBare: false,
      isMainWorktree: false
    }
  ]
  return {
    listWorktrees: vi.fn().mockResolvedValue(worktrees),
    listWorktreesStrict: vi.fn().mockResolvedValue(worktrees)
  }
})

describe('OrcaRuntimeRpcServer auxiliary keepalives', () => {
  it.each([
    'orchestration.workerStart',
    'auxiliary.generate',
    'auxiliary.route',
    'auxiliary.auto'
  ])('emits keepalives while %s blocks', async (method) => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-rpc-'))
    const runtime = new OrcaRuntimeService()
    const server = createServer({
      runtime,
      userDataPath,
      keepaliveIntervalMs: 30
    })
    const dispatch = server['dispatcher']
    vi.spyOn(dispatch, 'dispatch').mockImplementation(async (request) => {
      await sleep(120)
      return {
        id: request.id,
        ok: true,
        result: { dispatch: { id: 'dispatch_1' } },
        _meta: { runtimeId: runtime.getRuntimeId() }
      }
    })
    await server.start()

    try {
      const metadata = readRuntimeMetadata(userDataPath)
      const session = openFramedSession(metadata!.transports[0]!.endpoint, {
        id: 'req_worker_start',
        authToken: metadata!.authToken,
        method,
        params:
          method === 'orchestration.workerStart'
            ? { task: 'task_1', timeoutMs: 60_000 }
            : { worktree: 'path:/tmp/worktree-a', task: 'research', prompt: 'Read-only analysis' }
      })
      await session.done

      expect(
        session.frames.filter((frame) => frame._keepalive === true).length
      ).toBeGreaterThanOrEqual(2)
      expect(session.frames.filter((frame) => frame.ok !== undefined)).toHaveLength(1)
    } finally {
      await server.stop()
    }
  })
})
