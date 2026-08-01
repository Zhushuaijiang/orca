import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { executeWorkflow } from '../../resources/dfhis/his-workflow-harness/scripts/his-workflow-orchestrator.mjs'
import {
  assertWorkflowRunIdentity,
  classifyWorkflowError,
  createWorkflowRun,
  loadWorkflowRun,
  resetFailedStagesForResume,
  resetInterruptedAttempts,
  retryDelayMs,
  saveWorkflowRun,
  shouldRetryStage,
  startStageAttempt,
  workflowStage
} from '../../resources/dfhis/his-workflow-harness/scripts/his-workflow-run-state.mjs'

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function workflowRun() {
  return createWorkflowRun({
    action: 'full',
    repo: '/workspace/df-web-test',
    repositoryHead: 'abc123',
    serviceId: 'df-web-test',
    environmentId: 'local-152',
    runtime: { nodeMajor: 18 },
    stages: ['doctor', 'jenkins', 'deploy', 'smoke'],
    runId: 'run-1'
  })
}

describe('HIS workflow durable recovery', () => {
  it('keeps the discovered company environment release contract intact', () => {
    const catalogPath = path.resolve(
      'resources/dfhis/his-workflow-harness/references/company-environments.json'
    )
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
    const services = Object.values(catalog.services)
    const releaseReadyServices = services.filter((service) =>
      Object.values(service.environments ?? {}).some(
        (binding) =>
          binding.jenkins?.job &&
          binding.jenkins?.performsDeployment === true &&
          binding.jenkins?.branchMode !== 'unknown'
      )
    )
    const webMain152 = catalog.services['df-web-main'].environments['local-152'].jenkins

    expect(services.length).toBeGreaterThanOrEqual(55)
    expect(releaseReadyServices.length).toBeGreaterThanOrEqual(50)
    expect(webMain152).toMatchObject({
      job: 'web-main-test',
      performsDeployment: true,
      requiredBranch: 'RC_2.16.1_250514',
      branchMode: 'fixed'
    })
    expect(catalog.environments['local-152'].databaseChecks).not.toHaveLength(0)
    expect(catalog.environments['local-152'].smokeChecks).not.toHaveLength(0)
  })

  it('classifies retryable transport failures separately from hard gates', () => {
    expect(classifyWorkflowError(new Error('fetch failed: ECONNRESET'))).toEqual({
      kind: 'transient',
      retryable: true
    })
    expect(classifyWorkflowError(new Error('HTTP 403 Forbidden'))).toEqual({
      kind: 'authorization',
      retryable: false
    })
    expect(classifyWorkflowError(new Error('Service x is not in the catalog.'))).toEqual({
      kind: 'configuration',
      retryable: false
    })
  })

  it('uses bounded jittered exponential backoff and avoids unsafe stage retries', () => {
    expect(retryDelayMs(1, 1000, () => 0.5)).toBe(1000)
    expect(retryDelayMs(3, 1000, () => 0.5)).toBe(4000)
    const transient = { kind: 'transient', retryable: true }
    expect(shouldRetryStage('jenkins', transient, 1, 3)).toBe(true)
    expect(shouldRetryStage('deploy', transient, 1, 3)).toBe(false)
    expect(shouldRetryStage('smoke', transient, 3, 3)).toBe(false)
  })

  it('atomically persists and reloads workflow state', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'his-workflow-state-'))
    temporaryDirectories.push(directory)
    const filePath = path.join(directory, 'run-state.json')
    const run = workflowRun()
    await saveWorkflowRun(filePath, run)
    expect(JSON.parse(readFileSync(filePath, 'utf8')).runId).toBe('run-1')
    await expect(loadWorkflowRun(filePath)).resolves.toMatchObject({ runId: 'run-1' })
  })

  it('recovers interrupted external and deployment attempts without blind replay', () => {
    const run = workflowRun()
    startStageAttempt(run, 'jenkins')
    workflowStage(run, 'jenkins').external = { queueUrl: 'http://jenkins/queue/item/1/' }
    startStageAttempt(run, 'deploy')
    resetInterruptedAttempts(run)
    expect(workflowStage(run, 'jenkins').status).toBe('recovering')
    expect(workflowStage(run, 'deploy').status).toBe('recovering')
    expect(run.recovery).toHaveLength(2)
  })

  it('refuses resume after repository identity changes', () => {
    const run = workflowRun()
    expect(() =>
      assertWorkflowRunIdentity(run, {
        repo: run.repo,
        repositoryHead: 'different',
        serviceId: run.serviceId,
        environmentId: run.environmentId
      })
    ).toThrow('repositoryHead')
  })

  it('gives an explicitly resumed failed stage a fresh bounded attempt budget', () => {
    const run = workflowRun()
    startStageAttempt(run, 'doctor')
    workflowStage(run, 'doctor').status = 'failed'
    workflowStage(run, 'doctor').attempts[0].status = 'failed'
    run.status = 'failed'
    resetFailedStagesForResume(run)
    expect(workflowStage(run, 'doctor')).toMatchObject({
      status: 'pending',
      attempts: [],
      attemptHistory: [{ status: 'failed' }]
    })
    expect(run.recovery.at(-1)).toMatchObject({ stage: 'doctor', action: 'explicit-resume' })
  })

  it('retries transient stages and records the recovery ledger', async () => {
    const run = createWorkflowRun({
      action: 'full',
      repo: '/workspace/df-web-test',
      runtime: {},
      stages: ['doctor'],
      runId: 'retry-run'
    })
    let calls = 0
    await executeWorkflow(
      { run, options: { retryBaseMs: 0 }, persist: async () => {} },
      {
        runStage: async () => {
          calls += 1
          if (calls < 3) {
            throw new Error('fetch failed: ECONNRESET')
          }
          return [{ type: 'command', result: 'pass' }]
        },
        deploymentCheck: async () => null,
        rollback: async () => false
      }
    )
    expect(calls).toBe(3)
    expect(workflowStage(run, 'doctor').status).toBe('passed')
    expect(run.recovery.map((entry) => entry.action)).toEqual([
      'retry-scheduled',
      'retry-scheduled'
    ])
  })

  it('rolls back after smoke verification exhausts its retry budget', async () => {
    const run = createWorkflowRun({
      action: 'full',
      repo: '/workspace/df-web-test',
      runtime: {},
      stages: ['smoke'],
      runId: 'rollback-run'
    })
    let rollbackCalls = 0
    await expect(
      executeWorkflow(
        { run, options: { maxAttempts: 1 }, persist: async () => {} },
        {
          runStage: async () => {
            throw new Error('Smoke check failed: HTTP 503')
          },
          deploymentCheck: async () => null,
          rollback: async () => {
            rollbackCalls += 1
            return true
          }
        }
      )
    ).rejects.toThrow('Smoke check failed')
    expect(rollbackCalls).toBe(1)
  })
})
