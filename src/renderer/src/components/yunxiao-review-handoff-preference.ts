import type { Automation, AutomationYunxiaoReviewHandoff } from '../../../shared/automations-types'
import { isTuiAgent } from '../../../shared/tui-agent-config'
import { resolveYunxiaoReviewHandoff } from '../../../shared/yunxiao-review-handoff'

// Why: the switch and agent are a per-device view preference. taskResumeState is a
// strict host schema, and a key that host predates drops github and jira resume with it.
const STORAGE_KEY = 'orca.yunxiao.review-handoff.v1'

export function loadYunxiaoReviewHandoffPreference(): AutomationYunxiaoReviewHandoff {
  return readStoredYunxiaoReviewHandoffPreference() ?? resolveYunxiaoReviewHandoff(null)
}

export function readStoredYunxiaoReviewHandoffPreference(): AutomationYunxiaoReviewHandoff | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    return parseStoredYunxiaoReviewHandoff(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveYunxiaoReviewHandoffPreference(value: AutomationYunxiaoReviewHandoff): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(resolveYunxiaoReviewHandoff(value)))
  } catch {
    // The control still shows the choice when browser storage is unavailable or full.
  }
}

export async function restoreYunxiaoReviewHandoffPreference(
  automation: Pick<Automation, 'yunxiaoTodoPool'> | null,
  persist: (handoff: AutomationYunxiaoReviewHandoff) => Promise<void>
): Promise<AutomationYunxiaoReviewHandoff | null> {
  const stored = readStoredYunxiaoReviewHandoffPreference()
  if (stored) {
    if (
      automation?.yunxiaoTodoPool &&
      !reviewHandoffsMatch(automation.yunxiaoTodoPool.reviewHandoff, stored)
    ) {
      await persist(stored)
    }
    return null
  }
  if (!automation) {
    return null
  }
  return resolveYunxiaoReviewHandoff(automation.yunxiaoTodoPool?.reviewHandoff)
}

function parseStoredYunxiaoReviewHandoff(value: unknown): AutomationYunxiaoReviewHandoff | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const enabled = 'enabled' in value ? value.enabled : undefined
  const agentId = 'agentId' in value ? value.agentId : undefined
  if (!isTuiAgent(agentId) || typeof enabled !== 'boolean') {
    return null
  }
  return { enabled, agentId }
}

function reviewHandoffsMatch(
  left: AutomationYunxiaoReviewHandoff | null | undefined,
  right: AutomationYunxiaoReviewHandoff
): boolean {
  const resolvedLeft = resolveYunxiaoReviewHandoff(left)
  return resolvedLeft.enabled === right.enabled && resolvedLeft.agentId === right.agentId
}
