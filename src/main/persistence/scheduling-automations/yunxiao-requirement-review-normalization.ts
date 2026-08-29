import type {
  YunxiaoRequirementDesignAlternative,
  YunxiaoRequirementImplementationPlanSnapshot,
  YunxiaoRequirementMethodologyGate,
  YunxiaoRequirementReviewCheck,
  YunxiaoRequirementReviewTier,
  YunxiaoRequirementRiskProfile,
  YunxiaoRequirementVerificationEvidence
} from '../../../shared/yunxiao-types'
import {
  normalizeOptionalNonEmptyString,
  normalizePositiveTimestamp
} from './yunxiao-field-value-normalization'

function normalizeYunxiaoRequirementReviewTier(value: unknown): YunxiaoRequirementReviewTier {
  return value === 'focused' || value === 'mandatory' ? value : 'none'
}

export function normalizeYunxiaoRequirementRiskProfile(
  value: unknown
): YunxiaoRequirementRiskProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<YunxiaoRequirementRiskProfile>
  return {
    reviewTier: normalizeYunxiaoRequirementReviewTier(candidate.reviewTier),
    reasons: Array.isArray(candidate.reasons)
      ? candidate.reasons
          .map((reason) => normalizeOptionalNonEmptyString(reason))
          .filter((reason): reason is string => reason !== null)
          .slice(0, 10)
      : [],
    uiWorkflow: candidate.uiWorkflow === true,
    apiOrDatabase: candidate.apiOrDatabase === true,
    permissionsOrRelease: candidate.permissionsOrRelease === true,
    multiRepository: candidate.multiRepository === true,
    requirementConflict: candidate.requirementConflict === true,
    weakVerification: candidate.weakVerification === true
  }
}

export function normalizeYunxiaoRequirementReviewCheck(
  value: unknown
): YunxiaoRequirementReviewCheck | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<YunxiaoRequirementReviewCheck>
  if (
    candidate.role !== 'prd_gate' &&
    candidate.role !== 'architecture' &&
    candidate.role !== 'implementation' &&
    candidate.role !== 'verifier'
  ) {
    return null
  }
  if (
    candidate.verdict !== 'pass' &&
    candidate.verdict !== 'conditional_fail' &&
    candidate.verdict !== 'fail'
  ) {
    return null
  }
  return {
    role: candidate.role,
    verdict: candidate.verdict,
    topRisks: Array.isArray(candidate.topRisks)
      ? candidate.topRisks
          .map((risk) => normalizeOptionalNonEmptyString(risk))
          .filter((risk): risk is string => risk !== null)
          .slice(0, 10)
      : [],
    evidence: normalizeOptionalNonEmptyString(candidate.evidence),
    dispatchId: normalizeOptionalNonEmptyString(candidate.dispatchId),
    reviewedAt: normalizePositiveTimestamp(candidate.reviewedAt)
  }
}

function normalizeYunxiaoRequirementDesignAlternative(
  value: unknown,
  index: number
): YunxiaoRequirementDesignAlternative | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<YunxiaoRequirementDesignAlternative>
  const summary = normalizeOptionalNonEmptyString(candidate.summary)
  if (!summary) {
    return null
  }
  return {
    id: normalizeOptionalNonEmptyString(candidate.id) ?? `A${index + 1}`,
    summary,
    tradeoff: normalizeOptionalNonEmptyString(candidate.tradeoff),
    decision:
      candidate.decision === 'selected' ||
      candidate.decision === 'rejected' ||
      candidate.decision === 'deferred'
        ? candidate.decision
        : 'deferred',
    reason: normalizeOptionalNonEmptyString(candidate.reason)
  }
}

function normalizeYunxiaoRequirementImplementationPlanSnapshot(
  value: unknown
): YunxiaoRequirementImplementationPlanSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<YunxiaoRequirementImplementationPlanSnapshot>
  return {
    status:
      candidate.status === 'not_required' ||
      candidate.status === 'required' ||
      candidate.status === 'ready' ||
      candidate.status === 'missing'
        ? candidate.status
        : 'missing',
    path: normalizeOptionalNonEmptyString(candidate.path),
    summary: normalizeOptionalNonEmptyString(candidate.summary),
    updatedAt: normalizePositiveTimestamp(candidate.updatedAt)
  }
}

function normalizeYunxiaoRequirementVerificationEvidence(
  value: unknown,
  index: number
): YunxiaoRequirementVerificationEvidence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<YunxiaoRequirementVerificationEvidence>
  const summary = normalizeOptionalNonEmptyString(candidate.summary)
  if (!summary) {
    return null
  }
  return {
    id: normalizeOptionalNonEmptyString(candidate.id) ?? `VE-${String(index + 1).padStart(3, '0')}`,
    type:
      candidate.type === 'failing_test' ||
      candidate.type === 'passing_test' ||
      candidate.type === 'command' ||
      candidate.type === 'runtime' ||
      candidate.type === 'business' ||
      candidate.type === 'database' ||
      candidate.type === 'build' ||
      candidate.type === 'jenkins' ||
      candidate.type === 'deployment' ||
      candidate.type === 'smoke' ||
      candidate.type === 'screenshot' ||
      candidate.type === 'artifact' ||
      candidate.type === 'yunxiao'
        ? candidate.type
        : 'command',
    command: normalizeOptionalNonEmptyString(candidate.command),
    artifactPath: normalizeOptionalNonEmptyString(candidate.artifactPath),
    result:
      candidate.result === 'pass' || candidate.result === 'fail' || candidate.result === 'blocked'
        ? candidate.result
        : 'blocked',
    summary,
    collectedAt: normalizePositiveTimestamp(candidate.collectedAt)
  }
}

export function normalizeYunxiaoRequirementMethodologyGate(
  value: unknown
): YunxiaoRequirementMethodologyGate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<YunxiaoRequirementMethodologyGate>
  const alternatives = Array.isArray(candidate.alternatives)
    ? candidate.alternatives
        .map((alternative, index) =>
          normalizeYunxiaoRequirementDesignAlternative(alternative, index)
        )
        .filter(
          (alternative): alternative is YunxiaoRequirementDesignAlternative => alternative !== null
        )
        .slice(0, 5)
    : []
  const verificationEvidence = Array.isArray(candidate.verificationEvidence)
    ? candidate.verificationEvidence
        .map((evidence, index) => normalizeYunxiaoRequirementVerificationEvidence(evidence, index))
        .filter((evidence): evidence is YunxiaoRequirementVerificationEvidence => evidence !== null)
        .slice(0, 20)
    : []
  const requiredEvidenceTypes = Array.isArray(candidate.requiredEvidenceTypes)
    ? [
        ...new Set(
          candidate.requiredEvidenceTypes.filter((type) =>
            [
              'failing_test',
              'passing_test',
              'command',
              'runtime',
              'business',
              'database',
              'build',
              'jenkins',
              'deployment',
              'smoke',
              'screenshot',
              'artifact',
              'yunxiao'
            ].includes(type)
          )
        )
      ].slice(0, 13)
    : []
  if (
    candidate.designConfirmed !== true &&
    alternatives.length === 0 &&
    !candidate.implementationPlan &&
    verificationEvidence.length === 0
  ) {
    return null
  }
  return {
    designConfirmed: candidate.designConfirmed === true,
    alternatives,
    implementationPlan: normalizeYunxiaoRequirementImplementationPlanSnapshot(
      candidate.implementationPlan
    ),
    requiredEvidenceTypes,
    verificationEvidence
  }
}
