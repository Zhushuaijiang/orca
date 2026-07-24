import type {
  Automation,
  AutomationDispatchResult,
  AutomationPrecheckResult,
  AutomationRun
} from '../../shared/automations-types'
import {
  didAutomationPrecheckPass,
  formatAutomationPrecheckFailure
} from '../../shared/automation-precheck'
import type { HeadlessAutomationDispatcher } from './headless-dispatch'
import type { AutomationRunTargetResult } from './run-target-resolution'

export async function requestHeadlessAutomationDispatch(args: {
  automation: Automation
  run: AutomationRun
  target: Extract<AutomationRunTargetResult, { ok: true }>
  headlessDispatcher: HeadlessAutomationDispatcher
  runPrecheck: () => Promise<AutomationPrecheckResult | null>
  updateAutomationRun: (result: AutomationDispatchResult) => AutomationRun
  markDispatchResult: (result: AutomationDispatchResult) => Promise<AutomationRun>
}): Promise<AutomationRun> {
  const precheckResult =
    args.run.trigger === 'scheduled' && args.automation.precheck ? await args.runPrecheck() : null
  if (precheckResult && !didAutomationPrecheckPass(precheckResult)) {
    return args.updateAutomationRun({
      runId: args.run.id,
      status: 'skipped_precheck',
      workspaceId: args.automation.workspaceId,
      precheckResult,
      error: formatAutomationPrecheckFailure(precheckResult)
    })
  }
  try {
    const launch = await args.headlessDispatcher({
      automation: args.automation,
      run: args.run,
      target: args.target
    })
    const launchRunTarget = {
      workspaceId: launch.workspaceId,
      workspaceDisplayName: launch.workspaceDisplayName ?? null,
      terminalSessionId: launch.terminalSessionId,
      terminalPaneKey: launch.terminalPaneKey ?? null,
      terminalPtyId: launch.terminalPtyId ?? null
    }
    const updated = args.updateAutomationRun({
      runId: args.run.id,
      status: 'dispatched',
      ...launchRunTarget,
      error: null
    })
    if (launch.completion) {
      void launch.completion
        .then((completion) =>
          args.markDispatchResult({
            runId: args.run.id,
            status: completion.status,
            ...launchRunTarget,
            precheckResult,
            outputSnapshot: completion.outputSnapshot ?? null,
            error: completion.error ?? null
          })
        )
        .catch((error) =>
          args.markDispatchResult({
            runId: args.run.id,
            status: 'dispatch_failed',
            ...launchRunTarget,
            error: error instanceof Error ? error.message : String(error)
          })
        )
    }
    return updated
  } catch (error) {
    return args.updateAutomationRun({
      runId: args.run.id,
      status: 'dispatch_failed',
      workspaceId: args.automation.workspaceId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}
