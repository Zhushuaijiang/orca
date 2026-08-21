import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Automation } from '../../shared/automations-types'
import type { Repo } from '../../shared/repo-types'
import {
  buildHeadlessAutomationWorktreeCreateArgs,
  resolveHeadlessAutomationLaunchPreferences
} from './headless-workspace-create'

const repoPath = path.join('tmp', 'orca')

const repo: Repo = {
  id: 'repo-1',
  path: repoPath,
  displayName: 'orca',
  badgeColor: '#000',
  addedAt: 1,
  kind: 'git',
  executionHostId: 'ssh:ssh-target-1'
}

const automation: Automation = {
  id: 'automation-1',
  name: 'Nightly review',
  prompt: 'Review changes',
  precheck: null,
  agentId: 'codex',
  runContext: {
    kind: 'workspace-run',
    projectId: 'project-1',
    hostId: 'ssh:ssh-target-1',
    projectHostSetupId: 'setup-1',
    repoId: 'repo-1',
    path: repoPath
  },
  sourceContext: null,
  projectId: 'legacy-repo-1',
  executionTargetType: 'ssh',
  executionTargetId: 'ssh-target-1',
  schedulerOwner: 'remote_host_service',
  workspaceMode: 'new_per_run',
  workspaceId: null,
  baseBranch: 'origin/main',
  setupDecision: 'skip',
  reuseSession: false,
  timezone: 'UTC',
  rrule: 'FREQ=DAILY',
  dtstart: 1,
  enabled: true,
  nextRunAt: 2,
  missedRunPolicy: 'run_once_within_grace',
  missedRunGraceMinutes: 720,
  createdAt: 1,
  updatedAt: 1
}

describe('headless automation workspace create args', () => {
  it('stamps automation provenance for serve-mode new-per-run workspaces', () => {
    const args = buildHeadlessAutomationWorktreeCreateArgs({
      automation,
      run: {
        id: 'run-1',
        title: 'Nightly review run',
        scheduledFor: Date.UTC(2026, 0, 2, 3, 4, 5)
      },
      repo,
      createdAt: 123
    })

    expect(args).toMatchObject({
      repoSelector: 'repo-1',
      name: 'auto-nightly-review-run-20260102T0304',
      baseBranch: 'origin/main',
      setupDecision: 'skip',
      activate: false,
      createdWithAgent: 'codex',
      startupAgent: 'codex',
      startupPrompt: 'Review changes',
      telemetrySource: 'unknown',
      automationProvenance: {
        kind: 'created-by-automation',
        automationId: 'automation-1',
        automationNameSnapshot: 'Nightly review',
        automationRunId: 'run-1',
        automationRunTitleSnapshot: 'Nightly review run',
        createdAt: 123,
        executionTargetType: 'ssh',
        executionTargetId: 'ssh-target-1',
        projectId: 'project-1',
        repoId: 'repo-1',
        hostId: 'ssh:ssh-target-1'
      }
    })
  })

  it('falls back to skip for legacy automations without a saved setup decision', () => {
    const args = buildHeadlessAutomationWorktreeCreateArgs({
      automation: { ...automation, setupDecision: undefined },
      run: {
        id: 'run-1',
        title: 'Nightly review run',
        scheduledFor: Date.UTC(2026, 0, 2, 3, 4, 5)
      },
      repo
    })

    expect(args.setupDecision).toBe('skip')
  })

  it('starts known OpenAI Sol Yunxiao todo runs on the routine-work model tier', () => {
    const launchPreferences = resolveHeadlessAutomationLaunchPreferences(
      {
        ...automation,
        yunxiaoTodoPool: { kind: 'yunxiao-todo-pool', statuses: ['queued'], batchSize: 1 }
      },
      { config: 'model = "gpt-5.6-sol"\n' }
    )
    const args = buildHeadlessAutomationWorktreeCreateArgs({
      automation: {
        ...automation,
        yunxiaoTodoPool: { kind: 'yunxiao-todo-pool', statuses: ['queued'], batchSize: 1 }
      },
      run: {
        id: 'run-1',
        title: 'DFHIS-32098',
        scheduledFor: Date.UTC(2026, 0, 2, 3, 4, 5)
      },
      launchPreferences,
      repo
    })

    expect(args.startupLaunchPreferences).toEqual({
      model: 'gpt-5.6-terra',
      effort: 'medium'
    })
  })

  it.each([
    ['native Kimi agent', 'kimi', undefined, undefined],
    ['Kimi K3 through Codex', 'codex', '--model kimi-k3', 'model = "gpt-5.6-sol"\n'],
    ['GLM-5.3 through Codex', 'codex', '-m zai/glm-5.3', 'model = "gpt-5.6-sol"\n'],
    ['custom provider', 'codex', '-m gpt-5.6-sol', 'model_provider = "custom"\n'],
    ['unknown model', 'codex', '-m future-model', ''],
    ['unresolved default', 'codex', undefined, '']
  ])('preserves %s model settings', (_label, agentId, agentArgs, config) => {
    expect(
      resolveHeadlessAutomationLaunchPreferences(
        {
          ...automation,
          agentId: agentId as Automation['agentId'],
          yunxiaoTodoPool: { kind: 'yunxiao-todo-pool', statuses: ['queued'], batchSize: 1 }
        },
        { agentArgs, config }
      )
    ).toBeUndefined()
  })

  it('honors an explicit custom provider override in Codex arguments', () => {
    expect(
      resolveHeadlessAutomationLaunchPreferences(
        {
          ...automation,
          yunxiaoTodoPool: { kind: 'yunxiao-todo-pool', statuses: ['queued'], batchSize: 1 }
        },
        {
          agentArgs: '-m gpt-5.6-sol -c model_provider=glm',
          config: 'model_provider = "openai"\n'
        }
      )
    ).toBeUndefined()
  })
})
