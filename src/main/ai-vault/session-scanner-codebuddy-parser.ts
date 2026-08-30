import { remoteSessionContentLines } from './remote-session-content-lines'
import { openTranscriptReadStream } from '../native-chat/wsl-transcript-fs-access'
import { createInterface } from 'node:readline'
import type { AiVaultSession, AiVaultTokenUsage } from '../../shared/ai-vault-types'
import type { ExecutionHostId } from '../../shared/execution-host'
import type {
  FileWithMtime,
  ResumableSessionParseState,
  SessionAccumulator
} from './session-scanner-types'
import {
  accumulatorFoldResumeState,
  addPreviewContent,
  createAccumulator,
  sessionIdFromFileName,
  updateTimeline
} from './session-scanner-accumulator'
import { addTokenUsage, emptyTokenUsage, numberValue } from './session-scanner-token-values'
import {
  asRecord,
  extractContentText,
  extractString,
  normalizeTitleText,
  parseJsonObject
} from './session-scanner-values'

type ParserSessionOptions = {
  executionHostId?: ExecutionHostId
  executionHostPlatform?: NodeJS.Platform | null
}

// Why a dedicated parser: CodeBuddy's disk layout is Claude-shaped
// (~/.codebuddy/projects/<encoded-cwd>/<sessionId>.jsonl, ai-title records) but
// the transcript records are not — `type:'message'` with a top-level role and
// content blocks (input_text/output_text), epoch-millis numeric timestamps,
// and OpenAI-style usage under providerData on function_call records.
export async function parseCodebuddySessionFile(
  file: FileWithMtime,
  platform: NodeJS.Platform = process.platform
): Promise<AiVaultSession | null> {
  const lines = createInterface({
    input: openTranscriptReadStream(file.path, { encoding: 'utf-8' }, 'scan'),
    crlfDelay: Infinity
  })
  return parseCodebuddySessionLines({ file, lines, platform })
}

export async function parseCodebuddySessionContent(
  file: FileWithMtime,
  content: string,
  platform: NodeJS.Platform = process.platform,
  options: ParserSessionOptions = {},
  signal?: AbortSignal
): Promise<AiVaultSession | null> {
  return parseCodebuddySessionLines({
    file,
    lines: remoteSessionContentLines(content, signal),
    platform,
    options
  })
}

function consumeCodebuddyRecordLine(accumulator: SessionAccumulator, line: string): void {
  const record = parseJsonObject(line)
  if (!record) {
    return
  }
  if (typeof record.sessionId === 'string' && record.sessionId.trim()) {
    accumulator.sessionId = record.sessionId.trim()
  }
  // Numeric epoch-millis; updateTimeline's timestampMs handles numbers natively.
  updateTimeline(accumulator, record.timestamp)
  // A session's representative cwd is its start directory (same rule as Claude:
  // `codebuddy --resume <id>` finds the transcript under the start-cwd project dir).
  if (accumulator.cwd === null) {
    const startCwd = extractString(record.cwd)
    if (startCwd) {
      accumulator.cwd = startCwd
    }
  }

  if (record.type === 'ai-title') {
    // Why the top slot: ai-title precedes summary in the file but must outrank
    // it regardless of arrival order, and CodeBuddy has no user custom-title
    // record that would need the slot's usual precedence.
    const title = normalizeTitleText(extractString(record.aiTitle) ?? '')
    if (title) {
      accumulator.title = title
    }
    return
  }

  if (record.type === 'summary') {
    // summary echoes the initial user message (providerData.source), so it only
    // outranks the raw first-prompt fallback, never the ai-title above.
    const title = normalizeTitleText(extractString(record.summary) ?? '')
    if (title) {
      accumulator.fallbackTitle = title
    }
    return
  }

  const providerData = asRecord(record.providerData)
  const model = extractString(providerData?.model)
  if (model) {
    accumulator.model = model
  }
  const usage = codebuddyUsageBreakdown(providerData?.usage)
  if (usage.total > 0) {
    accumulator.totalTokens += usage.total
  }
  addTokenUsage(accumulator, model, usage)

  if (record.type === 'message') {
    const role = extractString(record.role)
    if (role !== 'user' && role !== 'assistant') {
      return
    }
    accumulator.messageCount++
    if (role === 'user' && accumulator.fallbackTitle === null) {
      accumulator.fallbackTitle = extractContentText(record.content)
    }
    addPreviewContent(accumulator, role, record.content, record.timestamp)
  }
}

// inputTokens already includes cached_tokens and outputTokens already includes
// reasoning_tokens (OpenAI semantics), so the categories are carved out of the
// totals to keep the breakdown sum equal to the reported totalTokens.
function codebuddyUsageBreakdown(value: unknown): AiVaultTokenUsage {
  const usage = asRecord(value)
  if (!usage) {
    return emptyTokenUsage()
  }
  const inputTokens = numberValue(usage.inputTokens)
  const outputTokens = numberValue(usage.outputTokens)
  const cachedTokens = detailTokensTotal(usage.inputTokensDetails, 'cached_tokens')
  const reasoningTokens = detailTokensTotal(usage.outputTokensDetails, 'reasoning_tokens')
  const explicitTotal = numberValue(usage.totalTokens) || numberValue(usage.total)
  return {
    input: Math.max(inputTokens - cachedTokens, 0),
    cacheRead: cachedTokens,
    cacheWrite: 0,
    output: Math.max(outputTokens - reasoningTokens, 0),
    reasoning: reasoningTokens,
    total: explicitTotal > 0 ? explicitTotal : inputTokens + outputTokens
  }
}

function detailTokensTotal(value: unknown, key: string): number {
  if (!Array.isArray(value)) {
    return 0
  }
  return value.reduce((total, item) => total + numberValue(asRecord(item)?.[key]), 0)
}

export function createCodebuddySessionResumeState(file: FileWithMtime): ResumableSessionParseState {
  return accumulatorFoldResumeState(
    createAccumulator({ agent: 'codebuddy', file, sessionId: sessionIdFromFileName(file.path) }),
    consumeCodebuddyRecordLine
  )
}

async function parseCodebuddySessionLines(args: {
  file: FileWithMtime
  lines: AsyncIterable<string> | Iterable<string>
  platform: NodeJS.Platform
  options?: ParserSessionOptions
}): Promise<AiVaultSession | null> {
  const state = createCodebuddySessionResumeState(args.file)
  for await (const line of args.lines) {
    state.consumeLine(line)
  }
  return state.finalize(args.platform, args.options)
}
