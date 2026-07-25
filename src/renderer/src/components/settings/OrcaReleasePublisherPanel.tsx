import { useCallback, useEffect, useState, type JSX } from 'react'
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Rocket } from 'lucide-react'
import { toast } from 'sonner'
import type {
  OrcaReleaseArtifact,
  OrcaReleasePublisherStatus
} from '../../../../shared/orca-release-publisher-types'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { SettingsBadge } from './SettingsFormControls'

type ReleaseLoadState = 'idle' | 'checking' | 'publishing'
type DfHisEnvironmentApi = typeof window.api.dfhisEnvironment

function getDfHisEnvironmentApi(): DfHisEnvironmentApi {
  const api = (window.api as { dfhisEnvironment?: DfHisEnvironmentApi }).dfhisEnvironment
  if (!api) {
    throw new Error(
      'DFHIS setup bridge is unavailable. Restart Orca to load the updated preload API.'
    )
  }
  return api
}

function formatBytes(size: number | undefined): string {
  if (!size) {
    return ''
  }
  const mib = size / 1024 / 1024
  return `${mib.toFixed(mib >= 100 ? 0 : 1)} MB`
}

function shortSha(sha: string): string {
  return sha ? sha.slice(0, 10) : 'unknown'
}

function ReleaseArtifactRow({ artifact }: { artifact: OrcaReleaseArtifact }): JSX.Element {
  const ready = artifact.status === 'ready'
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 border-t border-border/50 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <SettingsBadge tone={ready ? 'accent' : 'muted'}>
            {ready ? 'Ready' : artifact.status}
          </SettingsBadge>
          {artifact.version ? (
            <span className="text-xs text-muted-foreground">{artifact.version}</span>
          ) : null}
          {artifact.size ? (
            <span className="text-xs text-muted-foreground">{formatBytes(artifact.size)}</span>
          ) : null}
        </div>
        <p className="break-all font-mono text-[11px] leading-5 text-muted-foreground">
          {artifact.path}
        </p>
      </div>
    </div>
  )
}

export function OrcaReleasePublisherPanel(): JSX.Element {
  const [status, setStatus] = useState<OrcaReleasePublisherStatus | null>(null)
  const [loadState, setLoadState] = useState<ReleaseLoadState>('idle')
  const [repoRoot, setRepoRoot] = useState('')
  const [sshPassword, setSshPassword] = useState('')
  const [notes, setNotes] = useState(
    'Fix automation session reuse and prefer the direct Yunxiao archive workflow.'
  )
  const isBusy = loadState !== 'idle'
  const selectedMac = status?.selectedMacAppPath
  const selectedWindows = status?.selectedWindowsExePath
  const canPublish = Boolean(selectedMac && selectedWindows && !isBusy)

  const refresh = useCallback(async () => {
    setLoadState('checking')
    try {
      const nextStatus = await getDfHisEnvironmentApi().releaseStatus(repoRoot || undefined)
      setStatus(nextStatus)
      setRepoRoot(nextStatus.repoRoot)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Release status check failed.')
    } finally {
      setLoadState('idle')
    }
  }, [repoRoot])

  const publish = useCallback(async () => {
    if (!selectedMac || !selectedWindows) {
      toast.error('Missing ready macOS or Windows artifact for the current version.')
      return
    }
    setLoadState('publishing')
    try {
      const result = await getDfHisEnvironmentApi().publishRelease({
        repoRoot: status?.repoRoot || repoRoot || undefined,
        macAppPath: selectedMac,
        windowsExePath: selectedWindows,
        sshPassword,
        notes,
        cleanOldReleases: true,
        cleanLocalOldReleases: true
      })
      setStatus(result.status)
      toast.success(`Published Orca ${result.version}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Release publish failed.')
    } finally {
      setLoadState('idle')
    }
  }, [notes, repoRoot, selectedMac, selectedWindows, sshPassword, status?.repoRoot])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="space-y-4 rounded-lg border border-border/50 bg-background/40 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">Orca Release Publisher</h3>
            {status ? <SettingsBadge tone="neutral">{status.version}</SettingsBadge> : null}
          </div>
          <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
            Reuse verified artifacts, publish them to the DFHIS download server, and remove stale
            release folders.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isBusy}>
            {loadState === 'checking' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Refresh
          </Button>
          <Button type="button" size="sm" onClick={publish} disabled={!canPublish}>
            {loadState === 'publishing' ? <Loader2 className="animate-spin" /> : <Rocket />}
            Publish
          </Button>
        </div>
      </div>

      {status ? (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">Current commit</p>
            <p className="text-xs text-muted-foreground">
              {status.branch || 'detached'} · {shortSha(status.headSha)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">Server latest</p>
            <p className="text-xs text-muted-foreground">
              {status.remoteLatest?.version || 'Unavailable'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">Working tree</p>
            <p className="text-xs text-muted-foreground">{status.isDirty ? 'Dirty' : 'Clean'}</p>
          </div>
        </div>
      ) : null}

      {status?.warnings.length ? (
        <div className="space-y-1">
          {status.warnings.map((warning) => (
            <p key={warning} className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="size-3.5 text-destructive" />
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">macOS app candidates</p>
          <div className="rounded-md border border-border/50 px-3 py-3">
            {status?.macCandidates.map((artifact) => (
              <ReleaseArtifactRow key={artifact.path} artifact={artifact} />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Windows installer candidates</p>
          <div className="rounded-md border border-border/50 px-3 py-3">
            {status?.windowsCandidates.map((artifact) => (
              <ReleaseArtifactRow key={artifact.path} artifact={artifact} />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5 md:col-span-2">
          <span className="text-xs font-medium text-foreground">Repo root</span>
          <Input
            value={repoRoot}
            onChange={(event) => setRepoRoot(event.target.value)}
            disabled={isBusy}
            placeholder="~/workspace/github/orca"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">SSH password</span>
          <Input
            type="password"
            value={sshPassword}
            onChange={(event) => setSshPassword(event.target.value)}
            disabled={isBusy}
            placeholder="Use SSH key if empty"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">Release notes</span>
          <Input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={isBusy}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border/50 pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <ExternalLink className="size-3.5" />
          /downloads/orca/macos
        </span>
        <span className="inline-flex items-center gap-1">
          <ExternalLink className="size-3.5" />
          /downloads/orca/windows
        </span>
      </div>
    </div>
  )
}
