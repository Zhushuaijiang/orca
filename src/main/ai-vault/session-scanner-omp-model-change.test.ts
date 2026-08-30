import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanAiVaultSessions } from './session-scanner'
import { isolatedScanRoots, jsonLines } from './session-scanner-test-fixtures'

// Why: split out of session-scanner.test.ts to stay under the max-lines lint
// budget; the case is self-contained and shares only the scan fixtures.

let tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots = []
})

describe('scanAiVaultSessions OMP model capture', () => {
  it('captures an in-progress OMP model from model_change before any assistant reply', async () => {
    // OMP writes the model on `model_change.model` (not Pi's `modelId`). With no
    // assistant message yet, the model must still come through — proving the
    // model_change fallback rather than assistant-message capture.
    const root = await mkdtemp(join(tmpdir(), 'orca-ai-vault-omp-mc-'))
    tempRoots.push(root)
    const roots = isolatedScanRoots(root)
    await mkdir(roots.ompSessionsDir, { recursive: true })
    await writeFile(
      join(roots.ompSessionsDir, 'omp-in-progress.jsonl'),
      jsonLines([
        {
          type: 'session',
          id: 'omp-in-progress',
          timestamp: '2026-05-01T10:00:00.000Z',
          cwd: '/tmp/omp'
        },
        { type: 'model_change', model: 'omp-mc-only-model', timestamp: '2026-05-01T10:00:01.000Z' },
        {
          type: 'message',
          timestamp: '2026-05-01T10:00:02.000Z',
          message: { role: 'user', content: [{ type: 'text', text: 'first prompt' }] }
        }
      ])
    )

    const result = await scanAiVaultSessions({ ...roots, platform: 'darwin', limit: 5 })
    const session = result.sessions.find((s) => s.agent === 'omp')
    expect(session?.model).toBe('omp-mc-only-model')
  })
})
