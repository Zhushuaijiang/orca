import type React from 'react'
import type { AiVaultListResult } from '../../../../shared/ai-vault-types'
import {
  blockingAiVaultScanIssue,
  skippedAiVaultTranscriptCount,
  skippedAiVaultTranscriptReasons,
  summarizeAiVaultScanNotices
} from './ai-vault-scan-issue-state'
import { translate } from '@/i18n/i18n'

// Messages are scanner-authored (host name, remote path, cap), so they render raw
// rather than through a catalog key.
export function AiVaultScanIssueBanners({
  scanResult
}: {
  scanResult: AiVaultListResult | null
}): React.JSX.Element {
  const blocking = blockingAiVaultScanIssue(scanResult)
  const skippedTranscriptCount = skippedAiVaultTranscriptCount(scanResult)
  const { oversizedSessionCount, otherNotices, otherNoticesDropped } =
    summarizeAiVaultScanNotices(scanResult)

  return (
    <>
      {blocking ? (
        <div className="border-b border-sidebar-border px-3 py-2 text-xs text-destructive">
          {blocking.message}
        </div>
      ) : null}
      {oversizedSessionCount > 0 ? (
        <div className="border-b border-sidebar-border px-3 py-1.5 text-[11px] text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.AiVaultPanel.oversizedRecordSessions',
            '{{count}} sessions had oversized transcript records skipped (kept to the first 10 MiB)',
            { count: oversizedSessionCount }
          )}
        </div>
      ) : null}
      {otherNotices.map((issue) => (
        <div
          // Message is part of the key: one host can report several distinct
          // messages for the same path, and a colliding key drops those rows.
          key={`${issue.executionHostId ?? 'local'}:${issue.kind}:${issue.agent}:${issue.path}:${issue.message}`}
          className={`border-b border-sidebar-border px-3 py-1.5 text-[11px] ${
            issue.kind === 'host' ? 'text-destructive' : 'text-muted-foreground'
          }`}
        >
          {issue.message}
        </div>
      ))}
      {otherNoticesDropped > 0 ? (
        <div className="border-b border-sidebar-border px-3 py-1.5 text-[11px] text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.AiVaultPanel.moreNotices',
            '…and {{count}} more notices',
            { count: otherNoticesDropped }
          )}
        </div>
      ) : null}
      {skippedTranscriptCount > 0 ? (
        <div className="border-b border-sidebar-border px-3 py-1.5 text-[11px] text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.AiVaultPanel.transcriptsSkipped',
            '{{count}} transcript skipped',
            { count: skippedTranscriptCount }
          )}
        </div>
      ) : null}
      {skippedAiVaultTranscriptReasons(scanResult).map((reason) => (
        <div
          key={reason}
          className="border-b border-sidebar-border px-3 py-1.5 text-[11px] text-muted-foreground"
        >
          {reason}
        </div>
      ))}
    </>
  )
}
