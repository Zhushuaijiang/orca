import {
  normalizeAgentStatusPayload,
  type ParsedAgentStatusPayload
} from '../../agent-status-types'
import type { HookListenerState } from '../listener-state'
import { resolvePrompt, resolveToolState } from '../prompt-fields'
import { extractToolFields, isNewTurnEvent } from '../provider-event-routing'

// Why: CodeBuddy Code emits Claude-compatible hook events (verified live:
// UserPromptSubmit stdin payload carries session_id/transcript_path/cwd/
// hook_event_name/prompt); normalize but attribute to CodeBuddy so the sidebar
// shows CodeBuddy's icon/label, not Claude's.
export function normalizeCodebuddyEvent(
  state: HookListenerState,
  eventName: unknown,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  let stateName: 'working' | 'waiting' | 'done' | null = null
  if (
    eventName === 'UserPromptSubmit' ||
    eventName === 'PostToolUse' ||
    eventName === 'PostToolUseFailure' ||
    eventName === 'PreToolUse'
  ) {
    stateName = 'working'
  } else if (eventName === 'PermissionRequest') {
    stateName = 'waiting'
  } else if (eventName === 'Stop' || eventName === 'StopFailure') {
    stateName = 'done'
  }

  if (!stateName) {
    return null
  }

  const snapshot = resolveToolState(
    state,
    paneKey,
    extractToolFields('codebuddy', eventName, hookPayload),
    { resetOnNewTurn: isNewTurnEvent('codebuddy', eventName) }
  )

  return normalizeAgentStatusPayload({
    state: stateName,
    prompt: resolvePrompt(state, paneKey, promptText, {
      resetOnNewTurn: isNewTurnEvent('codebuddy', eventName)
    }),
    agentType: 'codebuddy',
    toolName: snapshot.toolName,
    toolInput: snapshot.toolInput,
    lastAssistantMessage: snapshot.lastAssistantMessage
  })
}
