import type { AutomationRunOutputSnapshot } from './automations-types'
import type {
  YunxiaoRequirementContractOwner,
  YunxiaoRequirementContractStatus,
  YunxiaoRequirementGateOutcome,
  YunxiaoTodoPoolStatus
} from './yunxiao-types'

const JSON_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/gi
const OUTCOMES_KEY_PATTERN = /"yunxiaoRequirementOutcomes"\s*:/g
const TEXT_OUTCOMES_KEY_PATTERN = /^yunxiaoRequirementOutcomes\s*:\s*$/im
const TEXT_OUTCOME_ITEM_PATTERN = /^\s*-\s*itemId\s*:\s*(\S[^\n]*)$/gim

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

function normalizeTextOutcomeStatus(value: string | null): YunxiaoTodoPoolStatus | null {
  const normalized = value?.trim().toLowerCase().replaceAll('_', '-')
  if (!normalized) {
    return null
  }
  if (
    normalized === 'ready-to-verify' ||
    normalized === '待测试' ||
    normalized === '开发测试' ||
    normalized === '已完成'
  ) {
    return 'done'
  }
  if (normalized === 'needs-clarification' || normalized === '需澄清') {
    return 'needs-clarification'
  }
  if (normalized === 'ready-to-build' || normalized === '可开发') {
    return 'ready-to-build'
  }
  if (normalized === 'queued' || normalized === '排队') {
    return 'queued'
  }
  if (normalized === 'failed' || normalized === '失败') {
    return 'failed'
  }
  if (normalized === 'dismissed' || normalized === '已忽略') {
    return 'dismissed'
  }
  return normalized === 'done' ? 'done' : null
}

function normalizeTextContractStatus(
  value: string | null
): YunxiaoRequirementContractStatus | null {
  const normalized = value?.trim().toLowerCase().replaceAll('-', '_')
  if (
    normalized === 'needs_clarification' ||
    normalized === 'ready_to_build' ||
    normalized === 'missing_repo' ||
    normalized === 'blocked' ||
    normalized === 'ready_to_verify'
  ) {
    return normalized
  }
  return null
}

function normalizeTextContractOwner(value: string | null): YunxiaoRequirementContractOwner {
  const normalized = value?.trim().toLowerCase()
  if (
    normalized === 'product' ||
    normalized === 'development' ||
    normalized === 'qa' ||
    normalized === 'agent' ||
    normalized === 'external'
  ) {
    return normalized
  }
  return 'agent'
}

function extractTextField(block: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = block.match(new RegExp(`^\\s*${escapedKey}\\s*:\\s*(\\S[^\\n]*)$`, 'im'))
  return match?.[1]?.trim() ?? null
}

function extractTextEvidence(text: string): string | null {
  const match = text.match(/^验证结果\s*[:：]\s*(\S[^\n]*)$/im)
  return match?.[1]?.trim() ?? null
}

function createTextReadyToVerifyContract(args: {
  block: string
  evidence: string | null
  status: YunxiaoRequirementContractStatus
  updatedAt: number
}): YunxiaoRequirementGateOutcome['requirementContract'] {
  const evidenceSummary = args.evidence ?? 'Automation reported ready_to_verify.'
  return {
    status: args.status,
    owner: normalizeTextContractOwner(extractTextField(args.block, 'owner')),
    nextAction:
      extractTextField(args.block, 'next_action') ??
      extractTextField(args.block, 'nextAction') ??
      (args.status === 'ready_to_verify' ? 'QA verify.' : ''),
    intent: extractTextField(args.block, 'intent') ?? evidenceSummary,
    archiveDir: extractTextField(args.block, 'archiveDir'),
    prdPath: extractTextField(args.block, 'prdPath'),
    evidenceUpdatedAt: args.updatedAt,
    updatedAt: args.updatedAt,
    blockingQuestions: [],
    decisions: [],
    riskProfile: null,
    reviewChecks: [],
    methodologyGate:
      args.status === 'ready_to_verify'
        ? {
            designConfirmed: true,
            alternatives: [],
            implementationPlan: {
              status: 'not_required',
              path: null,
              summary: null,
              updatedAt: args.updatedAt
            },
            verificationEvidence: [
              {
                id: 'V-001',
                type: 'command',
                command: null,
                artifactPath: null,
                result: 'pass',
                summary: evidenceSummary,
                collectedAt: args.updatedAt
              }
            ]
          }
        : null
  }
}

function extractTextFormOutcomesFromText(text: string): YunxiaoRequirementGateOutcome[] | null {
  const keyMatch = text.match(TEXT_OUTCOMES_KEY_PATTERN)
  if (!keyMatch) {
    return null
  }
  const searchStart = (keyMatch.index ?? 0) + keyMatch[0].length
  const matches = [...text.slice(searchStart).matchAll(TEXT_OUTCOME_ITEM_PATTERN)]
  if (matches.length === 0) {
    return null
  }
  const evidence = extractTextEvidence(text)
  const updatedAt = Date.now()
  const outcomes = matches
    .map((match, index): YunxiaoRequirementGateOutcome | null => {
      const blockStart = match.index ?? 0
      const nextBlockStart = matches[index + 1]?.index
      const block = text.slice(
        searchStart + blockStart,
        nextBlockStart === undefined ? undefined : searchStart + nextBlockStart
      )
      const itemId = match[1]?.trim() ?? null
      const contractStatus = normalizeTextContractStatus(extractTextField(block, 'status'))
      const poolStatus =
        normalizeTextOutcomeStatus(extractTextField(block, 'poolStatus')) ??
        (contractStatus === 'ready_to_verify'
          ? 'done'
          : contractStatus === 'ready_to_build'
            ? 'ready-to-build'
            : contractStatus === 'needs_clarification'
              ? 'needs-clarification'
              : null)
      if (!itemId || !poolStatus) {
        return null
      }
      const requirementContract = createTextReadyToVerifyContract({
        block,
        evidence,
        status: contractStatus ?? (poolStatus === 'done' ? 'ready_to_verify' : 'ready_to_build'),
        updatedAt
      })
      return {
        itemId,
        poolStatus,
        requirementContract,
        evidence,
        updatedAt
      } satisfies YunxiaoRequirementGateOutcome
    })
    .filter((outcome): outcome is YunxiaoRequirementGateOutcome => outcome !== null)
  return outcomes.length > 0 ? outcomes : null
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
  return extractEmbeddedOutcomesFromText(text) ?? extractTextFormOutcomesFromText(text)
}

export function extractYunxiaoRequirementGateOutcomesFromSnapshot(
  snapshot: AutomationRunOutputSnapshot | null
): YunxiaoRequirementGateOutcome[] | null {
  return extractYunxiaoRequirementGateOutcomesFromText(snapshot?.content)
}
