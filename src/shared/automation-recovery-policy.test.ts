import { describe, expect, it } from 'vitest'
import {
  AUTOMATION_MAX_RECOVERY_ATTEMPTS,
  getAutomationRecoveryDecision,
  getExpiredClaimRecoveryDecision
} from './automation-recovery-policy'

describe('automation recovery policy', () => {
  it('retries transient infrastructure failures with backoff', () => {
    expect(
      getAutomationRecoveryDecision({
        status: 'dispatch_failed',
        error: 'fetch failed: ECONNRESET',
        attempts: 1,
        now: 1_000
      })
    ).toEqual({
      kind: 'transient_infrastructure',
      recoverable: true,
      retryAt: 301_000
    })
  })

  it('does not retry authorization or verification failures', () => {
    expect(
      getAutomationRecoveryDecision({
        status: 'dispatch_failed',
        error: 'HTTP 403 Forbidden',
        attempts: 1
      }).recoverable
    ).toBe(false)
    expect(
      getAutomationRecoveryDecision({
        status: 'dispatch_failed',
        error: 'Tests failed',
        attempts: 1
      }).kind
    ).toBe('verification')
  })

  it('stops retrying an expired claim at the attempt budget', () => {
    expect(
      getExpiredClaimRecoveryDecision({ attempts: AUTOMATION_MAX_RECOVERY_ATTEMPTS }).recoverable
    ).toBe(false)
  })
})
