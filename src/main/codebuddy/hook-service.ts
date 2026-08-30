import { ClaudeHookService } from '../claude/hook-service'
import { CODEBUDDY_HOOK_SETTINGS } from '../claude/hook-settings'

// Why: CodeBuddy Code ships a Claude-compatible hooks implementation (same
// settings.json `hooks` schema, event names, and stdin payload — verified
// against codebuddy.ai/docs/cli/hooks and a live firing), so it reuses the
// Claude installer with CodeBuddy's config dir and hook source.
export const codebuddyHookService = new ClaudeHookService({
  agent: 'codebuddy',
  displayName: 'CodeBuddy',
  settings: CODEBUDDY_HOOK_SETTINGS
})
