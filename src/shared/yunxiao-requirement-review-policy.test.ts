import { describe, expect, it } from 'vitest'

import type { YunxiaoRequirementContractSnapshot } from './yunxiao-types'
import {
  getYunxiaoRequirementCompletionGate,
  getYunxiaoRequirementReviewExpectation
} from './yunxiao-requirement-review-policy'

const baseContract: YunxiaoRequirementContractSnapshot = {
  status: 'ready_to_build',
  owner: 'development',
  nextAction: 'Implement the approved scope.',
  intent: 'Keep the requirement bounded.',
  archiveDir: null,
  prdPath: null,
  evidenceUpdatedAt: null,
  updatedAt: 1,
  blockingQuestions: [],
  decisions: [],
  riskProfile: null,
  reviewChecks: []
}

describe('getYunxiaoRequirementReviewExpectation', () => {
  it('defaults low-risk requirements to one builder plus verification', () => {
    expect(getYunxiaoRequirementReviewExpectation(baseContract)).toMatchObject({
      reviewTier: 'none',
      requiredRoles: [],
      requiresImplementationPlan: false,
      requiresVerificationEvidence: false,
      requiresTestFirstEvidence: false
    })
  })

  it('requires focused review for unresolved blocking decisions', () => {
    expect(
      getYunxiaoRequirementReviewExpectation({
        ...baseContract,
        status: 'needs_clarification',
        blockingQuestions: [
          {
            id: 'Q1',
            question: 'Should historical data be migrated?',
            whyBlocking: 'Implementation diverges by answer.',
            options: []
          }
        ]
      })
    ).toMatchObject({
      reviewTier: 'focused',
      requiredRoles: ['prd_gate', 'verifier'],
      requiresImplementationPlan: true
    })
  })

  it('escalates high-risk API/database changes with weak verification to mandatory review', () => {
    expect(
      getYunxiaoRequirementReviewExpectation({
        ...baseContract,
        riskProfile: {
          reviewTier: 'focused',
          reasons: ['Affects order synchronization.'],
          uiWorkflow: false,
          apiOrDatabase: true,
          permissionsOrRelease: false,
          multiRepository: false,
          requirementConflict: false,
          weakVerification: true
        }
      })
    ).toMatchObject({
      reviewTier: 'mandatory',
      requiredRoles: ['prd_gate', 'architecture', 'implementation', 'verifier'],
      requiresVerificationEvidence: true,
      requiresTestFirstEvidence: true
    })
  })
})

describe('getYunxiaoRequirementCompletionGate', () => {
  it('blocks completion when mandatory methodology evidence is missing', () => {
    const result = getYunxiaoRequirementCompletionGate({
      ...baseContract,
      riskProfile: {
        reviewTier: 'mandatory',
        reasons: ['Release behavior changes.'],
        uiWorkflow: false,
        apiOrDatabase: true,
        permissionsOrRelease: true,
        multiRepository: false,
        requirementConflict: false,
        weakVerification: true
      },
      methodologyGate: {
        designConfirmed: true,
        alternatives: [],
        implementationPlan: { status: 'missing', path: null, summary: null, updatedAt: null },
        verificationEvidence: []
      }
    })

    expect(result.ready).toBe(false)
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        'Implementation plan is required before edits.',
        'Test-first evidence is required.',
        'Fresh passing verification evidence is required.'
      ])
    )
    expect(result.gaps.some((gap) => gap.includes('prd_gate'))).toBe(true)
  })

  it('passes completion when required plan, review, and verification evidence are present', () => {
    expect(
      getYunxiaoRequirementCompletionGate({
        ...baseContract,
        status: 'ready_to_verify',
        riskProfile: {
          reviewTier: 'mandatory',
          reasons: ['Release behavior changes.'],
          uiWorkflow: false,
          apiOrDatabase: true,
          permissionsOrRelease: true,
          multiRepository: false,
          requirementConflict: false,
          weakVerification: true
        },
        reviewChecks: [
          {
            role: 'prd_gate',
            verdict: 'pass',
            topRisks: [],
            evidence: null,
            dispatchId: null,
            reviewedAt: 1
          },
          {
            role: 'architecture',
            verdict: 'pass',
            topRisks: [],
            evidence: null,
            dispatchId: null,
            reviewedAt: 1
          },
          {
            role: 'implementation',
            verdict: 'pass',
            topRisks: [],
            evidence: null,
            dispatchId: null,
            reviewedAt: 1
          },
          {
            role: 'verifier',
            verdict: 'pass',
            topRisks: [],
            evidence: null,
            dispatchId: null,
            reviewedAt: 1
          }
        ],
        methodologyGate: {
          designConfirmed: true,
          alternatives: [
            {
              id: 'A1',
              summary: 'Keep the existing release path.',
              tradeoff: null,
              decision: 'selected',
              reason: 'Lowest rollout risk.'
            }
          ],
          implementationPlan: {
            status: 'ready',
            path: 'PRD_AND_CODE_ANALYSIS.md#implementation-plan',
            summary: 'Plan is recorded in the PRD.',
            updatedAt: 1
          },
          verificationEvidence: [
            {
              id: 'VE-001',
              type: 'failing_test',
              command: 'pnpm test',
              artifactPath: null,
              result: 'fail',
              summary: 'Regression reproduced before implementation.',
              collectedAt: 1
            },
            {
              id: 'VE-002',
              type: 'passing_test',
              command: 'pnpm test',
              artifactPath: null,
              result: 'pass',
              summary: 'Regression suite passed.',
              collectedAt: 2
            },
            {
              id: 'VE-003',
              type: 'build',
              command: 'pnpm build',
              artifactPath: null,
              result: 'pass',
              summary: 'Release build passed.',
              collectedAt: 3
            },
            {
              id: 'VE-004',
              type: 'jenkins',
              command: null,
              artifactPath: null,
              result: 'pass',
              summary: 'Jenkins build passed.',
              collectedAt: 4
            },
            {
              id: 'VE-005',
              type: 'deployment',
              command: null,
              artifactPath: null,
              result: 'pass',
              summary: 'Deployment completed.',
              collectedAt: 5
            },
            {
              id: 'VE-006',
              type: 'smoke',
              command: null,
              artifactPath: null,
              result: 'pass',
              summary: 'Online smoke checks passed.',
              collectedAt: 6
            },
            {
              id: 'VE-007',
              type: 'runtime',
              command: 'node --version',
              artifactPath: null,
              result: 'pass',
              summary: 'Repository runtime was selected.',
              collectedAt: 7
            },
            {
              id: 'VE-008',
              type: 'yunxiao',
              command: null,
              artifactPath: null,
              result: 'pass',
              summary: 'Yunxiao fields were updated and read back.',
              collectedAt: 8
            }
          ]
        }
      })
    ).toEqual({ ready: true, gaps: [] })
  })
})
