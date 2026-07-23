import { useCallback, useEffect, useMemo, useState, type ComponentProps, type JSX } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clipboard,
  Loader2,
  RefreshCw,
  Wrench
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  YgtEnvironmentConfigSnapshot,
  YgtEnvironmentCheckResult,
  YgtEnvironmentPrerequisiteResult,
  YgtEnvironmentPrerequisiteStatus
} from '../../../../shared/ygt-environment-types'
import { Button } from '../ui/button'
import { SettingsBadge } from './SettingsFormControls'
import {
  createEmptyYgtEnvironmentConfigForm,
  YgtEnvironmentConfigForm,
  type YgtEnvironmentConfigFormState
} from './YgtEnvironmentConfigForm'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

type LoadState = 'idle' | 'checking' | 'installing'

function getStatusLabel(status: YgtEnvironmentPrerequisiteStatus): string {
  if (status === 'ok') {
    return translate('auto.components.settings.YgtEnvironmentPane.statusReady', 'Ready')
  }
  if (status === 'invalid') {
    return translate('auto.components.settings.YgtEnvironmentPane.statusNeedsLogin', 'Needs login')
  }
  return translate('auto.components.settings.YgtEnvironmentPane.statusMissing', 'Missing')
}

function getStatusTone(
  status: YgtEnvironmentPrerequisiteStatus
): ComponentProps<typeof SettingsBadge>['tone'] {
  return status === 'ok' ? 'accent' : status === 'invalid' ? 'neutral' : 'muted'
}

function StatusIcon({
  status,
  loading
}: {
  status: YgtEnvironmentPrerequisiteStatus
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

function PrerequisiteRow({
  prerequisite,
  loading,
  onCopy
}: {
  prerequisite: YgtEnvironmentPrerequisiteResult
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
            {getStatusLabel(prerequisite.status)}
          </SettingsBadge>
          {prerequisite.fixable ? (
            <SettingsBadge tone="muted">
              {translate('auto.components.settings.YgtEnvironmentPane.autoFixable', 'Auto-fixable')}
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
                'auto.components.settings.YgtEnvironmentPane.copyCommand',
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

export function YgtEnvironmentPane(): JSX.Element {
  const [checkResult, setCheckResult] = useState<YgtEnvironmentCheckResult | null>(null)
  const [configSnapshot, setConfigSnapshot] = useState<YgtEnvironmentConfigSnapshot | null>(null)
  const [configForm, setConfigForm] = useState<YgtEnvironmentConfigFormState>(() =>
    createEmptyYgtEnvironmentConfigForm()
  )
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [messages, setMessages] = useState<string[]>([])

  const readyCount = useMemo(
    () =>
      checkResult?.prerequisites.filter((prerequisite) => prerequisite.status === 'ok').length ?? 0,
    [checkResult]
  )
  const totalCount = checkResult?.prerequisites.length ?? 4
  const isBusy = loadState !== 'idle'

  const hydrateConfigForm = useCallback((snapshot: YgtEnvironmentConfigSnapshot) => {
    setConfigSnapshot(snapshot)
    setConfigForm((current) => ({
      ...current,
      gitlabHost: current.gitlabHost || snapshot.gitlabHost,
      yunxiaoMcpUrl: current.yunxiaoMcpUrl || snapshot.yunxiaoMcpUrl,
      hisMcpUrl: current.hisMcpUrl || snapshot.hisMcpUrl
    }))
  }, [])

  const updateConfigField = useCallback(
    (field: keyof YgtEnvironmentConfigFormState, value: string) => {
      setConfigForm((current) => ({ ...current, [field]: value }))
    },
    []
  )

  const check = useCallback(async () => {
    setLoadState('checking')
    try {
      const result = await window.api.ygtEnvironment.check()
      setCheckResult(result)
      hydrateConfigForm(result.config)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.settings.YgtEnvironmentPane.checkFailed',
              'YGT environment check failed.'
            )
      )
    } finally {
      setLoadState('idle')
    }
  }, [hydrateConfigForm])

  const install = useCallback(async () => {
    setLoadState('installing')
    try {
      const result = await window.api.ygtEnvironment.install(configForm)
      setMessages(result.messages)
      setCheckResult(result.check)
      hydrateConfigForm(result.check.config)
      setConfigForm((current) => ({
        ...current,
        gitlabAccessToken: '',
        yunxiaoAccessToken: '',
        hisMcpToken: ''
      }))
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.settings.YgtEnvironmentPane.installFailed',
              'YGT environment repair failed.'
            )
      )
    } finally {
      setLoadState('idle')
    }
  }, [configForm, hydrateConfigForm])

  const copyCommand = useCallback(async (command: string) => {
    await navigator.clipboard.writeText(command)
    toast.success(
      translate('auto.components.settings.YgtEnvironmentPane.commandCopied', 'Command copied')
    )
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">
            {translate(
              'auto.components.settings.YgtEnvironmentPane.summary',
              '{{value0}} of {{value1}} prerequisites ready',
              { value0: readyCount, value1: totalCount }
            )}
          </p>
          <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
            {translate(
              'auto.components.settings.YgtEnvironmentPane.description',
              'Run a local readiness check before teammates use GitLab, Yunxiao, HIS, and YGT workflows in Orca.'
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={check} disabled={isBusy}>
            {loadState === 'checking' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {translate('auto.components.settings.YgtEnvironmentPane.checkAll', 'Check all')}
          </Button>
          <Button type="button" size="sm" onClick={install} disabled={isBusy}>
            {loadState === 'installing' ? <Loader2 className="animate-spin" /> : <Wrench />}
            {translate(
              'auto.components.settings.YgtEnvironmentPane.installRepair',
              'Save & install'
            )}
          </Button>
        </div>
      </div>

      <YgtEnvironmentConfigForm
        value={configForm}
        snapshot={configSnapshot}
        disabled={isBusy}
        onChange={updateConfigField}
      />

      <div
        className={cn(
          'rounded-lg border border-border/50 bg-background/40 px-4 py-4',
          !checkResult && 'text-muted-foreground'
        )}
      >
        {checkResult ? (
          checkResult.prerequisites.map((prerequisite) => (
            <PrerequisiteRow
              key={prerequisite.id}
              prerequisite={prerequisite}
              loading={isBusy}
              onCopy={copyCommand}
            />
          ))
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            {translate(
              'auto.components.settings.YgtEnvironmentPane.loading',
              'Checking prerequisites...'
            )}
          </div>
        )}
      </div>

      {messages.length > 0 ? (
        <div className="space-y-1 border-t border-border/50 pt-4">
          {messages.map((message) => (
            <p key={message} className="break-words text-xs leading-5 text-muted-foreground">
              {message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}
