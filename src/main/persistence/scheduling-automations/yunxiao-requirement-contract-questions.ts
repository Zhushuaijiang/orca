import type {
  YunxiaoRequirementContractDecision,
  YunxiaoRequirementContractOwner,
  YunxiaoRequirementContractQuestion,
  YunxiaoRequirementContractQuestionOption,
  YunxiaoRequirementContractStatus
} from '../../../shared/yunxiao-types'
import {
  normalizeOptionalNonEmptyString,
  normalizePositiveTimestamp
} from './yunxiao-field-value-normalization'

export function normalizeYunxiaoRequirementContractStatus(
  value: unknown
): YunxiaoRequirementContractStatus | null {
  return value === 'needs_clarification' ||
    value === 'ready_to_build' ||
    value === 'missing_repo' ||
    value === 'blocked' ||
    value === 'ready_to_verify'
    ? value
    : null
}

export function normalizeYunxiaoRequirementContractOwner(
  value: unknown
): YunxiaoRequirementContractOwner {
  return value === 'product' ||
    value === 'development' ||
    value === 'qa' ||
    value === 'agent' ||
    value === 'external'
    ? value
    : 'agent'
}

function normalizeYunxiaoRequirementContractQuestionOption(
  value: unknown
): YunxiaoRequirementContractQuestionOption | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<YunxiaoRequirementContractQuestionOption>
  const label = normalizeOptionalNonEmptyString(candidate.label)
  if (!label) {
    return null
  }
  return {
    ...(normalizeOptionalNonEmptyString(candidate.id)
      ? { id: normalizeOptionalNonEmptyString(candidate.id)! }
      : {}),
    label,
    impact: normalizeOptionalNonEmptyString(candidate.impact),
    ...(candidate.recommended === true ? { recommended: true } : {})
  }
}

export function normalizeYunxiaoRequirementContractQuestion(
  value: unknown,
  index: number
): YunxiaoRequirementContractQuestion | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<YunxiaoRequirementContractQuestion>
  const question = normalizeOptionalNonEmptyString(candidate.question)
  if (!question) {
    return null
  }
  const id = normalizeOptionalNonEmptyString(candidate.id) ?? `Q${index + 1}`
  const options = Array.isArray(candidate.options)
    ? candidate.options
        .map((option) => normalizeYunxiaoRequirementContractQuestionOption(option))
        .filter((option): option is YunxiaoRequirementContractQuestionOption => option !== null)
    : []
  return {
    id,
    question,
    whyBlocking: normalizeOptionalNonEmptyString(candidate.whyBlocking),
    options: options.slice(0, 5)
  }
}

export function normalizeYunxiaoRequirementContractDecision(
  value: unknown,
  index: number
): YunxiaoRequirementContractDecision | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<YunxiaoRequirementContractDecision>
  const summary = normalizeOptionalNonEmptyString(candidate.summary)
  if (!summary) {
    return null
  }
  return {
    id: normalizeOptionalNonEmptyString(candidate.id) ?? `D-${String(index + 1).padStart(3, '0')}`,
    summary,
    source: normalizeOptionalNonEmptyString(candidate.source),
    impact: normalizeOptionalNonEmptyString(candidate.impact),
    decidedAt: normalizePositiveTimestamp(candidate.decidedAt),
    answeredBy: normalizeOptionalNonEmptyString(candidate.answeredBy),
    answerSourceType:
      candidate.answerSourceType === 'orca_ui' ||
      candidate.answerSourceType === 'yunxiao_comment' ||
      candidate.answerSourceType === 'agent' ||
      candidate.answerSourceType === 'manual'
        ? candidate.answerSourceType
        : null,
    yunxiaoCommentId: normalizeOptionalNonEmptyString(candidate.yunxiaoCommentId),
    selectedOptionId: normalizeOptionalNonEmptyString(candidate.selectedOptionId)
  }
}
