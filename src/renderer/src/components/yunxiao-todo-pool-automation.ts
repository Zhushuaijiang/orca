import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { useAppStore } from '@/store'
import { filterEnabledTuiAgents, isTuiAgentEnabled } from '../../../shared/tui-agent-selection'
import { buildAutomationRrule } from '../../../shared/automation-schedules'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '../../../shared/execution-host'
import {
  buildWorkspaceRunContext,
  type TaskSourceContext,
  type WorkspaceRunContext
} from '../../../shared/task-source-context'
import { projectHostSetupProjectionFromRepos } from '../../../shared/project-host-setup-projection'
import { WORKTREE_ID_SEPARATOR } from '../../../shared/worktree-id'
import type {
  Automation,
  AutomationCreateInput,
  AutomationUpdateInput
} from '../../../shared/automations-types'
import { DEFAULT_YUNXIAO_TODO_POOL_AUTOMATION_STATUSES } from '../../../shared/yunxiao-types'
import type {
  GlobalSettings,
  ProjectHostSetup,
  Repo,
  TuiAgent,
  Worktree
} from '../../../shared/types'

type TodoPoolAutomationTarget = {
  repo: Repo
  workspaceId: string
}

const TODO_POOL_AUTOMATION_PROMPT =
  'Process the next actionable Yunxiao todo pool requirement. Follow the runtime-provided claim details and use the Yunxiao requirement archiver workflow.'

function getDefaultWorktree(worktrees: readonly Worktree[]): Worktree | null {
  return worktrees.find((worktree) => worktree.isMainWorktree) ?? worktrees[0] ?? null
}

function getDefaultAgent(settings: GlobalSettings | null | undefined): TuiAgent {
  const agents = getAgentCatalog().map((agent) => agent.id)
  const enabledAgents = filterEnabledTuiAgents(agents, settings?.disabledTuiAgents)
  if (
    settings?.defaultTuiAgent &&
    settings.defaultTuiAgent !== 'blank' &&
    isTuiAgentEnabled(settings.defaultTuiAgent, settings.disabledTuiAgents)
  ) {
    return settings.defaultTuiAgent
  }
  return enabledAgents[0] ?? agents[0]
}

function buildRunContext(args: {
  repo: Repo
  projectHostSetups: readonly ProjectHostSetup[]
}): WorkspaceRunContext | null {
  const projection = projectHostSetupProjectionFromRepos([args.repo])
  const setup =
    args.projectHostSetups.find((candidate) => candidate.repoId === args.repo.id) ??
    projection.setups[0]
  if (!setup) {
    return null
  }
  return buildWorkspaceRunContext({
    projectId: setup.projectId,
    hostId: setup.hostId,
    projectHostSetupId: setup.id,
    repoId: args.repo.id,
    path: setup.path || args.repo.path
  })
}

function buildSourceContext(args: {
  repo: Repo
  runContext: WorkspaceRunContext | null
}): TaskSourceContext {
  const hostId: ExecutionHostId =
    args.runContext?.hostId ?? getRepoExecutionHostId(args.repo) ?? LOCAL_EXECUTION_HOST_ID
  return {
    kind: 'task-source',
    provider: 'yunxiao',
    projectId: 'yunxiao-todo-pool',
    hostId,
    projectHostSetupId: args.runContext?.projectHostSetupId ?? null,
    repoId: args.repo.id,
    providerIdentity: {
      provider: 'yunxiao',
      projectName: 'Todo pool'
    },
    accountLabel: null
  }
}

function findTodoPoolAutomation(automations: readonly Automation[]): Automation | null {
  return (
    automations.find((automation) => automation.yunxiaoTodoPool?.kind === 'yunxiao-todo-pool') ??
    null
  )
}

function repoLooksLikeYunxiaoArchive(repo: Repo): boolean {
  const normalizedName = repo.displayName.trim().toLowerCase()
  const normalizedPath = repo.path
    .trim()
    .replace(/[\\/]+$/g, '')
    .toLowerCase()
  const pathBasename = normalizedPath.split(/[\\/]/).findLast(Boolean) ?? ''
  return normalizedName === 'yunxiao' || pathBasename === 'yunxiao'
}

function getWorkspaceIdForRepo(repo: Repo, worktrees: readonly Worktree[]): string {
  return getDefaultWorktree(worktrees)?.id ?? `${repo.id}${WORKTREE_ID_SEPARATOR}${repo.path}`
}

