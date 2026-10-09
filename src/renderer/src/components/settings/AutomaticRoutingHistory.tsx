import { useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { captureRuntimeEnvironmentRequestRevision } from '@/runtime/runtime-environment-revision'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { useAppStore } from '../../store'
import { AUXILIARY_TASKS } from '../../../../shared/auxiliary-model-types'
import type { AutomaticTaskDecision } from '../../../../shared/automatic-task-routing-types'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'

type RoutingRecord = {
  id: string
  createdAt: string
  action: string
  agentId?: string
  modelId?: string
  reason: string
  error?: string
  decision?: AutomaticTaskDecision
}

export function AutomaticRoutingHistory(): React.JSX.Element {
  const worktreeId = useAppStore((state) => state.activeWorktreeId)
  const [result, setResult] = useState<{ worktree: string; records: RoutingRecord[] } | null>(null)
  const records = result?.worktree === worktreeId ? result.records : []
  const [loadingFor, setLoadingFor] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ worktree: string; message: string } | null>(null)
  const loading = loadingFor === worktreeId && loadingFor !== null
  const error = failure?.worktree === worktreeId ? failure.message : ''
  const request = useRef(0)
  const refresh = async () => {
    if (!worktreeId) {
      return
    }
    const generation = ++request.current
    setLoadingFor(worktreeId)
    setFailure(null)
    const owner = getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), worktreeId)
    if (owner === undefined) {
      setFailure({
        worktree: worktreeId,
        message: translate(
          'auxiliary.automatic.unknownHost',
          'The workspace execution host is unknown.'
        )
      })
      setLoadingFor(null)
      return
    }
    const target = getActiveRuntimeTarget({ activeRuntimeEnvironmentId: owner })
    try {
      const records = await callRuntimeRpc<RoutingRecord[]>(
        target,
        'auxiliary.history',
        { worktree: toRuntimeWorktreeSelector(worktreeId) },
        {
          expectedEnvironmentPairingRevision:
            target.kind === 'environment'
              ? captureRuntimeEnvironmentRequestRevision(target.environmentId)
              : undefined
        }
      )
      if (
        generation === request.current &&
        useAppStore.getState().activeWorktreeId === worktreeId
      ) {
        setResult({ worktree: worktreeId, records })
      }
    } catch (failure) {
      if (generation === request.current) {
        setFailure({
          worktree: worktreeId,
          message: failure instanceof Error ? failure.message : String(failure)
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
  return (
    <Card>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              {translate('auxiliary.automatic.history', 'Automatic routing history')}
            </h3>
            <Button
              variant="ghost"
              disabled={loading || !worktreeId}
              onClick={() => void refresh()}
            >
              {loading
                ? translate('auxiliary.automatic.loading', 'Loading…')
                : translate('auxiliary.automatic.refresh', 'Refresh')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auxiliary.automatic.historyDescription',
              'Recent decisions for the active workspace. Worker progress and results remain in Orca orchestration.'
            )}
          </p>
          {records.map((record) => {
            const task = AUXILIARY_TASKS.find((task) => task.id === record.decision?.task)
            const agent = getAgentCatalog().find((agent) => agent.id === record.agentId)
            return (
              <div key={record.id} className="space-y-1 border-t pt-3">
                <p className="text-sm">
                  {agent?.label ?? translate('auxiliary.automatic.primary', 'Primary agent')}
                  {record.modelId ? ` · ${record.modelId}` : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {task && record.decision
                    ? `${translate(`auxiliary.tasks.${task.id}.title`, task.title)} · ${difficulties[record.decision.difficulty]} · `
                    : ''}
                  {new Date(record.createdAt).toLocaleString()}
                </p>
                <p className="text-sm">{record.reason}</p>
                {record.error ? <p className="text-sm text-destructive">{record.error}</p> : null}
              </div>
            )
          })}
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
