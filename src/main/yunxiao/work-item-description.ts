/**
 * Yunxiao returns `description` either as markdown or as rich-text HTML depending on the
 * item's formatType. The deepening compiler needs readable text with paragraph breaks, so
 * this keeps structure instead of collapsing whitespace the way the archive reader does.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const isHex = entity[1]?.toLowerCase() === 'x'
      const code = Number.parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text.trim().startsWith('{')) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * Yunxiao returns rich-text descriptions as `{"htmlValue": "...", "jsonMLValue": ...}`
 * either as an object or as a JSON string, so the payload must be unwrapped before the
 * HTML is flattened — otherwise the deepening prompt is fed escaped JSON.
 */
function unwrapRichText(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = parseJsonObject(value)
    return parsed ? unwrapRichText(parsed) : value
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['markdownValue', 'htmlValue', 'text', 'value']) {
      const inner = record[key]
      if (typeof inner === 'string' && inner.trim()) {
        return inner
      }
    }
    return JSON.stringify(value)
  }
  return ''
}

export function normalizeYunxiaoWorkItemDescription(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  const raw = unwrapRichText(value)
  if (!raw) {
    return ''
  }
  const withBreaks = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  return decodeEntities(withBreaks)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
