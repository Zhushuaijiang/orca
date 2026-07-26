import type { AutomationRunOutputSnapshot } from './automations-types'
import type { YunxiaoRequirementGateOutcome } from './yunxiao-types'

const JSON_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/gi

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
  return null
}

export function extractYunxiaoRequirementGateOutcomesFromSnapshot(
  snapshot: AutomationRunOutputSnapshot | null
): YunxiaoRequirementGateOutcome[] | null {
  return extractYunxiaoRequirementGateOutcomesFromText(snapshot?.content)
}
