import type { AiVaultSessionPreviewMessage } from '../../shared/ai-vault-types'
import type { SessionAccumulator } from './session-scanner-types'
import {
  extractFullFirstUserPromptText,
  normalizeFullFirstUserPromptText,
  shouldCaptureFullFirstUserPrompt
} from './session-scanner-first-user-prompt'
import {
  extractPreviewContentText,
  normalizePreviewText,
  timestampMs
} from './session-scanner-values'
import {
  boundedText,
  transcriptMessageRole,
  transcriptMessagesFromContent
} from './session-transcript-message-content'

const SESSION_PREVIEW_MESSAGE_LIMIT = 5

export function addPreviewMessage(
  accumulator: SessionAccumulator,
  args: {
    role: AiVaultSessionPreviewMessage['role']
    text: string | null
    timestamp?: unknown
    // Why: Claude meta/injected turns still preview, but must not seed the
    // copyable first-prompt row.
    seedFirstUserPrompt?: boolean
    // Set false by callers that already published this record's messages.
    publishMessage?: boolean
  }
): void {
  if (args.publishMessage !== false && accumulator.messages.active) {
    publishTranscriptMessage(accumulator, args.role, args.text, args.timestamp)
  }
  // Seeded before the preview-empty return so the copy body never depends on
  // preview-only normalization rules.
  seedFullFirstUserPrompt(
    accumulator,
    args.role,
    () => (args.text ? normalizeFullFirstUserPromptText(args.text) : null),
    args.seedFirstUserPrompt
  )
  const text = normalizePreviewText(args.text ?? '', args.role)
  if (!text) {
    return
  }
  accumulator.previewMessages.push({
    role: args.role,
    text,
    timestamp: timestampIso(args.timestamp)
  })
  if (accumulator.previewMessages.length > SESSION_PREVIEW_MESSAGE_LIMIT) {
    accumulator.previewMessages.shift()
    accumulator.previewMessagesTruncated = true
  }
}

export function addPreviewContent(
  accumulator: SessionAccumulator,
  role: AiVaultSessionPreviewMessage['role'],
  content: unknown,
  timestamp?: unknown,
  options?: { seedFirstUserPrompt?: boolean }
): void {
  seedFullFirstUserPrompt(
    accumulator,
    role,
    () => extractFullFirstUserPromptText(content),
    options?.seedFirstUserPrompt
  )
  // Published from the content value, not the preview string: a consumer needs
  // the whole turn, including the tool blocks the 220-char preview drops.
  if (accumulator.messages.active) {
    for (const message of transcriptMessagesFromContent(role, content, timestampIso(timestamp))) {
      accumulator.messages.push(message)
    }
  }
  addPreviewMessage(accumulator, {
    role,
    text: extractPreviewContentText(content, role),
    timestamp,
    // Content path already seeded above when capture is enabled.
    seedFirstUserPrompt: false,
    publishMessage: false
  })
}

/** One already-flattened turn; the content path publishes per block instead. */
function publishTranscriptMessage(
  accumulator: SessionAccumulator,
  role: AiVaultSessionPreviewMessage['role'],
  text: string | null,
  timestamp: unknown
): void {
  const messageRole = transcriptMessageRole(role)
  const messageText = text === null ? null : boundedText(text)
  if (messageRole && messageText) {
    accumulator.messages.push({
      role: messageRole,
      text: messageText,
      timestamp: timestampIso(timestamp)
    })
  }
}

/**
 * Seed the copyable first prompt from the first real user turn. `fullText` is a
 * thunk so list scans (capture mode `none`) never pay the extraction cost.
 */
export function seedFullFirstUserPrompt(
  accumulator: SessionAccumulator,
  role: AiVaultSessionPreviewMessage['role'],
  fullText: () => string | null,
  seedFirstUserPrompt?: boolean
): void {
  // Why: list scans never store firstUserPrompt (payload/perf). Only the
  // on-demand full-capture path seeds the untruncated copy body.
  if (
    role === 'user' &&
    seedFirstUserPrompt !== false &&
    !accumulator.firstUserPrompt &&
    shouldCaptureFullFirstUserPrompt()
  ) {
    accumulator.firstUserPrompt = fullText()
  }
}

export function timestampIso(value: unknown): string | null {
  const parsed = timestampMs(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}
