import type { Store } from '../persistence'
import type { Automation, AutomationPrecheckResult } from '../../shared/automations-types'
import { failedPrecheckResult, runAutomationPrecheck } from './precheck-runner'
import type { AutomationRunTargetResult } from './run-target-resolution'

/** The precheck a scheduled run owes before its agent starts, if its automation declares one. */
export async function runScheduledAutomationPrecheck(
  context: {
    store: Store
    resolveTarget: (automation: Automation) => AutomationRunTargetResult
  },
  automationId: string,
  runId: string
): Promise<AutomationPrecheckResult | null> {
  const automation = context.store.listAutomations().find((entry) => entry.id === automationId)
  if (!automation) {
    throw new Error('Automation not found.')
  }
  const run = context.store.listAutomationRuns(automationId).find((entry) => entry.id === runId)
  if (!run) {
    throw new Error('Automation run not found.')
  }
  if (run.trigger !== 'scheduled' || !automation.precheck) {
    return null
  }
  const target = context.resolveTarget(automation)
  if (!target.ok) {
    return failedPrecheckResult(automation.precheck, Date.now(), target.error)
  }
  return await runAutomationPrecheck({
    precheck: automation.precheck,
    target:
      automation.executionTargetType === 'ssh'
        ? { type: 'ssh', cwd: target.cwd, connectionId: automation.executionTargetId }
        : { type: 'local', cwd: target.cwd }
  })
}
