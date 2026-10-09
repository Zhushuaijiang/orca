import { randomUUID } from 'node:crypto'
import {
  buildTaskClassificationPrompt,
  parseAutomaticTaskDecision,
  resolveAutomaticTaskRoute
} from '../../shared/automatic-task-routing'
import { normalizeAuxiliaryModelSettings } from '../../shared/auxiliary-model-settings'
import type {
  AutomaticRoutingResult,
  AutomaticTaskExecutionResult
} from '../../shared/automatic-task-routing-types'
import { getCommitMessageAgentSpec } from '../../shared/commit-message-agent-spec'
import {
  getAuxiliaryBaselineAgentSpec,
  resolveAuxiliaryGenerationParams
} from '../../shared/auxiliary-generation-routing'
import type { TuiAgent } from '../../shared/tui-agent'
import { isTuiAgent } from '../../shared/tui-agent-config'
import { AutomaticRoutingHistory } from './automatic-routing-history'
import type { RuntimeAuxiliaryGeneration } from './runtime-auxiliary-generation'
import { modelDiscoveryHostKeyForTarget } from './runtime-git-generation-context'
import { runtimeGitRouteForTarget, type RuntimeGitCommandHost } from './runtime-git-command-target'

export class RuntimeAutomaticTaskRouting {
  constructor(
    private readonly host: RuntimeGitCommandHost,
    private readonly generation: RuntimeAuxiliaryGeneration,
    private readonly history = new AutomaticRoutingHistory()
  ) {}

  async routeRuntimeAuxiliaryTask(
    worktree: string,
    prompt: string,
    primaryAgent?: TuiAgent,
    depth = 0
  ): Promise<AutomaticRoutingResult> {
    const settings = this.host.getRuntimeSettings()
    if (
      !normalizeAuxiliaryModelSettings(settings.auxiliaryModels).automatic?.enabled ||
      depth > 0
    ) {
      return { enabled: false }
    }
    const primary = primaryAgent ?? settings.defaultTuiAgent
    if (!primary || !isTuiAgent(primary)) {
      return { enabled: true, error: 'Choose a primary coding agent before automatic routing.' }
    }
    const target = await (this.host.resolveRuntimeAuxiliaryTarget?.(worktree) ??
      this.host.resolveRuntimeGitTarget(worktree))
    const id = randomUUID()
    try {
      const classification = await this.generation.generateRuntimeAuxiliaryTask(
        worktree,
        'classification',
        buildTaskClassificationPrompt(prompt),
        [],
        undefined,
        primary
      )
      if (!classification.success) {
        throw new Error(classification.error)
      }
      const decision = parseAutomaticTaskDecision(classification.rawOutput)
      const route = resolveAutomaticTaskRoute(
        this.host.getRuntimeSettings(),
        decision,
        primary,
        modelDiscoveryHostKeyForTarget(target, runtimeGitRouteForTarget(target))
      )
      await this.history.append({
        id,
        createdAt: new Date().toISOString(),
        workspace: target.worktree.path,
        executionHost: target.executionHostId,
        primaryAgent: primary,
        ...route,
        reason: route.reason
      })
      return { enabled: true, route, historyId: id }
    } catch (failure) {
      const error = (failure instanceof Error ? failure.message : String(failure)).slice(0, 2000)
      await this.history
        .append({
          id,
          createdAt: new Date().toISOString(),
          workspace: target.worktree.path,
          executionHost: target.executionHostId,
          primaryAgent: primary,
          action: 'keep-primary',
          reason: 'Routing failed; the primary agent retains the task.',
          error
        })
        .catch(() => undefined)
      return { enabled: true, error, historyId: id }
    }
  }

  async listRuntimeAuxiliaryRoutes(worktree: string) {
    const target = await (this.host.resolveRuntimeAuxiliaryTarget?.(worktree) ??
      this.host.resolveRuntimeGitTarget(worktree))
    return (await this.history.list()).filter(
      (record) =>
        record.workspace === target.worktree.path && record.executionHost === target.executionHostId
    )
  }

  async runRuntimeAuxiliaryAuto(
    worktree: string,
    prompt: string,
    primaryAgent?: TuiAgent,
    depth = 0,
    images: readonly string[] = []
  ): Promise<AutomaticTaskExecutionResult> {
    const routing = await this.routeRuntimeAuxiliaryTask(worktree, prompt, primaryAgent, depth)
    const selected = routing.route
    if (selected?.action !== 'generate' || !selected.agentId) {
      return { routing }
    }
    const spec = getCommitMessageAgentSpec(selected.agentId)
    if (!spec) {
      return {
        routing,
        result: {
          success: false,
          error:
            'The selected agent cannot execute headless auxiliary requests. Keep this task in the primary agent.'
        }
      }
    }
    const target = await (this.host.resolveRuntimeAuxiliaryTarget?.(worktree) ??
      this.host.resolveRuntimeGitTarget(worktree))
    const hostKey = modelDiscoveryHostKeyForTarget(target, runtimeGitRouteForTarget(target))
    const saved = this.host.getRuntimeSettings()
    const originalSpec =
      getAuxiliaryBaselineAgentSpec(saved, selected.decision.task, primaryAgent) ?? spec
    const original = resolveAuxiliaryGenerationParams(
      saved,
      selected.decision.task,
      { agentId: originalSpec.id, model: originalSpec.defaultModelId },
      hostKey,
      primaryAgent
    )
    const settings = {
      ...saved,
      auxiliaryModels: {
        tasks: {
          [selected.decision.task]: {
            agentId: selected.agentId,
            modelsByHost: selected.modelId ? { [hostKey]: selected.modelId } : undefined,
            thinkingByHost: selected.thinkingLevel
              ? { [hostKey]: selected.thinkingLevel }
              : undefined,
            fallbackToDefault: selected.fallbackToDefault && original.ok
          }
        }
      }
    }
    const resolved = resolveAuxiliaryGenerationParams(
      settings,
      selected.decision.task,
      original.ok ? original.params : { agentId: spec.id, model: spec.defaultModelId },
      hostKey,
      primaryAgent
    )
    if (!resolved.ok) {
      return { routing, result: { success: false, error: resolved.error } }
    }
    const result = await this.generation.generateRuntimeAuxiliaryTask(
      worktree,
      selected.decision.task,
      prompt,
      images,
      resolved.params,
      primaryAgent
    )
    return { routing, result }
  }
}
