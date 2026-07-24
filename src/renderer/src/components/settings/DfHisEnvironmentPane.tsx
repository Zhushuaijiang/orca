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
  DfHisEnvironmentConfigSnapshot,
  DfHisEnvironmentCheckResult,
  DfHisEnvironmentPrerequisiteResult,
  DfHisEnvironmentPrerequisiteStatus
} from '../../../../shared/dfhis-environment-types'
import { Button } from '../ui/button'
import { SettingsBadge } from './SettingsFormControls'
import {
  createEmptyDfHisEnvironmentConfigForm,
  DfHisEnvironmentConfigForm,
  type DfHisEnvironmentConfigFormState
} from './DfHisEnvironmentConfigForm'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

type LoadState = 'idle' | 'checking' | 'installing'
type DfHisEnvironmentApi = typeof window.api.dfhisEnvironment
const DFHIS_PREREQUISITE_COUNT = 12

function getDfHisEnvironmentApi(): DfHisEnvironmentApi {
  const api = (window.api as { dfhisEnvironment?: DfHisEnvironmentApi }).dfhisEnvironment
  if (!api) {
    throw new Error(
      'DFHIS setup bridge is unavailable. Restart Orca to load the updated preload API.'
    )
  }
  return api
}

function getStatusLabel(status: DfHisEnvironmentPrerequisiteStatus): string {
  if (status === 'ok') {
    return translate('auto.components.settings.DfHisEnvironmentPane.statusReady', 'Ready')
  }
  if (status === 'invalid') {
    return translate(
      'auto.components.settings.DfHisEnvironmentPane.statusNeedsLogin',
      'Needs login'
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

function PrerequisiteRow({
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
            {getStatusLabel(prerequisite.status)}
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

export function DfHisEnvironmentPane(): JSX.Element {
  const [checkResult, setCheckResult] = useState<DfHisEnvironmentCheckResult | null>(null)
  const [configSnapshot, setConfigSnapshot] = useState<DfHisEnvironmentConfigSnapshot | null>(null)
  const [configForm, setConfigForm] = useState<DfHisEnvironmentConfigFormState>(() =>
    createEmptyDfHisEnvironmentConfigForm()
  )
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [messages, setMessages] = useState<string[]>([])

  const readyCount = useMemo(
    () =>
      checkResult?.prerequisites.filter((prerequisite) => prerequisite.status === 'ok').length ?? 0,
    [checkResult]
  )
  const totalCount = checkResult?.prerequisites.length ?? DFHIS_PREREQUISITE_COUNT
  const isBusy = loadState !== 'idle'

  const hydrateConfigForm = useCallback((snapshot: DfHisEnvironmentConfigSnapshot) => {
    setConfigSnapshot(snapshot)
    setConfigForm((current) => ({
      ...current,
      gitlabHost: current.gitlabHost || snapshot.gitlabHost,
      gitlabAccessToken: current.gitlabAccessToken || snapshot.gitlabAccessToken,
      yunxiaoMcpUrl: current.yunxiaoMcpUrl || snapshot.yunxiaoMcpUrl,
      yunxiaoAccessToken: current.yunxiaoAccessToken || snapshot.yunxiaoAccessToken,
      hisMcpUrl: current.hisMcpUrl || snapshot.hisMcpUrl,
      hisMcpToken: current.hisMcpToken || snapshot.hisMcpToken,
      hisCodeRoot: current.hisCodeRoot || snapshot.hisCodeRoot,
      archiveWorkspacePath: current.archiveWorkspacePath || snapshot.archiveWorkspacePath
    }))
  }, [])

  const updateConfigField = useCallback(
    (field: keyof DfHisEnvironmentConfigFormState, value: string) => {
      setConfigForm((current) => ({ ...current, [field]: value }))
    },
    []
  )

  const check = useCallback(async () => {
    setLoadState('checking')
    try {
      const result = await getDfHisEnvironmentApi().check()
      setCheckResult(result)
      hydrateConfigForm(result.config)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.settings.DfHisEnvironmentPane.checkFailed',
              'DFHIS setup check failed.'
            )
      )
    } finally {
      setLoadState('idle')
    }
  }, [hydrateConfigForm])

  const install = useCallback(async () => {
    setLoadState('installing')
    try {
      const result = await getDfHisEnvironmentApi().install(configForm)
      setMessages(result.messages)
      setCheckResult(result.check)
      hydrateConfigForm(result.check.config)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.settings.DfHisEnvironmentPane.installFailed',
              'DFHIS setup repair failed.'
            )
      )
    } finally {
      setLoadState('idle')
    }
  }, [configForm, hydrateConfigForm])

  const copyCommand = useCallback(async (command: string) => {
    await navigator.clipboard.writeText(command)
    toast.success(
      translate('auto.components.settings.DfHisEnvironmentPane.commandCopied', 'Command copied')
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
              'auto.components.settings.DfHisEnvironmentPane.summary',
              '{{value0}} of {{value1}} prerequisites ready',
              { value0: readyCount, value1: totalCount }
            )}
          </p>
          <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
            {translate(
              'auto.components.settings.DfHisEnvironmentPane.description',
              'Run a local readiness check before teammates use GitLab, Yunxiao, HIS, local code, and DFHIS workflow packs in Orca.'
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={check} disabled={isBusy}>
            {loadState === 'checking' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {translate('auto.components.settings.DfHisEnvironmentPane.checkAll', 'Check all')}
          </Button>
          <Button type="button" size="sm" onClick={install} disabled={isBusy}>
            {loadState === 'installing' ? <Loader2 className="animate-spin" /> : <Wrench />}
            {translate(
              'auto.components.settings.DfHisEnvironmentPane.installRepair',
              'Save & install'
            )}
          </Button>
        </div>
      </div>

      <DfHisEnvironmentConfigForm
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
              'auto.components.settings.DfHisEnvironmentPane.loading',
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
