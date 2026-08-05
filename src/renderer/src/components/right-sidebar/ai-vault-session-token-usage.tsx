import type React from 'react'
import { Coins } from 'lucide-react'
import { formatTokens } from '@/components/stats/usage-formatters'
import { translate } from '@/i18n/i18n'
import type { AiVaultSession, AiVaultTokenUsage } from '../../../../shared/ai-vault-types'

// Per-session token receipt: overall total, category rows, and one group per
// model when more than one model contributed usage.
export function SessionTokenUsageSection({
  session
}: {
  session: AiVaultSession
}): React.JSX.Element | null {
  const usage = session.tokenUsage
  if (!usage || usage.total <= 0) {
    return null
  }
  const models = Object.entries(session.tokenUsageByModel ?? {})
    .filter(([, modelUsage]) => modelUsage.total > 0)
    .sort((a, b) => b[1].total - a[1].total)

  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        <span className="text-muted-foreground/80">
          <Coins className="size-3" />
        </span>
        <span>
          {translate(
            'auto.components.right.sidebar.AiVaultSessionDetails.tokenUsage',
            'Token usage'
          )}
        </span>
      </div>
      <div className="space-y-1 rounded-md border border-sidebar-border/70 bg-sidebar-accent/25 px-2.5 py-2">
        <div className="flex items-center justify-between gap-3 text-[11px] leading-4">
          <span className="font-medium text-foreground">
            {translate('auto.components.right.sidebar.AiVaultSessionDetails.tokenTotal', 'Total')}
          </span>
          <span className="shrink-0 font-mono text-foreground">{formatTokens(usage.total)}</span>
        </div>
        {models.length <= 1 ? (
          <TokenUsageCategoryRows usage={usage} />
        ) : (
          models.map(([model, modelUsage]) => (
            <div key={model} className="space-y-1 border-t border-sidebar-border/50 pt-1.5">
              <div className="flex items-center justify-between gap-3 text-[11px] leading-4">
                <span className="truncate font-mono text-foreground/90">{model}</span>
                <span className="shrink-0 font-mono text-muted-foreground">
                  {formatTokens(modelUsage.total)}
                </span>
              </div>
              <TokenUsageCategoryRows usage={modelUsage} />
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function TokenUsageCategoryRows({ usage }: { usage: AiVaultTokenUsage }): React.JSX.Element | null {
  const rows = [
    {
      key: 'input',
      label: translate('auto.components.right.sidebar.AiVaultSessionDetails.tokenInput', 'Input'),
      value: usage.input
    },
    {
      key: 'cacheRead',
      label: translate(
        'auto.components.right.sidebar.AiVaultSessionDetails.tokenCacheRead',
        'Cache read'
      ),
      value: usage.cacheRead
    },
    {
      key: 'cacheWrite',
      label: translate(
        'auto.components.right.sidebar.AiVaultSessionDetails.tokenCacheWrite',
        'Cache write'
      ),
      value: usage.cacheWrite
    },
    {
      key: 'output',
      label: translate('auto.components.right.sidebar.AiVaultSessionDetails.tokenOutput', 'Output'),
      value: usage.output
    },
    {
      key: 'reasoning',
      label: translate(
        'auto.components.right.sidebar.AiVaultSessionDetails.tokenReasoning',
        'Reasoning'
      ),
      value: usage.reasoning
    }
  ].filter((row) => row.value > 0)
  if (rows.length === 0) {
    return null
  }
  return (
    <div className="space-y-0.5">
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex items-center justify-between gap-3 text-[11px] leading-4"
        >
          <span className="text-muted-foreground">{row.label}</span>
          <span className="shrink-0 font-mono text-muted-foreground">
            {formatTokens(row.value)}
          </span>
        </div>
      ))}
    </div>
  )
}
