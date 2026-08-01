import type {
  YunxiaoRequirementContractSnapshot,
  YunxiaoRequirementReviewCheck,
  YunxiaoRequirementReviewTier,
  YunxiaoRequirementRiskProfile
} from './yunxiao-types'

type ReviewRole = YunxiaoRequirementReviewCheck['role']

export type YunxiaoRequirementReviewExpectation = {
  reviewTier: YunxiaoRequirementReviewTier
  requiredRoles: ReviewRole[]
  requiresImplementationPlan: boolean
  requiresVerificationEvidence: boolean
  requiresTestFirstEvidence: boolean
  reasons: string[]
}

export type YunxiaoRequirementCompletionGate = {
  ready: boolean
  gaps: string[]
}

const HIGH_RISK_ROLES: ReviewRole[] = ['prd_gate', 'architecture', 'implementation', 'verifier']
const FOCUSED_ROLES: ReviewRole[] = ['prd_gate', 'verifier']

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function getYunxiaoRequirementReviewExpectation(
  contract: Pick<
    YunxiaoRequirementContractSnapshot,
    'status' | 'blockingQuestions' | 'riskProfile'
  > | null
): YunxiaoRequirementReviewExpectation {
  const profile = contract?.riskProfile ?? null
  const hasBlockingQuestions = (contract?.blockingQuestions.length ?? 0) > 0
  const objectiveReasons = getYunxiaoRequirementRiskReasons(profile, hasBlockingQuestions)
  const mandatory =
    profile?.reviewTier === 'mandatory' ||
    profile?.permissionsOrRelease === true ||
    profile?.multiRepository === true ||
    (profile?.apiOrDatabase === true && profile?.weakVerification === true) ||
    (profile?.uiWorkflow === true && profile?.requirementConflict === true)
  const focused =
    mandatory ||
    profile?.reviewTier === 'focused' ||
    hasBlockingQuestions ||
    profile?.uiWorkflow === true ||
    profile?.apiOrDatabase === true ||
    profile?.requirementConflict === true ||
    profile?.weakVerification === true

  return {
    reviewTier: mandatory ? 'mandatory' : focused ? 'focused' : 'none',
    requiredRoles: mandatory ? HIGH_RISK_ROLES : focused ? FOCUSED_ROLES : [],
    requiresImplementationPlan: focused,
    requiresVerificationEvidence: focused || contract?.status === 'ready_to_verify',
    requiresTestFirstEvidence:
      profile?.apiOrDatabase === true ||
      profile?.permissionsOrRelease === true ||
      profile?.weakVerification === true,
    reasons: objectiveReasons
  }
}

export function getYunxiaoRequirementCompletionGate(
  contract: Pick<
    YunxiaoRequirementContractSnapshot,
    'status' | 'blockingQuestions' | 'riskProfile' | 'reviewChecks' | 'methodologyGate'
  > | null
): YunxiaoRequirementCompletionGate {
  if (!contract) {
    return { ready: false, gaps: ['Requirement Contract is missing.'] }
  }
  const expectation = getYunxiaoRequirementReviewExpectation(contract)
  const gate = contract.methodologyGate ?? null
  const gaps: string[] = []
  if (contract.status === 'needs_clarification' || contract.blockingQuestions.length > 0) {
    gaps.push('Blocking product decisions are unresolved.')
  }
  if (expectation.requiresImplementationPlan && gate?.implementationPlan?.status !== 'ready') {
    gaps.push('Implementation plan is required before edits.')
  }
  const passedRoles = new Set(
    contract.reviewChecks.filter((check) => check.verdict === 'pass').map((check) => check.role)
  )
  const missingRoles = expectation.requiredRoles.filter((role) => !passedRoles.has(role))
  if (missingRoles.length > 0) {
    gaps.push(`Required review checks are missing: ${missingRoles.join(', ')}.`)
  }
  if (
    expectation.requiresTestFirstEvidence &&
    !gate?.verificationEvidence.some((evidence) => evidence.type === 'failing_test')
  ) {
    gaps.push('Test-first evidence is required.')
  }
  if (
    expectation.requiresVerificationEvidence &&
    !gate?.verificationEvidence.some((evidence) => evidence.result === 'pass')
  ) {
    gaps.push('Fresh passing verification evidence is required.')
  }
  const requiredEvidenceTypes = new Set(gate?.requiredEvidenceTypes ?? [])
  if (contract.riskProfile?.uiWorkflow) {
    requiredEvidenceTypes.add('screenshot')
  }
  if (contract.riskProfile?.apiOrDatabase) {
    requiredEvidenceTypes.add('passing_test')
  }
  if (contract.riskProfile?.permissionsOrRelease) {
    for (const type of ['build', 'jenkins', 'deployment', 'smoke'] as const) {
      requiredEvidenceTypes.add(type)
    }
  }
  const passedEvidenceTypes = new Set(
    (gate?.verificationEvidence ?? [])
      .filter((evidence) => evidence.result === 'pass')
      .map((evidence) => evidence.type)
  )
  const missingEvidenceTypes = [...requiredEvidenceTypes].filter(
    (type) => !passedEvidenceTypes.has(type)
  )
  if (missingEvidenceTypes.length > 0) {
    gaps.push(`Required delivery evidence is missing: ${missingEvidenceTypes.join(', ')}.`)
  }
  return { ready: gaps.length === 0, gaps }
}

export function getYunxiaoRequirementRiskReasons(
  profile: YunxiaoRequirementRiskProfile | null,
  hasBlockingQuestions = false
): string[] {
  if (!profile) {
    return hasBlockingQuestions ? ['Blocking product decision is unresolved.'] : []
  }
  const reasons = [...profile.reasons]
  if (hasBlockingQuestions) {
    reasons.push('Blocking product decision is unresolved.')
  }
  if (profile.uiWorkflow) {
    reasons.push('UI or workflow behavior can regress.')
  }
  if (profile.apiOrDatabase) {
    reasons.push('API, database, or persisted behavior can change.')
  }
  if (profile.permissionsOrRelease) {
    reasons.push('Permission, rollout, or release behavior can change.')
  }
  if (profile.multiRepository) {
    reasons.push('Multiple repositories, apps, platforms, or execution hosts are affected.')
  }
  if (profile.requirementConflict) {
    reasons.push('Requirement evidence conflicts with current behavior or implementation.')
  }
  if (profile.weakVerification) {
    reasons.push('Verification oracle is weak or local testing is blocked.')
  }
  return uniqueStrings(reasons).slice(0, 10)
}
