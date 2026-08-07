import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRemoteOfficialAggregates } from './remote-pack-aggregates'
import { aggregateSkillFilesSha256 } from './upload-state'

const fetchMock = vi.fn()

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function manifestResponse(files: { path: string; content: string }[]) {
  return {
    ok: true,
    json: async () => ({
      schemaVersion: 1,
      files: files.map((file) => ({
        path: file.path,
        sha256: createHash('sha256').update(file.content).digest('hex'),
        contentBase64: Buffer.from(file.content).toString('base64')
      }))
    })
  }
}

describe('fetchRemoteOfficialAggregates', () => {
  it('groups manifest files by skill and digests them relative to the skill dir', async () => {
    const files = [
      { path: 'his-workflow-harness/SKILL.md', content: 'a\n' },
      { path: 'his-workflow-harness/scripts/run.sh', content: 'b\n' },
      { path: 'ygt/SKILL.md', content: 'c\n' }
    ]
    vi.stubGlobal('fetch', fetchMock.mockResolvedValue(manifestResponse(files)))

    const aggregates = await fetchRemoteOfficialAggregates('http://x/pack.json')

    expect(aggregates.get('his-workflow-harness')).toEqual(
      new Set([
        aggregateSkillFilesSha256(
          files
            .filter((file) => file.path.startsWith('his-workflow-harness/'))
            .map((file) => ({
              path: file.path.slice('his-workflow-harness/'.length),
              sha256: createHash('sha256').update(file.content).digest('hex')
            }))
        )
      ])
    )
    expect(aggregates.get('ygt')?.size).toBe(1)
  })

  it('returns an empty map on fetch failure', async () => {
    vi.stubGlobal('fetch', fetchMock.mockRejectedValue(new Error('down')))

    expect((await fetchRemoteOfficialAggregates('http://x/pack.json')).size).toBe(0)
  })
})
