import { createReadStream } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import type { AiVaultSession, AiVaultTokenUsage } from '../../shared/ai-vault-types'
import {
  addPreviewContent,
  addPreviewMessage,
  createAccumulator,
  finalizeSession,
  updateTimeline
} from './session-scanner-accumulator'
import {
  kimiPrimaryAgentWirePath,
  kimiSessionIdFromStatePath,
  kimiSessionIndexPathFromStatePath,
  readKimiWorkDirBySessionId
} from './session-scanner-kimi-paths'
import type { FileWithMtime, SessionAccumulator } from './session-scanner-types'
import { addTokenUsage } from './session-scanner-token-values'
import {
  asRecord,
  extractContentText,
  extractString,
  normalizePreviewText,
  normalizeTitleText,
  numberValue,
  parseJsonObject
} from './session-scanner-values'

// Parses a Kimi Code `state.json` plus its sibling `agents/<id>/wire.jsonl`
// transcript into an AI Vault session. Metadata (title, timestamps, last prompt)
// comes from state.json; the work directory comes from the top-level
// session_index.jsonl; model/messages/tokens come from the wire transcript.
export async function parseKimiSessionFile(
  file: FileWithMtime,
  platform: NodeJS.Platform = process.platform
): Promise<AiVaultSession | null> {
  let stateRecord: Record<string, unknown> | null
  try {
    stateRecord = asRecord(JSON.parse(await readFile(file.path, 'utf-8')) as unknown)
  } catch {
    return null
  }
  if (!stateRecord) {
    return null
  }

  const sessionId = kimiSessionIdFromStatePath(file.path)
  const accumulator = createAccumulator({ agent: 'kimi', file, sessionId })

  // Why: Kimi sessions are work-dir-scoped — the resume command must `cd` into
  // the original directory or the CLI rejects it. That path lives only in the
  // top-level session_index.jsonl, keyed by the (prefixed) session id.
  const workDirBySessionId = await readKimiWorkDirBySessionId(
    kimiSessionIndexPathFromStatePath(file.path)
  )
  accumulator.cwd = workDirBySessionId.get(sessionId) ?? null

  accumulator.title = normalizeTitleText(extractString(stateRecord.title) ?? '')
  accumulator.fallbackTitle = normalizeTitleText(extractString(stateRecord.lastPrompt) ?? '')
  updateTimeline(accumulator, extractString(stateRecord.createdAt))
  updateTimeline(accumulator, extractString(stateRecord.updatedAt))

  const primaryWirePath = kimiPrimaryAgentWirePath(file.path, stateRecord)
  await consumeKimiWireTranscript(accumulator, primaryWirePath)
  // Subagent transcripts carry their own usage records; bill-wise they belong
  // to the session, but their messages must not pollute the preview.
  await consumeKimiSubagentUsage(accumulator, file.path, primaryWirePath)

  return finalizeSession(accumulator, platform)
}

