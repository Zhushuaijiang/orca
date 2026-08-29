import type {
  YunxiaoRequirementContractDecision,
  YunxiaoRequirementContractQuestion,
  YunxiaoRequirementContractSnapshot,
  YunxiaoRequirementGateOutcome,
  YunxiaoRequirementReviewCheck
} from '../../../shared/yunxiao-types'
import {
  normalizeOptionalNonEmptyString,
  normalizePositiveTimestamp,
  normalizeRequiredString,
  normalizeYunxiaoTodoPoolStatus
} from './yunxiao-field-value-normalization'
import {
  normalizeYunxiaoRequirementContractDecision,
  normalizeYunxiaoRequirementContractOwner,
  normalizeYunxiaoRequirementContractQuestion,
  normalizeYunxiaoRequirementContractStatus
} from './yunxiao-requirement-contract-questions'
import {
  normalizeYunxiaoRequirementMethodologyGate,
  normalizeYunxiaoRequirementReviewCheck,
  normalizeYunxiaoRequirementRiskProfile
} from './yunxiao-requirement-review-normalization'

export function normalizeYunxiaoRequirementContract(
  value: unknown
): YunxiaoRequirementContractSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<YunxiaoRequirementContractSnapshot>
  const status = normalizeYunxiaoRequirementContractStatus(candidate.status)
  if (!status) {
    return null
  }
  return {
    status,
    owner: normalizeYunxiaoRequirementContractOwner(candidate.owner),
    nextAction: normalizeRequiredString(candidate.nextAction),
    intent: normalizeRequiredString(candidate.intent),
    archiveDir: normalizeOptionalNonEmptyString(candidate.archiveDir),
    prdPath: normalizeOptionalNonEmptyString(candidate.prdPath),
    evidenceUpdatedAt: normalizePositiveTimestamp(candidate.evidenceUpdatedAt),
    updatedAt: normalizePositiveTimestamp(candidate.updatedAt) ?? Date.now(),
    blockingQuestions: Array.isArray(candidate.blockingQuestions)
      ? candidate.blockingQuestions
          .map((question, index) => normalizeYunxiaoRequirementContractQuestion(question, index))
          .filter((question): question is YunxiaoRequirementContractQuestion => question !== null)
          .slice(0, 10)
      : [],
    decisions: Array.isArray(candidate.decisions)
      ? candidate.decisions
          .map((decision, index) => normalizeYunxiaoRequirementContractDecision(decision, index))
          .filter((decision): decision is YunxiaoRequirementContractDecision => decision !== null)
          .slice(0, 20)
      : [],
    riskProfile: normalizeYunxiaoRequirementRiskProfile(candidate.riskProfile),
    reviewChecks: Array.isArray(candidate.reviewChecks)
      ? candidate.reviewChecks
          .map((check) => normalizeYunxiaoRequirementReviewCheck(check))
          .filter((check): check is YunxiaoRequirementReviewCheck => check !== null)
          .slice(0, 10)
      : [],
    methodologyGate: normalizeYunxiaoRequirementMethodologyGate(candidate.methodologyGate)
  }
}

function normalizeYunxiaoRequirementGateOutcome(
  value: unknown
): YunxiaoRequirementGateOutcome | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<YunxiaoRequirementGateOutcome>
  const itemId = normalizeOptionalNonEmptyString(candidate.itemId)
  const poolStatus =
    candidate.poolStatus === null || candidate.poolStatus === undefined
      ? null
      : normalizeYunxiaoTodoPoolStatus(candidate.poolStatus)
  const requirementContract = normalizeYunxiaoRequirementContract(candidate.requirementContract)
  if (!itemId && !poolStatus && !requirementContract) {
    return null
  }
  return {
    itemId,
    poolStatus,
    requirementContract,
    evidence: normalizeOptionalNonEmptyString(candidate.evidence),
    updatedAt: normalizePositiveTimestamp(candidate.updatedAt) ?? Date.now()
  }
}

export function normalizeYunxiaoRequirementGateOutcomes(
  value: unknown
): YunxiaoRequirementGateOutcome[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const outcomes = value
    .map((entry) => normalizeYunxiaoRequirementGateOutcome(entry))
    .filter((entry): entry is YunxiaoRequirementGateOutcome => entry !== null)
    .slice(0, 20)
  return outcomes.length > 0 ? outcomes : null
}
