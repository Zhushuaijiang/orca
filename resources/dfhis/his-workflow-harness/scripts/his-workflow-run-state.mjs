import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { rename, writeFile } from 'node:fs/promises'

const TRANSIENT_ERROR =
  /(?:ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|ETIMEDOUT|fetch failed|socket hang up|HTTP (?:408|409|425|429|5\d\d)|timed out)/i
const AUTHORIZATION_ERROR =
  /(?:HTTP (?:401|403)|unauthori[sz]ed|forbidden|\bcredential\b|\btoken\b|\bpassword\b)/i
const CONFIGURATION_ERROR = /(?:not configured|not in the catalog|not uniquely mapped|missing environment|requires .* environment|does not exist)/i
const VERIFICATION_ERROR = /(?:verification failed|build .*ended|build failed|test failed|smoke check failed|returned HTTP 4\d\d)/i

export function classifyWorkflowError(error) {
  const message = error instanceof Error ? error.message : String(error)
  if (AUTHORIZATION_ERROR.test(message)) {return { kind: 'authorization', retryable: false }}
  if (CONFIGURATION_ERROR.test(message)) {return { kind: 'configuration', retryable: false }}
  if (TRANSIENT_ERROR.test(message)) {return { kind: 'transient', retryable: true }}
  if (VERIFICATION_ERROR.test(message)) {return { kind: 'verification', retryable: false }}
  return { kind: 'unknown', retryable: false }
}

export function createWorkflowRun(args) {
  const now = Date.now()
  return {
    schemaVersion: 2,
    runId: args.runId ?? randomUUID(),
    action: args.action,
    repo: args.repo,
    repositoryHead: args.repositoryHead ?? null,
    serviceId: args.serviceId ?? null,
    environmentId: args.environmentId ?? null,
    runtime: args.runtime,
    status: 'running',
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    currentStage: null,
    stages: args.stages.map((name) => ({
      name,
      status: 'pending',
      attempts: [],
      external: null,
      error: null
    })),
    evidence: [],
    recovery: [],
    error: null
  }
}

export async function loadWorkflowRun(filePath) {
  const value = JSON.parse(await readFile(filePath, 'utf8'))
  if (value?.schemaVersion !== 2 || !value.runId || !Array.isArray(value.stages)) {
    throw new Error(`Workflow state is invalid: ${filePath}`)
  }
  return value
}

export async function saveWorkflowRun(filePath, run) {
  const target = path.resolve(filePath)
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`
  run.updatedAt = Date.now()
  await writeFile(temp, `${JSON.stringify(run, null, 2)}\n`, { mode: 0o600 })
  await rename(temp, target)
}

export function assertWorkflowRunIdentity(run, expected) {
  const mismatches = []
  for (const key of ['repo', 'serviceId', 'environmentId']) {
    if ((run[key] ?? null) !== (expected[key] ?? null)) {mismatches.push(key)}
  }
  if (expected.repositoryHead && run.repositoryHead !== expected.repositoryHead) {
    mismatches.push('repositoryHead')
  }
  if (mismatches.length > 0) {
    throw new Error(`Workflow resume identity changed: ${mismatches.join(', ')}.`)
  }
}

export function startStageAttempt(run, stageName) {
  const stage = workflowStage(run, stageName)
  const attempt = {
    number: stage.attempts.length + 1,
    startedAt: Date.now(),
    completedAt: null,
    status: 'running',
    error: null,
    errorKind: null
  }
  stage.status = 'running'
  stage.error = null
  stage.attempts.push(attempt)
  run.currentStage = stageName
  return attempt
}

export function passStageAttempt(run, stageName, stageEvidence) {
  const stage = workflowStage(run, stageName)
  const attempt = runningAttempt(stage)
  attempt.status = 'passed'
  attempt.completedAt = Date.now()
  stage.status = 'passed'
  stage.error = null
  run.evidence.push(...stageEvidence)
  run.currentStage = null
}

export function failStageAttempt(run, stageName, error) {
  const stage = workflowStage(run, stageName)
  const attempt = runningAttempt(stage)
  const classification = classifyWorkflowError(error)
  const message = error instanceof Error ? error.message : String(error)
  attempt.status = 'failed'
  attempt.completedAt = Date.now()
  attempt.error = message
  attempt.errorKind = classification.kind
  stage.status = 'failed'
  stage.error = message
  run.error = message
  run.currentStage = null
  return classification
}

export function resetInterruptedAttempts(run) {
  for (const stage of run.stages) {
    const attempt = stage.attempts.at(-1)
    if (stage.status !== 'running' || attempt?.status !== 'running') {continue}
    attempt.status = 'interrupted'
    attempt.completedAt = Date.now()
    attempt.error = 'Previous process ended before recording the stage outcome.'
    attempt.errorKind = 'interrupted'
    stage.status = stage.external || stage.name === 'deploy' ? 'recovering' : 'pending'
    stage.error = attempt.error
    run.recovery.push({ stage: stage.name, action: 'interrupted-attempt-recovered', at: Date.now() })
  }
  run.status = 'running'
  run.error = null
  run.currentStage = null
}

export function resetFailedStagesForResume(run) {
  for (const stage of run.stages) {
    if (stage.status !== 'failed') {continue}
    stage.attemptHistory = [...(stage.attemptHistory ?? []), ...stage.attempts]
    stage.attempts = []
    stage.status = 'pending'
    stage.error = null
    run.recovery.push({ stage: stage.name, action: 'explicit-resume', at: Date.now() })
  }
  run.status = 'running'
  run.error = null
  run.completedAt = null
}

export function shouldRetryStage(stageName, classification, attemptNumber, maxAttempts) {
  if (!classification.retryable || attemptNumber >= maxAttempts) {return false}
  return !['verify', 'deploy'].includes(stageName)
}

export function retryDelayMs(attemptNumber, baseMs, random = Math.random) {
  const exponential = baseMs * 2 ** Math.max(0, attemptNumber - 1)
  return Math.round(exponential * (0.8 + random() * 0.4))
}

export function workflowStage(run, name) {
  const stage = run.stages.find((entry) => entry.name === name)
  if (!stage) {throw new Error(`Workflow stage is missing from state: ${name}`)}
  return stage
}

function runningAttempt(stage) {
  const attempt = stage.attempts.at(-1)
  if (!attempt || attempt.status !== 'running') {
    throw new Error(`Workflow stage ${stage.name} has no running attempt.`)
  }
  return attempt
}
