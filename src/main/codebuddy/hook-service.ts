import type { ClaudeManagedHookPlan } from '../claude/claude-managed-hook-events'
import { ClaudeHookService } from '../claude/hook-service'
import { CODEBUDDY_HOOK_SETTINGS } from '../claude/hook-settings'

export const CODEBUDDY_HOOK_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Stop',
  'StopFailure',
  'Notification'
] as const

export const CODEBUDDY_MANAGED_HOOK_PLAN: ClaudeManagedHookPlan = {
  install: CODEBUDDY_HOOK_EVENTS.map((eventName) => ({ eventName, definition: {} })),
  retire: [],
  statusLine: 'leave'
}

// Why: CodeBuddy Code ships a Claude-compatible hooks implementation (same
// settings.json `hooks` schema, event names, and stdin payload — verified
// against codebuddy.ai/docs/cli/hooks and a live firing), so it reuses the
// Claude installer with CodeBuddy's config dir and hook source. The shared
// CODEBUDDY_HOOK_SETTINGS carries `hookSource: 'codebuddy'`, which the service
// threads into the managed script so events attribute to the CodeBuddy row
// (fork wiring; main passes `source` instead).
export const codebuddyHookService = new ClaudeHookService({
  agent: 'codebuddy',
  source: 'codebuddy',
  displayName: 'CodeBuddy',
  settings: CODEBUDDY_HOOK_SETTINGS,
  hookPlan: CODEBUDDY_MANAGED_HOOK_PLAN
})
