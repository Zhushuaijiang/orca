import { useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { captureRuntimeEnvironmentRequestRevision } from '@/runtime/runtime-environment-revision'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { useAppStore } from '../../store'
import type { AutomaticRoutingResult } from '../../../../shared/automatic-task-routing-types'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import { AUXILIARY_TASKS } from '../../../../shared/auxiliary-model-types'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'

export function AutomaticRoutingPreview({
  primaryAgent
}: {
  primaryAgent?: string | null
}): React.JSX.Element {
  const worktreeId = useAppStore((state) => state.activeWorktreeId)
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState<{
    worktree: string
    routing: AutomaticRoutingResult
  } | null>(null)
  const [loadingFor, setLoadingFor] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ worktree: string; message: string } | null>(null)
  const request = useRef(0)
  const running = loadingFor === worktreeId && loadingFor !== null
  const routing = result?.worktree === worktreeId ? result.routing : undefined
  const route = routing?.route
  const task = AUXILIARY_TASKS.find((entry) => entry.id === route?.decision.task)
  const error = failure?.worktree === worktreeId ? failure.message : routing?.error
  const run = async () => {
    if (!worktreeId || !prompt.trim()) {
      return
    }
    const owner = getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), worktreeId)
    if (owner === undefined) {
      setFailure({
        worktree: worktreeId,
        message: translate(
          'auxiliary.automatic.unknownHost',
          'The workspace execution host is unknown.'
        )
      })
      return
    }
    const generation = ++request.current
    const target = getActiveRuntimeTarget({ activeRuntimeEnvironmentId: owner })
    const revision =
      target.kind === 'environment'
        ? captureRuntimeEnvironmentRequestRevision(target.environmentId)
        : undefined
    setLoadingFor(worktreeId)
    setFailure(null)
    try {
      const routing = await callRuntimeRpc<AutomaticRoutingResult>(
        target,
        'auxiliary.route',
        {
          worktree: toRuntimeWorktreeSelector(worktreeId),
          prompt,
          ...(primaryAgent && isTuiAgent(primaryAgent) ? { primaryAgent } : {})
        },
        { expectedEnvironmentPairingRevision: revision, timeoutMs: 180_000 }
      )
      if (generation === request.current) {
        setResult({ worktree: worktreeId, routing })
      }
    } catch (error) {
      if (generation === request.current) {
        setFailure({
          worktree: worktreeId,
          message: error instanceof Error ? error.message : String(error)
        })
      }
    } finally {
      if (generation === request.current) {
        setLoadingFor(null)
      }
    }
  }
  const difficulties = {
    simple: translate('auxiliary.automatic.simple', 'Simple tasks'),
    standard: translate('auxiliary.automatic.standard', 'Standard tasks'),
    complex: translate('auxiliary.automatic.complex', 'Complex tasks')
  }
  const actions = {
    'keep-primary': translate('auxiliary.automatic.primary', 'Primary agent'),
    generate: translate('auxiliary.automatic.textAnswer', 'Auxiliary answer'),
    worker: translate('auxiliary.automatic.worker', 'Supervised worker')
  }
  return (
    <Card>
      <CardContent>
        <div className="space-y-3">
          <h3 className="text-sm font-medium">
            {translate('auxiliary.automatic.preview', 'Preview automatic routing')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auxiliary.automatic.previewDescription',
              'Uses saved settings and the active workspace to show the task, difficulty, selected model and reason.'
            )}
          </p>
          <Label htmlFor="automatic-routing-prompt">
            {translate('auxiliary.prompt', 'Task input')}
          </Label>
          <Textarea
            id="automatic-routing-prompt"
            disabled={running}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <Button disabled={running || !worktreeId || !prompt.trim()} onClick={() => void run()}>
            {running
              ? translate('auxiliary.automatic.classifying', 'Classifying…')
              : translate('auxiliary.automatic.previewRun', 'Inspect routing')}
          </Button>
          {routing && !routing.enabled ? (
            <p className="text-sm">
              {translate(
                'auxiliary.automatic.disabled',
                'Save and enable automatic task routing before previewing.'
              )}
            </p>
          ) : null}
          {route ? (
            <div className="space-y-1">
              <p className="text-sm">
                {task ? translate(`auxiliary.tasks.${task.id}.title`, task.title) : ''} ·{' '}
                {difficulties[route.decision.difficulty]} · {actions[route.action]}
              </p>
              <p className="text-sm">
                {getAgentCatalog().find((agent) => agent.id === route.agentId)?.label ??
                  actions['keep-primary']}
                {route.modelId ? ` · ${route.modelId}` : ''}
              </p>
              <p className="text-sm text-muted-foreground">{route.reason}</p>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