function resolveTodoPoolAutomationTarget(): TodoPoolAutomationTarget | null {
  const state = useAppStore.getState()
  const worktreeMap = new Map(
    Object.values(state.worktreesByRepo)
      .flat()
      .map((worktree) => [worktree.id, worktree])
  )
  const activeWorktree = state.activeWorktreeId
    ? (worktreeMap.get(state.activeWorktreeId) ?? null)
    : null
  const activeRepo = activeWorktree
    ? (state.repos.find((repo) => repo.id === activeWorktree.repoId) ?? null)
    : null
  const archiveRepo =
    state.repos.find((repo) => repoLooksLikeYunxiaoArchive(repo)) ?? activeRepo ?? state.repos[0]
  if (!archiveRepo) {
    return null
  }
  return {
    repo: archiveRepo,
    workspaceId: getWorkspaceIdForRepo(archiveRepo, state.worktreesByRepo[archiveRepo.id] ?? [])
  }
}

function buildTodoPoolAutomationInput(target: TodoPoolAutomationTarget): AutomationCreateInput {
  const state = useAppStore.getState()
  const runContext = buildRunContext({
    repo: target.repo,
    projectHostSetups: state.projectHostSetups
  })
  const now = Date.now()
  return {
    name: translate('auto.components.TaskPage.yunxiaoTodoPoolAutomationName', 'Yunxiao todo pool'),
    prompt: TODO_POOL_AUTOMATION_PROMPT,
    precheck: null,
    yunxiaoTodoPool: {
      kind: 'yunxiao-todo-pool',
      statuses: [...DEFAULT_YUNXIAO_TODO_POOL_AUTOMATION_STATUSES],
      batchSize: 1
    },
    agentId: getDefaultAgent(state.settings),
    runContext,
    sourceContext: buildSourceContext({ repo: target.repo, runContext }),
    projectId: target.repo.id,
    workspaceMode: 'existing',
    workspaceId: target.workspaceId,
    baseBranch: null,
    setupDecision: undefined,
    reuseSession: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    rrule: buildAutomationRrule({ preset: 'hourly', hour: 0, minute: 15 }),
    dtstart: now,
    enabled: true,
    missedRunGraceMinutes: 30
  }
}

export function useYunxiaoTodoPoolAutomation(args: { onTodoPoolChanged: () => void }): {
  configureTodoPoolAutomation: () => Promise<Automation | null>
  runNextTodoPoolAutomation: () => Promise<void>
  configuringTodoPoolAutomation: boolean
  runningTodoPoolAutomation: boolean
} {
  const { onTodoPoolChanged } = args
  const [configuringTodoPoolAutomation, setConfiguringTodoPoolAutomation] = useState(false)
  const [runningTodoPoolAutomation, setRunningTodoPoolAutomation] = useState(false)

  const configureTodoPoolAutomation = useCallback(async (): Promise<Automation | null> => {
    const target = resolveTodoPoolAutomationTarget()
    if (!target) {
      toast.error(
        translate(
          'auto.components.TaskPage.yunxiaoTodoPoolAutomationNoTarget',
          'Choose a workspace before configuring the Yunxiao todo pool automation.'
        )
      )
      return null
    }
    setConfiguringTodoPoolAutomation(true)
    try {
      const input = buildTodoPoolAutomationInput(target)
      const updates: AutomationUpdateInput = input
      const existing = findTodoPoolAutomation(await window.api.automations.list())
      const automation = existing
        ? await window.api.automations.update({
            id: existing.id,
            updates
          })
        : await window.api.automations.create(input)
      toast.success(
        translate(
          'auto.components.TaskPage.yunxiaoTodoPoolAutomationConfigured',
          'Yunxiao todo pool automation configured. Use Run next to start the next item.'
        )
      )
      return automation
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      return null
    } finally {
      setConfiguringTodoPoolAutomation(false)
    }
  }, [])

  const runNextTodoPoolAutomation = useCallback(async (): Promise<void> => {
    setRunningTodoPoolAutomation(true)
    try {
      const automation = await configureTodoPoolAutomation()
      if (!automation) {
        return
      }
      await window.api.automations.runNow({ id: automation.id })
      onTodoPoolChanged()
      toast.success(
        translate(
          'auto.components.TaskPage.yunxiaoTodoPoolAutomationRunStarted',
          'Yunxiao todo pool automation run started.'
        )
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setRunningTodoPoolAutomation(false)
    }
  }, [configureTodoPoolAutomation, onTodoPoolChanged])

  return {
    configureTodoPoolAutomation,
    runNextTodoPoolAutomation,
    configuringTodoPoolAutomation,
    runningTodoPoolAutomation
  }
}
