import { tokenizeCustomCommandTemplate } from './commit-message-prompt'
import { findOptionOccurrence } from './command-option-occurrence'

export function removeAuxiliaryRecipeModelArgs(command: string | undefined): string | undefined {
  if (!command) {
    return command
  }
  const parsed = tokenizeCustomCommandTemplate(command, 'literal')
  if (!parsed.ok) {
    return command
  }
  const tokens = [...parsed.tokens]
  const spans = [...parsed.spans]
  const removals: { start: number; end: number }[] = []
  const aliases = ['--model', '-m', '--effort', '--reasoning-effort', '--thinking', '--variant']
  for (;;) {
    const occurrence = findOptionOccurrence(tokens, aliases, true)
    if (!occurrence) {
      break
    }
    const start = spans[occurrence.index]?.start
    const end = spans[occurrence.index + occurrence.consumed - 1]?.end
    if (start !== undefined && end !== undefined) {
      removals.push({ start, end })
    }
    tokens.splice(occurrence.index, occurrence.consumed)
    spans.splice(occurrence.index, occurrence.consumed)
  }
  for (let index = 0; index < tokens.length; index += 1) {
    if (
      (tokens[index] === '-c' || tokens[index] === '--config') &&
      /^model(?:_reasoning_effort)?=/.test(tokens[index + 1] ?? '')
    ) {
      removals.push({ start: spans[index].start, end: spans[index + 1].end })
      index += 1
    }
  }
  let result = command
  for (const removal of removals.sort((left, right) => right.start - left.start)) {
    result = result.slice(0, removal.start) + result.slice(removal.end)
  }
  return result.trim()
}
