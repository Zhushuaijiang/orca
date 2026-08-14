import { describe, expect, it } from 'vitest'
import { matchAgentSessionLockHolders } from './agent-session-lock-release'

describe('matchAgentSessionLockHolders', () => {
  it('matches rows whose command contains the session id', () => {
    const rows = [
      { pid: 501, ppid: 1, stat: 'S', command: 'node codex --session 12345678-abcd' },
      { pid: 502, ppid: 501, stat: 'S+', command: '/bin/zsh' }
    ]

    expect(matchAgentSessionLockHolders(rows, '12345678-abcd')).toEqual([
      { pid: 501, ppid: 1, command: 'node codex --session 12345678-abcd' }
    ])
  })

  it('rejects short or missing session ids', () => {
    const rows = [{ pid: 501, ppid: 1, stat: 'S', command: 'node --session abc' }]

    expect(matchAgentSessionLockHolders(rows, '')).toEqual([])
    expect(matchAgentSessionLockHolders(rows, 'abc')).toEqual([])
  })

  it('returns all matching holders', () => {
    const rows = [
      { pid: 501, ppid: 1, stat: 'S', command: 'codex 12345678-abcd' },
      { pid: 502, ppid: 501, stat: 'S+', command: 'claude 12345678-abcd' }
    ]

    expect(matchAgentSessionLockHolders(rows, '12345678-abcd')).toHaveLength(2)
  })
})
