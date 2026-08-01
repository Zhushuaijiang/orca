import type { AutomationRunStatus } from './automations-types'

export type AutomationFailureKind =
  | 'transient_infrastructure'
  | 'host_unavailable'
  | 'authorization'
  | 'configuration'
  | 'verification'
  | 'needs_decision'
  | 'unknown'

export type AutomationRecoveryDecision = {
  kind: AutomationFailureKind
  recoverable: boolean
  retryAt: number | null
}

export const AUTOMATION_MAX_RECOVERY_ATTEMPTS = 3
export const AUTOMATION_CLAIM_LEASE_MS = 12 * 60 * 60 * 1000

const TRANSIENT_FAILURE =
  /(?:ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|ETIMEDOUT|fetch failed|socket hang up|timed out|timeout|HTTP (?:408|409|425|429|5\d\d)|rate limit|temporarily unavailable)/i
const AUTHORIZATION_FAILURE =
  /(?:unauthori[sz]ed|forbidden|HTTP (?:401|403)|\bcredential\b|token missing|\bpassword\b|permission denied|interactive auth)/i
const CONFIGURATION_FAILURE =
  /(?:not configured|configuration|invalid catalog|not in the catalog|missing environment|workspace .*not found|repository .*not found)/i
const VERIFICATION_FAILURE =
  /(?:test(?:s)? failed|build failed|verification failed|lint failed|typecheck failed|smoke check failed|Jenkins build .*ended)/i
const DECISION_FAILURE = /(?:needs[_ -]clarification|blocking question|需求不明确|需要确认|需澄清)/i

export function getAutomationRecoveryDecision(args: {
  status: AutomationRunStatus
  error: string | null | undefined
  attempts: number
  now?: number
}): AutomationRecoveryDecision {
  const now = args.now ?? Date.now()
  const message = args.error ?? ''
  const exhausted = args.attempts >= AUTOMATION_MAX_RECOVERY_ATTEMPTS
  if (DECISION_FAILURE.test(message)) {
    return hardFailure('needs_decision')
  }
  if (AUTHORIZATION_FAILURE.test(message)) {
    return hardFailure('authorization')
  }
  if (CONFIGURATION_FAILURE.test(message)) {
    return hardFailure('configuration')
  }
  if (VERIFICATION_FAILURE.test(message)) {
    return hardFailure('verification')
  }
  if (args.status === 'skipped_unavailable') {
    return retryDecision('host_unavailable', args.attempts, now, exhausted)
  }
  if (TRANSIENT_FAILURE.test(message)) {
    return retryDecision('transient_infrastructure', args.attempts, now, exhausted)
  }
  return hardFailure('unknown')
}

export function getExpiredClaimRecoveryDecision(args: {
  attempts: number
  now?: number
}): AutomationRecoveryDecision {
  return retryDecision(
    'host_unavailable',
    args.attempts,
    args.now ?? Date.now(),
    args.attempts >= AUTOMATION_MAX_RECOVERY_ATTEMPTS
  )
}

function hardFailure(kind: AutomationFailureKind): AutomationRecoveryDecision {
  return { kind, recoverable: false, retryAt: null }
}

function retryDecision(
  kind: AutomationFailureKind,
  attempts: number,
  now: number,
  exhausted: boolean
): AutomationRecoveryDecision {
  if (exhausted) {
    return hardFailure(kind)
  }
  const delayMinutes = Math.min(60, 5 * 2 ** Math.max(0, attempts - 1))
  return { kind, recoverable: true, retryAt: now + delayMinutes * 60 * 1000 }
}
