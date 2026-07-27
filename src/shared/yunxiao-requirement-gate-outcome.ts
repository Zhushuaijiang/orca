import type { AutomationRunOutputSnapshot } from './automations-types'
import type { YunxiaoRequirementGateOutcome } from './yunxiao-types'

const JSON_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/gi
const OUTCOMES_KEY_PATTERN = /"yunxiaoRequirementOutcomes"\s*:/g

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseJsonCandidate(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function extractOutcomesFromParsed(value: unknown): YunxiaoRequirementGateOutcome[] | null {
  if (Array.isArray(value)) {
    return value as YunxiaoRequirementGateOutcome[]
  }
  if (!isRecord(value)) {
    return null
  }
  const outcomes = value.yunxiaoRequirementOutcomes
  if (Array.isArray(outcomes)) {
    return outcomes as YunxiaoRequirementGateOutcome[]
  }
  const outcome = value.yunxiaoRequirementOutcome
  if (isRecord(outcome)) {
    return [outcome as YunxiaoRequirementGateOutcome]
  }
  if ('poolStatus' in value || 'requirementContract' in value || 'itemId' in value) {
    return [value as YunxiaoRequirementGateOutcome]
  }
  return null
}

function extractJsonValueAfterKey(text: string, valueStartIndex: number): string | null {
  const opener = text[valueStartIndex]
  const closer = opener === '[' ? ']' : opener === '{' ? '}' : null
  if (!closer) {
    return null
  }
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = valueStartIndex; index < text.length; index += 1) {
    const character = text[index]!
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === opener) {
      depth += 1
    } else if (character === closer) {
      depth -= 1
      if (depth === 0) {
        return text.slice(valueStartIndex, index + 1)
      }
    }
  }
  return null
}

function extractEmbeddedOutcomesFromText(text: string): YunxiaoRequirementGateOutcome[] | null {
  for (const match of text.matchAll(OUTCOMES_KEY_PATTERN)) {
    let valueStartIndex = (match.index ?? 0) + match[0].length
    while (/\s/.test(text[valueStartIndex] ?? '')) {
      valueStartIndex += 1
    }
    const jsonValue = extractJsonValueAfterKey(text, valueStartIndex)
    if (!jsonValue) {
      continue
    }
    const outcomes = extractOutcomesFromParsed(
      parseJsonCandidate(`{"yunxiaoRequirementOutcomes":${jsonValue}}`)
    )
    if (outcomes?.length) {
      return outcomes
    }
  }
  return null
}

export function extractYunxiaoRequirementGateOutcomesFromText(
  content: string | null | undefined
): YunxiaoRequirementGateOutcome[] | null {
  const text = content?.trim()
  if (!text) {
    return null
  }
  const candidates: string[] = []
  for (const match of text.matchAll(JSON_FENCE_PATTERN)) {
    if (match[1]?.trim()) {
      candidates.push(match[1].trim())
    }
  }
  candidates.push(text)
  for (const candidate of candidates) {
    const outcomes = extractOutcomesFromParsed(parseJsonCandidate(candidate))
    if (outcomes?.length) {
      return outcomes
    }
  }
  return extractEmbeddedOutcomesFromText(text)
}

export function extractYunxiaoRequirementGateOutcomesFromSnapshot(
  snapshot: AutomationRunOutputSnapshot | null
): YunxiaoRequirementGateOutcome[] | null {
  return extractYunxiaoRequirementGateOutcomesFromText(snapshot?.content)
}
