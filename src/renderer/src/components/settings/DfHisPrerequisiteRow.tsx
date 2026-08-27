import type { ComponentProps, JSX } from 'react'
import { AlertTriangle, CheckCircle2, CircleDashed, Clipboard, Loader2 } from 'lucide-react'
import type {
  DfHisEnvironmentPrerequisiteResult,
  DfHisEnvironmentPrerequisiteStatus
} from '../../../../shared/dfhis-environment-types'
import { Button } from '../ui/button'
import { SettingsBadge } from './SettingsFormControls'
import { translate } from '@/i18n/i18n'

function isWorkflowPackPrerequisite(prerequisite: DfHisEnvironmentPrerequisiteResult): boolean {
  return prerequisite.id.startsWith('dfhis-workflow-pack-')
}

function getStatusLabel(prerequisite: DfHisEnvironmentPrerequisiteResult): string {
  const { status } = prerequisite
  if (status === 'ok') {
    return translate('auto.components.settings.DfHisEnvironmentPane.statusReady', 'Ready')
  }
  if (status === 'invalid') {
    if (prerequisite.id === 'gitlab') {
      return translate(
        'auto.components.settings.DfHisEnvironmentPane.statusNeedsLogin',
        'Needs login'
      )
    }
    if (isWorkflowPackPrerequisite(prerequisite) || prerequisite.fixable) {
      return translate(
        'auto.components.settings.DfHisEnvironmentPane.statusNeedsRepair',
        'Needs repair'
      )
    }
    return translate(
      'auto.components.settings.DfHisEnvironmentPane.statusNeedsAttention',
      'Needs attention'
    )
  }
  return translate('auto.components.settings.DfHisEnvironmentPane.statusMissing', 'Missing')
}

function getStatusTone(
  status: DfHisEnvironmentPrerequisiteStatus
): ComponentProps<typeof SettingsBadge>['tone'] {
  return status === 'ok' ? 'accent' : status === 'invalid' ? 'neutral' : 'muted'
}

function StatusIcon({
  status,
  loading
}: {
  status: DfHisEnvironmentPrerequisiteStatus
  loading: boolean
}): JSX.Element {
  if (loading) {
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />
  }
  if (status === 'ok') {
    return <CheckCircle2 className="size-4 text-foreground" />
  }
  if (status === 'invalid') {
    return <AlertTriangle className="size-4 text-destructive" />
  }
  return <CircleDashed className="size-4 text-muted-foreground" />
}

export function DfHisPrerequisiteRow({
  prerequisite,
  loading,
  onCopy
}: {
  prerequisite: DfHisEnvironmentPrerequisiteResult
  loading: boolean
  onCopy: (command: string) => void
}): JSX.Element {
  return (
    <div className="flex items-start gap-3 border-t border-border/50 py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="mt-0.5 shrink-0">
        <StatusIcon status={prerequisite.status} loading={loading} />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-foreground">{prerequisite.label}</h3>
          <SettingsBadge tone={getStatusTone(prerequisite.status)}>
            {getStatusLabel(prerequisite)}
          </SettingsBadge>
          {prerequisite.fixable ? (
            <SettingsBadge tone="muted">
              {translate(
                'auto.components.settings.DfHisEnvironmentPane.autoFixable',
                'Auto-fixable'
              )}
            </SettingsBadge>
          ) : null}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{prerequisite.summary}</p>
        {prerequisite.detail ? (
          <p className="break-words font-mono text-[11px] leading-5 text-muted-foreground">
            {prerequisite.detail}
          </p>
        ) : null}
        {prerequisite.command ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 pt-1">
            <code className="min-w-0 break-all rounded-md border border-border/60 bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground">
              {prerequisite.command}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => onCopy(prerequisite.command ?? '')}
              aria-label={translate(
                'auto.components.settings.DfHisEnvironmentPane.copyCommand',
                'Copy command'
              )}
            >
              <Clipboard />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
