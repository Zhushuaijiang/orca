import type { AiVaultTokenUsage } from '../../shared/ai-vault-types'
import type { CodexUsageSnapshot, SessionAccumulator } from './session-scanner-types'
import { asRecord } from './session-scanner-record-value'

export function emptyTokenUsage(): AiVaultTokenUsage {
  return { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, total: 0 }
}

export function hasTokenUsage(usage: AiVaultTokenUsage): boolean {
  return (
    usage.total > 0 ||
    usage.input > 0 ||
    usage.cacheRead > 0 ||
    usage.cacheWrite > 0 ||
    usage.output > 0 ||
    usage.reasoning > 0
  )
}

// Maps the field-name zoo `tokenTotal` already recognises onto the canonical
// categories; explicit total wins when present (e.g. Codex `total_tokens`).
export function tokenUsageFromRecord(value: unknown): AiVaultTokenUsage {
  const usage = asRecord(value)
  if (!usage) {
    return emptyTokenUsage()
  }
  const input =
    numberValue(usage.input) || numberValue(usage.inputTokens) || numberValue(usage.input_tokens)
  const cacheRead =
    numberValue(usage.cacheRead) ||
    numberValue(usage.cacheReadTokens) ||
    numberValue(usage.cache_read_input_tokens) ||
    numberValue(usage.cached) ||
    numberValue(usage.cachedInputTokens) ||
    numberValue(usage.cached_input_tokens)
  const cacheWrite =
    numberValue(usage.cacheWrite) ||
    numberValue(usage.cacheWriteTokens) ||
    numberValue(usage.cache_creation_input_tokens)
  const output =
    numberValue(usage.output) || numberValue(usage.outputTokens) || numberValue(usage.output_tokens)
  const reasoning =
    numberValue(usage.reasoning) ||
    numberValue(usage.reasoningOutputTokens) ||
    numberValue(usage.reasoning_output_tokens)
  const explicitTotal =
    numberValue(usage.total) || numberValue(usage.totalTokens) || numberValue(usage.total_tokens)
  return {
    input,
    cacheRead,
    cacheWrite,
    output,
    reasoning,
    total: explicitTotal > 0 ? explicitTotal : input + cacheRead + cacheWrite + output + reasoning
  }
}

// Folds one usage record into the session-wide breakdown and, when the record
// carries a model, its per-model group.
export function addTokenUsage(
  accumulator: Pick<SessionAccumulator, 'tokenUsage' | 'tokenUsageByModel'>,
  model: string | null,
  usage: AiVaultTokenUsage
): void {
  // Records without usage must not create zeroed per-model groups.
  if (!hasTokenUsage(usage)) {
    return
  }
  addToUsage(accumulator.tokenUsage, usage)
  if (model) {
    addToUsage((accumulator.tokenUsageByModel[model] ??= emptyTokenUsage()), usage)
  }
}

function addToUsage(target: AiVaultTokenUsage, delta: AiVaultTokenUsage): void {
  target.input += delta.input
  target.cacheRead += delta.cacheRead
  target.cacheWrite += delta.cacheWrite
  target.output += delta.output
  target.reasoning += delta.reasoning
  target.total += delta.total
}

export function tokenTotal(value: unknown): number {
  const usage = asRecord(value)
  if (!usage) {
    return 0
  }
  const explicitTotal =
    numberValue(usage.total) || numberValue(usage.totalTokens) || numberValue(usage.total_tokens)
  if (explicitTotal > 0) {
    return explicitTotal
  }

  const fields: unknown[] = [
    usage.input,
    usage.inputTokens,
    usage.input_tokens,
    usage.output,
    usage.outputTokens,
    usage.output_tokens,
    usage.cacheRead,
    usage.cacheReadTokens,
    usage.cache_read_input_tokens,
    usage.cacheWrite,
    usage.cacheWriteTokens,
    usage.cache_creation_input_tokens,
    usage.cached,
    usage.cachedInputTokens,
    usage.cached_input_tokens,
    usage.reasoning,
    usage.reasoningOutputTokens,
    usage.reasoning_output_tokens
  ]
  return fields.reduce<number>((total, current) => total + numberValue(current), 0)
}

