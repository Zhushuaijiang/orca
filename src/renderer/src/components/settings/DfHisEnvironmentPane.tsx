import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { Loader2, RefreshCw, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import type {
  DfHisEnvironmentConfigSnapshot,
  DfHisEnvironmentCheckResult
} from '../../../../shared/dfhis-environment-types'
import { AGENT_SKILL_HOME_DIRECTORIES } from '../../../../shared/agent-skill-home-directories'
import { Button } from '../ui/button'
import { DfHisPrerequisiteRow } from './DfHisPrerequisiteRow'
import {
  createEmptyDfHisEnvironmentConfigForm,
  DfHisEnvironmentConfigForm,
  type DfHisEnvironmentConfigFormState
} from './DfHisEnvironmentConfigForm'
import {
  DfHisPathsConfigDialog,
  createEmptyPathsConfig,
  type DfHisPathsConfigState
} from './DfHisPathsConfigDialog'
import {
  DfHisAiConfigDialog,
  createEmptyAiConfig,
  type DfHisAiConfigState
} from './DfHisAiConfigDialog'
import {
  DfHisSmtpConfigDialog,
  createEmptySmtpConfig,
  type DfHisSmtpConfigState
} from './DfHisSmtpConfigDialog'
import {
  DfHisWorkflowGateDialog,
  createEmptyWorkflowGateConfig,
  type DfHisWorkflowGateState
} from './DfHisWorkflowGateDialog'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

type LoadState = 'idle' | 'checking' | 'installing'
type DfHisEnvironmentApi = typeof window.api.dfhisEnvironment
// Why: 10 non-pack checks plus the universal root and one row per agent home.
const DFHIS_PREREQUISITE_COUNT = 11 + Object.keys(AGENT_SKILL_HOME_DIRECTORIES).length

function getDfHisEnvironmentApi(): DfHisEnvironmentApi {
  const api = (window.api as { dfhisEnvironment?: DfHisEnvironmentApi }).dfhisEnvironment
  if (!api) {
    throw new Error(
      'DFHIS setup bridge is unavailable. Restart Orca to load the updated preload API.'
    )
  }
  return api
}

export function DfHisEnvironmentPane(): JSX.Element {
  const [checkResult, setCheckResult] = useState<DfHisEnvironmentCheckResult | null>(null)
  const [configSnapshot, setConfigSnapshot] = useState<DfHisEnvironmentConfigSnapshot | null>(null)
  const [configForm, setConfigForm] = useState<DfHisEnvironmentConfigFormState>(() =>
    createEmptyDfHisEnvironmentConfigForm()
  )
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [messages, setMessages] = useState<string[]>([])
  const [pathsForm, setPathsForm] = useState<DfHisPathsConfigState>(createEmptyPathsConfig())
  const [aiForm, setAiForm] = useState<DfHisAiConfigState>(createEmptyAiConfig())
  const [hasRelayApiKey, setHasRelayApiKey] = useState(false)
  const [hasVisionApiKey, setHasVisionApiKey] = useState(false)
  const [smtpForm, setSmtpForm] = useState<DfHisSmtpConfigState>(createEmptySmtpConfig())
  const [hasSmtpPassword, setHasSmtpPassword] = useState(false)
  const [workflowForm, setWorkflowForm] = useState<DfHisWorkflowGateState>(
    createEmptyWorkflowGateConfig()
  )

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
      hisMcpToken: current.hisMcpToken || snapshot.hisMcpToken
    }))
    setPathsForm((current) => ({
      hisCodeRoot: current.hisCodeRoot || snapshot.hisCodeRoot,
      hisWorkflowCatalogPath: current.hisWorkflowCatalogPath || snapshot.hisWorkflowCatalogPath,
      archiveWorkspacePath: current.archiveWorkspacePath || snapshot.archiveWorkspacePath,
      hisFactCardsRoot: current.hisFactCardsRoot || snapshot.hisFactCardsRoot,
      hisFactIndexPath: current.hisFactIndexPath || snapshot.hisFactIndexPath,
      ygtWorkspaceRoot: current.ygtWorkspaceRoot || snapshot.ygtWorkspaceRoot,
      projectIndexManifestPath:
        current.projectIndexManifestPath || snapshot.projectIndexManifestPath,
      projectCodeGraphPath: current.projectCodeGraphPath || snapshot.projectCodeGraphPath,
      projectKnowledgeIndexPath:
        current.projectKnowledgeIndexPath || snapshot.projectKnowledgeIndexPath
    }))
    setAiForm((current) => ({
      relayExecModel: current.relayExecModel || snapshot.relayExecModel,
      relayExecApiKey: current.relayExecApiKey || snapshot.relayExecApiKey,
      visionApiKey: current.visionApiKey || snapshot.visionApiKey,
      dfhisSkillPackUrl: current.dfhisSkillPackUrl || snapshot.dfhisSkillPackUrl
    }))
    setHasRelayApiKey(snapshot.hasRelayExecApiKey)
    setHasVisionApiKey(snapshot.hasVisionApiKey)
    setSmtpForm((current) => ({
      smtpHost: current.smtpHost || snapshot.smtpHost,
      smtpPort: current.smtpPort || snapshot.smtpPort,
      smtpUser: current.smtpUser || snapshot.smtpUser,
      smtpPassword: current.smtpPassword || snapshot.smtpPassword,
      smtpFromName: current.smtpFromName || snapshot.smtpFromName,
      emailCc: current.emailCc || snapshot.emailCc
    }))
    setHasSmtpPassword(snapshot.hasSmtpPassword)
    // Why: old hosts may not publish hisWorkflow yet — default the gate to off.
    setWorkflowForm({ rcE2eGate: snapshot.hisWorkflow?.rcE2eGate ?? false })
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
      const result = await getDfHisEnvironmentApi().install({
        ...configForm,
        hisCodeRoot: pathsForm.hisCodeRoot,
        hisWorkflowCatalogPath: pathsForm.hisWorkflowCatalogPath,
        archiveWorkspacePath: pathsForm.archiveWorkspacePath,
        hisFactCardsRoot: pathsForm.hisFactCardsRoot,
        hisFactIndexPath: pathsForm.hisFactIndexPath,
        ygtWorkspaceRoot: pathsForm.ygtWorkspaceRoot,
        projectIndexManifestPath: pathsForm.projectIndexManifestPath,
        projectCodeGraphPath: pathsForm.projectCodeGraphPath,
        projectKnowledgeIndexPath: pathsForm.projectKnowledgeIndexPath,
        relayExecModel: aiForm.relayExecModel,
        relayExecApiKey: aiForm.relayExecApiKey,
        visionApiKey: aiForm.visionApiKey,
        dfhisSkillPackUrl: aiForm.dfhisSkillPackUrl,
        smtpHost: smtpForm.smtpHost,
        smtpPort: smtpForm.smtpPort,
        smtpUser: smtpForm.smtpUser,
        smtpPassword: smtpForm.smtpPassword,
        smtpFromName: smtpForm.smtpFromName,
        emailCc: smtpForm.emailCc,
        hisWorkflow: { rcE2eGate: workflowForm.rcE2eGate }
      })
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
  }, [configForm, pathsForm, aiForm, smtpForm, workflowForm, hydrateConfigForm])

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
        advancedSlots={[
          <DfHisPathsConfigDialog
            key="paths"
            value={pathsForm}
            disabled={isBusy}
            onSave={setPathsForm}
          />,
          <DfHisAiConfigDialog
            key="ai"
            value={aiForm}
            hasRelayApiKey={hasRelayApiKey}
            hasVisionApiKey={hasVisionApiKey}
            disabled={isBusy}
            onSave={setAiForm}
          />,
          <DfHisSmtpConfigDialog
            key="smtp"
            value={smtpForm}
            hasPassword={hasSmtpPassword}
            disabled={isBusy}
            onSave={setSmtpForm}
          />,
          <DfHisWorkflowGateDialog
            key="workflow"
            value={workflowForm}
            disabled={isBusy}
            onSave={setWorkflowForm}
          />
        ]}
      />

      <div
        className={cn(
          'rounded-lg border border-border/50 bg-background/40 px-4 py-4',
          !checkResult && 'text-muted-foreground'
        )}
      >
        {checkResult ? (
          checkResult.prerequisites.map((prerequisite) => (
            <DfHisPrerequisiteRow
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