async function consumeKimiSubagentUsage(
  accumulator: SessionAccumulator,
  statePath: string,
  primaryWirePath: string
): Promise<void> {
  let entries
  try {
    entries = await readdir(join(dirname(statePath), 'agents'), { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const wirePath = join(dirname(statePath), 'agents', entry.name, 'wire.jsonl')
    if (wirePath === primaryWirePath) {
      continue
    }
    await consumeKimiWireUsage(accumulator, wirePath)
  }
}

async function consumeKimiWireUsage(
  accumulator: SessionAccumulator,
  wirePath: string
): Promise<void> {
  try {
    const lines = createInterface({
      input: createReadStream(wirePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity
    })
    for await (const line of lines) {
      const record = parseJsonObject(line)
      if (record?.type === 'usage.record') {
        consumeKimiUsageRecord(accumulator, record)
      }
    }
  } catch {
    // Subagent transcript not flushed yet — its usage simply stays uncounted.
  }
}

async function consumeKimiWireTranscript(
  accumulator: SessionAccumulator,
  wirePath: string
): Promise<void> {
  let pendingAssistantText: string[] = []
  const flushAssistant = (): void => {
    // Why: previews use the 220-char limit (normalizePreviewText), not the
    // 96-char title limit — assistant replies are shown in full preview width
    // like every other agent's. Join raw chunks first so inter-chunk spacing
    // survives; normalizePreviewText then collapses whitespace and caps length.
    const text = normalizePreviewText(pendingAssistantText.join(''))
    pendingAssistantText = []
    if (text) {
      accumulator.messageCount++
      addPreviewMessage(accumulator, { role: 'assistant', text })
    }
  }

  try {
    const lines = createInterface({
      input: createReadStream(wirePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity
    })
    for await (const line of lines) {
      const record = parseJsonObject(line)
      if (!record) {
        continue
      }
      switch (record.type) {
        case 'config.update':
          accumulator.model = extractString(record.modelAlias) ?? accumulator.model
          break
        case 'usage.record':
          consumeKimiUsageRecord(accumulator, record)
          break
        case 'context.append_message':
          consumeKimiUserMessage(accumulator, record.message)
          break
        case 'context.append_loop_event':
          consumeKimiLoopEvent(record.event, pendingAssistantText, flushAssistant)
          break
        default:
          break
      }
    }
  } catch {
    // No transcript yet (session created but never ran a turn) — metadata-only
    // sessions still belong in the panel.
  }
  flushAssistant()
}

function consumeKimiUserMessage(accumulator: SessionAccumulator, value: unknown): void {
  const message = asRecord(value)
  // Why: only real user turns count. Kimi injects synthetic `role: "user"`
  // messages (origin.kind === "injection") for system reminders like the
  // auto-permission notice; those are not user activity.
  if (!message || message.role !== 'user' || asRecord(message.origin)?.kind !== 'user') {
    return
  }
  accumulator.messageCount++
  // Title uses the 96-char title limit; the preview uses the 220-char limit.
  accumulator.title ??= extractContentText(message.content)
  addPreviewContent(accumulator, 'user', message.content)
}

function consumeKimiLoopEvent(
  value: unknown,
  pendingAssistantText: string[],
  flushAssistant: () => void
): void {
  const event = asRecord(value)
  if (!event) {
    return
  }
  if (event.type === 'content.part') {
    const part = asRecord(event.part)
    // Push the raw chunk text; flushAssistant normalizes the joined result so
    // multi-chunk spacing is not lost to per-chunk trimming.
    if (part?.type === 'text' && typeof part.text === 'string') {
      pendingAssistantText.push(part.text)
    }
    return
  }
  // A step end closes one assistant turn; flush its accumulated text as a single
  // preview message so streamed `content.part` chunks collapse into one entry.
  if (event.type === 'step.end') {
    flushAssistant()
  }
}

function consumeKimiUsageRecord(
  accumulator: SessionAccumulator,
  record: Record<string, unknown>
): void {
  const usage = kimiUsageBreakdown(record.usage, record.usageScope)
  if (!usage) {
    return
  }
  accumulator.model = extractString(record.model) ?? accumulator.model
  accumulator.totalTokens += usage.total
  addTokenUsage(accumulator, extractString(record.model), usage)
}

// Kimi reports per-turn usage as {inputOther, output, inputCacheRead,
// inputCacheCreation}; sum all four for a session total. Skip any future
// cumulative ("session"-scoped) record so turn deltas are not double-counted.
function kimiUsageBreakdown(value: unknown, usageScope: unknown): AiVaultTokenUsage | null {
  if (usageScope === 'session') {
    return null
  }
  const usage = asRecord(value)
  if (!usage) {
    return null
  }
  const input = numberValue(usage.inputOther)
  const cacheRead = numberValue(usage.inputCacheRead)
  const cacheWrite = numberValue(usage.inputCacheCreation)
  const output = numberValue(usage.output)
  return {
    input,
    cacheRead,
    cacheWrite,
    output,
    reasoning: 0,
    total: input + cacheRead + cacheWrite + output
  }
}
