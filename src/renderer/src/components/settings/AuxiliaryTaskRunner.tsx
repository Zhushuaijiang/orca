import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { useEffect, useRef, useState } from 'react'
import { captureRuntimeEnvironmentRequestRevision } from '@/runtime/runtime-environment-revision'
import {
  AUXILIARY_TASKS,
  isAuxiliaryTaskId,
  type AuxiliaryGenerationResult,
  type AuxiliaryTaskId
} from '../../../../shared/auxiliary-model-types'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  getCommitMessageAgentSpec,
  resolveCommitMessageAgentChoice
} from '../../../../shared/commit-message-agent-spec'
import { resolveAuxiliaryGenerationParams } from '../../../../shared/auxiliary-generation-routing'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { useAppStore } from '../../store'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

export function AuxiliaryTaskRunner({
  settings,
  hostKey
}: {
  settings: GlobalSettings
  hostKey: string
}): React.JSX.Element {
  const [task, setTask] = useState<AuxiliaryTaskId>('decomposition')
  const [prompt, setPrompt] = useState('')
  const [image, setImage] = useState('')
  const [running, setRunning] = useState(false)
  const [answer, setAnswer] = useState('')
  const [requestedModel, setRequestedModel] = useState('')
  const [error, setError] = useState('')
  const worktreeId = useAppStore((state) => state.activeWorktreeId)
  const pending = useRef<{
    target: ReturnType<typeof getActiveRuntimeTarget>
    worktree: string
    task: AuxiliaryTaskId
    revision?: number
  } | null>(null)
  useEffect(
    () => () => {
      const address = pending.current
      if (address) {
        void callRuntimeRpc(
          address.target,
          'auxiliary.cancel',
          { worktree: address.worktree, task: address.task },
          { expectedEnvironmentPairingRevision: address.revision }
        ).catch(() => {})
      }
    },
    []
  )
  const run = async () => {
    if (!worktreeId) {
      return
    }
    setRunning(true)
    setAnswer('')
    setRequestedModel('')
    setError('')
    const owner = getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), worktreeId)
    const target = getActiveRuntimeTarget({ activeRuntimeEnvironmentId: owner })
    const address = {
      target,
      revision:
        target.kind === 'environment'
          ? captureRuntimeEnvironmentRequestRevision(target.environmentId)
          : undefined,
      worktree: toRuntimeWorktreeSelector(worktreeId),
      task
    }
    pending.current = address
    try {
      const agent = resolveCommitMessageAgentChoice(
        null,
        settings.defaultTuiAgent,
        settings.disabledTuiAgents
      )
      const spec = agent && agent !== 'custom' ? getCommitMessageAgentSpec(agent) : undefined
      if (!spec) {
        throw new Error(translate('auxiliary.noAgent', 'Choose a supported default agent.'))
      }
      const resolved = resolveAuxiliaryGenerationParams(
        settings,
        task,
        { agentId: spec.id, model: spec.defaultModelId },
        hostKey
      )
      if (!resolved.ok) {
        throw new Error(resolved.error)
      }
      const result = await callRuntimeRpc<AuxiliaryGenerationResult>(
        address.target,
        'auxiliary.generate',
        {
          worktree: address.worktree,
          task,
          prompt,
          resolvedParams: resolved.params,
          ...(task === 'vision' && image.trim() ? { images: [image.trim()] } : {})
        },
        { timeoutMs: 180_000, expectedEnvironmentPairingRevision: address.revision }
      )
      if (result.success) {
        setAnswer(result.rawOutput)
        setRequestedModel(
          [
            result.agentLabel ?? result.agentId,
            result.modelId,
            result.fallbackUsed
              ? translate('auxiliary.usedFallback', 'Used the original task model')
              : undefined
          ]
            .filter(Boolean)
            .join(' · ')
        )
      } else {
        setError(result.error)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setRunning(false)
      pending.current = null
    }
  }
  const cancel = async () => {
    const address = pending.current
    if (!address) {
      return
    }
    try {
      await callRuntimeRpc(
        address.target,
        'auxiliary.cancel',
        {
          worktree: address.worktree,
          task: address.task
        },
        { expectedEnvironmentPairingRevision: address.revision }
      )
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }
  return (
    <Card>
      <CardContent>
        <div className="space-y-3">
          <h3 className="text-sm font-medium">
            {translate('auxiliary.try', 'Try an auxiliary task')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auxiliary.tryDescription',
              'Uses the current configuration and the active workspace. This calls your agent and may consume provider credits.'
            )}
          </p>
          <Label htmlFor="auxiliary-test-task">{translate('auxiliary.task', 'Task')}</Label>
          <Select
            value={task}
            disabled={running}
            onValueChange={(value) => {
              if (isAuxiliaryTaskId(value)) {
                setTask(value)
              }
            }}
          >
            <SelectTrigger id="auxiliary-test-task">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUXILIARY_TASKS.filter((entry) => entry.kind === 'text').map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {translate(`auxiliary.tasks.${entry.id}.title`, entry.title)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor="auxiliary-test-prompt">
            {translate('auxiliary.prompt', 'Task input')}
          </Label>
          <Textarea
            id="auxiliary-test-prompt"
            disabled={running}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          {task === 'vision' ? (
            <div className="space-y-2">
              <Label htmlFor="auxiliary-test-image">
                {translate('auxiliary.image', 'Image path on the execution host')}
              </Label>
              <Input
                id="auxiliary-test-image"
                value={image}
                disabled={running}
                onChange={(event) => setImage(event.target.value)}
              />
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button
              disabled={running || !prompt.trim() || !worktreeId || hostKey === 'unknown'}
              onClick={() => void run()}
            >
              {running
                ? translate('auxiliary.running', 'Running…')
                : translate('auxiliary.run', 'Run task')}
            </Button>
            {running ? (
              <Button variant="ghost" onClick={() => void cancel()}>
                {translate('auxiliary.cancel', 'Cancel')}
              </Button>
            ) : null}
          </div>
          {!worktreeId ? (
            <p className="text-xs text-muted-foreground">
              {translate('auxiliary.needWorkspace', 'Open a workspace to run a task.')}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {requestedModel ? (
            <p className="text-xs text-muted-foreground">
              {translate('auxiliary.requestedModel', 'Requested agent and model')}: {requestedModel}
            </p>
          ) : null}
          {answer ? <pre className="whitespace-pre-wrap break-words text-sm">{answer}</pre> : null}
        </div>
      </CardContent>
    </Card>
  )
}