export function copilotModelMetricsTotal(value: unknown): number {
  const metrics = asRecord(value)
  if (!metrics) {
    return 0
  }
  let total = 0
  for (const metric of Object.values(metrics)) {
    const record = asRecord(metric)
    const usage = asRecord(record?.usage)
    if (!usage) {
      continue
    }
    total += tokenTotal(usage)
  }
  return total
}

export function claudeUsageTotal(value: unknown): number {
  const usage = asRecord(value)
  if (!usage) {
    return 0
  }
  return (
    numberValue(usage.input_tokens) +
    numberValue(usage.output_tokens) +
    numberValue(usage.cache_read_input_tokens) +
    numberValue(usage.cache_creation_input_tokens)
  )
}

export function claudeUsageBreakdown(value: unknown): AiVaultTokenUsage {
  const usage = asRecord(value)
  if (!usage) {
    return emptyTokenUsage()
  }
  const input = numberValue(usage.input_tokens)
  const cacheRead = numberValue(usage.cache_read_input_tokens)
  const cacheWrite = numberValue(usage.cache_creation_input_tokens)
  const output = numberValue(usage.output_tokens)
  return {
    input,
    cacheRead,
    cacheWrite,
    output,
    reasoning: 0,
    total: input + cacheRead + cacheWrite + output
  }
}

export function normalizeCodexUsage(value: unknown): CodexUsageSnapshot | null {
  const usage = asRecord(value)
  if (!usage) {
    return null
  }
  const inputTokens = numberValue(usage.input_tokens)
  const cachedInputTokens = numberValue(usage.cached_input_tokens ?? usage.cache_read_input_tokens)
  const outputTokens = numberValue(usage.output_tokens)
  const reasoningOutputTokens = numberValue(usage.reasoning_output_tokens)
  const totalTokens = numberValue(usage.total_tokens)

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens: totalTokens > 0 ? totalTokens : inputTokens + outputTokens
  }
}

export function addCodexUsageBreakdown(
  accumulator: SessionAccumulator,
  model: string | null,
  delta: CodexUsageSnapshot
): void {
  accumulator.totalTokens += delta.totalTokens
  addTokenUsage(accumulator, model, {
    input: delta.inputTokens,
    cacheRead: delta.cachedInputTokens,
    cacheWrite: 0,
    output: delta.outputTokens,
    reasoning: delta.reasoningOutputTokens,
    total: delta.totalTokens
  })
}

export function subtractCodexUsage(
  current: CodexUsageSnapshot,
  previous: CodexUsageSnapshot | null
): CodexUsageSnapshot {
  return {
    inputTokens: Math.max(current.inputTokens - (previous?.inputTokens ?? 0), 0),
    cachedInputTokens: Math.max(current.cachedInputTokens - (previous?.cachedInputTokens ?? 0), 0),
    outputTokens: Math.max(current.outputTokens - (previous?.outputTokens ?? 0), 0),
    reasoningOutputTokens: Math.max(
      current.reasoningOutputTokens - (previous?.reasoningOutputTokens ?? 0),
      0
    ),
    totalTokens: Math.max(current.totalTokens - (previous?.totalTokens ?? 0), 0)
  }
}

export function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function addCodexUsage(
  base: CodexUsageSnapshot,
  increment: CodexUsageSnapshot
): CodexUsageSnapshot {
  return {
    inputTokens: base.inputTokens + increment.inputTokens,
    cachedInputTokens: base.cachedInputTokens + increment.cachedInputTokens,
    outputTokens: base.outputTokens + increment.outputTokens,
    reasoningOutputTokens: base.reasoningOutputTokens + increment.reasoningOutputTokens,
    totalTokens: base.totalTokens + increment.totalTokens
  }
}
