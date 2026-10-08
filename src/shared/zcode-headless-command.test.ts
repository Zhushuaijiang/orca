import { describe, expect, it } from 'vitest'
import { isHeadlessOneShotAgentCommand } from './agent-headless-command'
import { isZCodeHeadlessOneShotCommand } from './zcode-headless-command'

describe('isZCodeHeadlessOneShotCommand', () => {
  it.each([
    [['zcode', '--prompt', 'fix the bug']],
    [['zcode', '-p', 'fix the bug']],
    [['zcode', '--print', 'fix the bug']],
    [['zcode', '--max-turns', '3']],
    [['zcode', '--prompt=ship it']],
    [['zcode', '--surface', 'terminal', '--prompt', 'ship it']]
  ])('treats %j as a headless one-shot', (tokens) => {
    expect(isZCodeHeadlessOneShotCommand(tokens)).toBe(true)
    expect(isHeadlessOneShotAgentCommand('zcode', tokens)).toBe(true)
  })

  it.each([
    [['zcode']],
    [['zcode', '--resume', 'sess_1234']],
    [['zcode', '--continue']],
    // Why: `--` ends option parsing, so a positional prompt reading like a
    // flag is still a prompt.
    [['zcode', '--', '--prompt']],
    [['zcode', '--surface', 'terminal']]
  ])('treats %j as a live TUI session', (tokens) => {
    expect(isZCodeHeadlessOneShotCommand(tokens)).toBe(false)
    expect(isHeadlessOneShotAgentCommand('zcode', tokens)).toBe(false)
  })
})
