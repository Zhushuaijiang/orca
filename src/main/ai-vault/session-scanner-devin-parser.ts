import type { AiVaultSession, AiVaultTokenUsage } from '../../shared/ai-vault-types'
import type { ExecutionHostId } from '../../shared/execution-host'
import { addTokenUsage } from './session-scanner-token-values'
import type { FileWithMtime } from './session-scanner-types'
import {
  addPreviewContent,
  createAccumulator,
  finalizeSession,
  sessionIdFromFileName,
  updateTimeline
} from './session-scanner-accumulator'
import {
  arrayValue,
  asRecord,
  extractContentText,
  extractString,
  normalizeTitleText,
  numberValue
} from './session-scanner-values'

type ParserSessionOptions = {
  executionHostId?: ExecutionHostId
  executionHostPlatform?: NodeJS.Platform | null
}

export async function parseDevinSessionFile(
  file: FileWithMtime,
  platform: NodeJS.Platform = process.platform
): Promise<AiVaultSession | null> {
  return parseDevinSessionContent(
    file,
    await wslGatedReadFile(file.path, 'utf-8', 'scan'),
    platform
  )
}

export function parseDevinSessionContent(
  file: FileWithMtime,
  content: string,
  platform: NodeJS.Platform = process.platform,
  options: ParserSessionOptions = {}
): AiVaultSession | null {
  const record = asRecord(JSON.parse(content) as unknown)
  if (!record) {
    return null
  }
  const sessionId =
    extractString(record.session_id) ??
    extractString(record.sessionId) ??
    sessionIdFromFileName(file.path)
  const accumulator = createAccumulator({ agent: 'devin', file, sessionId })
  const agentRecord = asRecord(record.agent)
  accumulator.model =
    extractString(agentRecord?.model_name) ??
    extractString(agentRecord?.model) ??
    extractString(record.generation_model)
  accumulator.cwd = extractString(record.working_directory)
  const steps = arrayValue(record.steps)
  for (const step of steps) {
    const stepRecord = asRecord(step)
    if (!stepRecord) {
      continue
    }
    const metadata = asRecord(stepRecord.metadata)
    updateTimeline(accumulator, extractString(metadata?.created_at))
    const metrics = asRecord(metadata?.metrics)
    accumulator.model ??=
      extractString(metadata?.generation_model) ?? extractString(metrics?.generation_model)
    const stepUsage = devinStepTokenUsage(metadata, metrics)
    accumulator.totalTokens += stepUsage.total
    addTokenUsage(accumulator, accumulator.model, stepUsage)
    const isUser = metadata?.is_user_input === true
    if (isUser) {
      accumulator.messageCount++
      const text =
        extractDevinStepText(stepRecord) ??
        extractContentText(stepRecord.content) ??
        extractString(stepRecord.text)
      const titleCandidate = normalizeTitleText(text ?? '')
      if (titleCandidate) {
        accumulator.title ??= titleCandidate
      }
      addPreviewContent(accumulator, 'user', text ?? stepRecord.content)
    } else if (extractString(stepRecord.role) === 'assistant' || stepRecord.tool_calls) {
      accumulator.messageCount++
      addPreviewContent(
        accumulator,
        'assistant',
        extractDevinStepText(stepRecord) ?? stepRecord.content
      )
    }
  }
  return finalizeSession(accumulator, platform, options)
}

function extractDevinStepText(step: Record<string, unknown>): string | null {
  const message = asRecord(step.message)
  if (message) {
    return extractContentText(message.content) ?? extractString(message.content)
  }
  return extractString(step.text)
}

function devinStepTokenUsage(
  metadata: Record<string, unknown> | null,
  metrics: Record<string, unknown> | null
): AiVaultTokenUsage {
  const input = numberFromDevinMetadata(metadata, metrics, ['total_input_tokens', 'input_tokens'])
  const output = numberFromDevinMetadata(metadata, metrics, ['output_tokens'])
  const cacheRead = numberFromDevinMetadata(metadata, metrics, [
    'cache_read_tokens',
    'cache_read_input_tokens'
  ])
  const cacheWrite = numberFromDevinMetadata(metadata, metrics, [
    'cache_creation_tokens',
    'cache_creation_input_tokens'
  ])
  return {
    input,
    cacheRead,
    cacheWrite,
    output,
    reasoning: 0,
    total: input + output + cacheRead + cacheWrite
  }
}

function numberFromDevinMetadata(
  metadata: Record<string, unknown> | null,
  metrics: Record<string, unknown> | null,
  keys: readonly string[]
): number {
  for (const source of [metadata, metrics]) {
    if (!source) {
      continue
    }
    for (const key of keys) {
      const value = numberValue(source[key])
      if (value > 0) {
        return value
      }
    }
  }
  return 0
}
