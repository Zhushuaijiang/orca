import { homedir } from 'node:os'
import path from 'node:path'
import {
  failStageAttempt,
  passStageAttempt,
  retryDelayMs,
  shouldRetryStage,
  startStageAttempt,
  workflowStage
} from './his-workflow-run-state.mjs'

function maxStageAttempts(stage, options) {
  if (options.maxAttempts) {return Math.max(1, Number(options.maxAttempts))}
  if (stage === 'smoke') {return 5}
  if (['doctor', 'database', 'jenkins'].includes(stage)) {return 3}
  return 1
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function recoverInterruptedStage(stageName, context, callbacks) {
  const stage = workflowStage(context.run, stageName)
  if (stage.status !== 'recovering') {return false}
  if (stageName === 'jenkins' && stage.external) {return false}
  if (stageName === 'deploy') {
    const check = await callbacks.deploymentCheck(context)
    if (check) {
      stage.status = 'passed'
      stage.error = null
      context.run.evidence.push(check)
      context.run.recovery.push({ stage: stageName, action: 'deployment-confirmed', at: Date.now() })
      await context.persist()
      return true
    }
    throw new Error(
      'Deployment outcome is unknown after interruption; configure deployCheckCommand before unattended resume.'
    )
  }
  stage.status = 'pending'
  return false
}

async function runStageWithRetry(stageName, context, callbacks) {
  const stage = workflowStage(context.run, stageName)
  const maxAttempts = maxStageAttempts(stageName, context.options)
  while (stage.attempts.length < maxAttempts) {
    const attempt = startStageAttempt(context.run, stageName)
    await context.persist()
    try {
      const stageEvidence = await callbacks.runStage(stageName, context)
      passStageAttempt(context.run, stageName, stageEvidence)
      context.run.error = null
      await context.persist()
      return
    } catch (error) {
      const classification = failStageAttempt(context.run, stageName, error)
      await context.persist()
      if (!shouldRetryStage(stageName, classification, attempt.number, maxAttempts)) {
        if (stageName === 'smoke') {await callbacks.rollback(context, error)}
        throw error
      }
      const delay = retryDelayMs(attempt.number, Number(context.options.retryBaseMs ?? 2000))
      context.run.recovery.push({
        stage: stageName,
        action: 'retry-scheduled',
        attempt: attempt.number + 1,
        delayMs: delay,
        at: Date.now()
      })
      stage.status = 'pending'
      await context.persist()
      await sleep(delay)
    }
  }
  throw new Error(`Workflow stage ${stageName} exhausted its attempt budget.`)
}

export async function executeWorkflow(context, callbacks) {
  for (const stageName of context.run.stages.map((stage) => stage.name)) {
    const stage = workflowStage(context.run, stageName)
    if (stage.status === 'passed') {continue}
    if (await recoverInterruptedStage(stageName, context, callbacks)) {continue}
    await runStageWithRetry(stageName, context, callbacks)
  }
}

export function workflowStatePath(options, runId) {
  if (options.stateFile) {return path.resolve(options.stateFile)}
  if (options.reportDir) {return path.join(path.resolve(options.reportDir), 'run-state.json')}
  return path.join(
    process.env.HIS_WORKFLOW_RUN_ROOT ?? path.join(homedir(), '.codex', 'workflow-runs', 'his'),
    runId,
    'run-state.json'
  )
}
