// Compatibility facade: upstream split this module; keep fork imports working.
export type { Automation, AutomationCreateInput, AutomationUpdateInput } from './automations/automation-definition'
export { isFinalAutomationRunStatus } from './automations/history/automation-run'
export type { AutomationDispatchResult, AutomationPrecheckResult, AutomationRun, AutomationRunOutputSnapshot, AutomationRunStatus } from './automations/history/automation-run'

import type { Automation } from './automations/automation-definition'
import type { AutomationRun } from './automations/history/automation-run'
import type { TuiAgent } from './agent-launch/catalog/tui-agent'
import type { YunxiaoTodoPoolStatus } from './yunxiao-types'

export type AutomationYunxiaoReviewHandoff = {
  enabled: boolean
  agentId: TuiAgent
}

export type AutomationYunxiaoTodoPoolSource = {
  kind: 'yunxiao-todo-pool'
  statuses: YunxiaoTodoPoolStatus[]
  batchSize: number
  reviewHandoff?: AutomationYunxiaoReviewHandoff | null
}

export type AutomationYunxiaoTodoPoolClaim = {
  itemIds: string[]
  claimedAt: number
}

export type AutomationDispatchRequest = {
  automation: Automation
  run: AutomationRun
  dispatchToken: string
}
