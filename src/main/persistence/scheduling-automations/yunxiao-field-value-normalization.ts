import type { YunxiaoTodoPoolStatus } from '../../../shared/yunxiao-types'

export function normalizeYunxiaoTodoPoolStatus(value: unknown): YunxiaoTodoPoolStatus {
  if (value === 'needs_clarification') {
    return 'needs-clarification'
  }
  if (value === 'ready_to_build') {
    return 'ready-to-build'
  }
  if (value === 'ready_to_verify' || value === 'ready-to-verify') {
    return 'done'
  }
  return value === 'needs-clarification' ||
    value === 'ready-to-build' ||
    value === 'archived' ||
    value === 'running' ||
    value === 'dispatched' ||
    value === 'workspace-created' ||
    value === 'failed' ||
    value === 'done' ||
    value === 'dismissed'
    ? value
    : 'queued'
}

export function normalizeYunxiaoTodoPoolClaimTime(value: unknown): number | null {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : null
}

export function normalizeYunxiaoTodoPoolAttempts(value: unknown): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 0
}

export function normalizeYunxiaoTodoPoolOrder(value: unknown, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0
    ? Math.floor(Number(value))
    : Math.max(1, Math.floor(fallback))
}

export function normalizeOptionalNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function normalizeRequiredString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export function normalizePositiveTimestamp(value: unknown): number | null {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : null
}
