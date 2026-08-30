import { optionName } from './print-mode-headless-command'

// Why: ZCode's one-shot flags all bypass the TUI — `--prompt <text>` runs a
// single prompt, `-p/--print` runs a positional prompt, and `--max-turns`
// only bounds a headless run — so any of them means Orca is not hosting a
// live session.
const ZCODE_HEADLESS_ONE_SHOT_FLAGS = new Set(['--prompt', '-p', '--print', '--max-turns'])

export function isZcodeHeadlessOneShotCommand(tokens: readonly string[]): boolean {
  for (let index = 1; index < tokens.length; index += 1) {
    // Why: `--` ends option parsing, so a positional prompt that reads like a
    // flag is still a prompt.
    if (tokens[index] === '--') {
      return false
    }
    if (ZCODE_HEADLESS_ONE_SHOT_FLAGS.has(optionName(tokens[index]))) {
      return true
    }
  }
  return false
}
