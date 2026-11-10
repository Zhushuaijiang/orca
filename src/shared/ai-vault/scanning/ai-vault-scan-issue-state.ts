import type { AiVaultScanIssue } from '../contracts/ai-vault-types'

/** Desktop and mobile History classify the same listSessions reply. */
type AiVaultScanIssueView = {
  sessions: readonly unknown[]
  issues: readonly AiVaultScanIssue[]
} | null

export function blockingAiVaultScanIssue(result: AiVaultScanIssueView): AiVaultScanIssue | null {
  if (!result || result.sessions.length > 0) {
    return null
  }
  return result.issues.find((issue) => issue.kind === 'host') ?? null
}

// Host/scope failures need their own rows: one unreachable host or locked database can hide many transcripts.
export function aiVaultScanNoticeIssues(result: AiVaultScanIssueView): AiVaultScanIssue[] {
  if (!result) {
    return []
  }
  const blocking = blockingAiVaultScanIssue(result)
  return result.issues.filter((issue) => Boolean(issue.kind) && issue !== blocking)
}

// Include message identity: one host may report multiple notices for the same path.
export function aiVaultScanIssueKey(issue: AiVaultScanIssue): string {
  return `${issue.executionHostId ?? 'local'}:${issue.kind}:${issue.agent}:${issue.path}:${issue.message}`
}

/** Only kind-less issues are individual transcripts the scan skipped. */
export function skippedAiVaultTranscriptIssues(result: AiVaultScanIssueView): AiVaultScanIssue[] {
  return result ? result.issues.filter((issue) => !issue.kind) : []
}

// Why: the scanner emits one oversized-record notice per affected session, so a
// vault with hundreds of huge transcripts would wall the panel in identical
// rows. They collapse into one counted summary; other notices stay per-row.
export function isOversizedRecordNotice(message: string): boolean {
  return message.startsWith('Skipped ') && message.includes('oversized transcript record')
}

const OTHER_NOTICE_LIMIT = 3

export type AiVaultScanNoticeSummary = {
  oversizedSessionCount: number
  otherNotices: AiVaultScanIssue[]
  otherNoticesDropped: number
}

export function summarizeAiVaultScanNotices(result: AiVaultScanIssueView): AiVaultScanNoticeSummary {
  const oversizedPaths = new Set<string>()
  const otherNotices: AiVaultScanIssue[] = []
  for (const issue of aiVaultScanNoticeIssues(result)) {
    if (isOversizedRecordNotice(issue.message)) {
      oversizedPaths.add(`${issue.executionHostId ?? 'local'}:${issue.agent}:${issue.path}`)
    } else {
      otherNotices.push(issue)
    }
  }
  return {
    oversizedSessionCount: oversizedPaths.size,
    otherNotices: otherNotices.slice(0, OTHER_NOTICE_LIMIT),
    otherNoticesDropped: Math.max(0, otherNotices.length - OTHER_NOTICE_LIMIT)
  }
}
