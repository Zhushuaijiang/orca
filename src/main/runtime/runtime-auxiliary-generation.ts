import { CANCELED_AUXILIARY_RESULT } from '../text-generation/auxiliary-generation-fallback'
import {
  getCommitMessageAgentSpec,
  resolveCommitMessageAgentChoice
} from '../../shared/commit-message-agent-spec'
import { resolveAuxiliaryGenerationParams } from '../../shared/auxiliary-generation-routing'
import { AUXILIARY_TASKS, type AuxiliaryTaskId } from '../../shared/auxiliary-model-types'
import { planCommitMessageGeneration } from '../../shared/commit-message-plan'
import {
  attachAuxiliaryImages,
  buildAuxiliaryTaskPrompt
} from '../../shared/auxiliary-task-prompts'
import type { ResolvedSourceControlAiGenerationParams } from '../../shared/source-control-ai'
import type { TuiAgent } from '../../shared/tui-agent'
import { cancelLocalGeneration } from '../text-generation/source-control-generation-lanes'
import { prepareLocalCommitMessageAgentEnv } from '../text-generation/commit-message-agent-environment'
import { spawnSourceControlAgent } from '../text-generation/source-control-agent-launch'
import {
  commandBackslashMode,
  executeGenerationPlan
} from '../text-generation/source-control-text-generation-requests'
import {
  modelDiscoveryHostKeyForTarget,
  localAgentRuntimeTargetForTarget,
  localTextGenerationTargetForTarget
} from './runtime-git-generation-context'
import {
  runtimeGitRouteForTarget,
  type RuntimeGitCommandHost,
  type RuntimeGitTarget
} from './runtime-git-command-target'

export class RuntimeAuxiliaryGeneration {
  private readonly pending = new Map<string, AbortController>()
  constructor(private readonly host: RuntimeGitCommandHost) {}

  async generateRuntimeAuxiliaryTask(
    worktree: string,
    task: AuxiliaryTaskId,
    inputPrompt: string,
    images: readonly string[] = [],
    override?: ResolvedSourceControlAiGenerationParams,
    primaryAgent?: TuiAgent
  ) {
    const definition = AUXILIARY_TASKS.find((entry) => entry.id === task)
    if (definition?.kind !== 'text') {
      return {
        success: false as const,
        error: 'This task uses its existing workflow instead of text generation.'
      }
    }
    if (!inputPrompt.trim()) {
      return { success: false as const, error: 'The task prompt is empty.' }
    }
    if (images.length && task !== 'vision') {
      return { success: false as const, error: 'Image attachments belong to vision requests.' }
    }
    const target = await (this.host.resolveRuntimeAuxiliaryTarget?.(worktree) ??
      this.host.resolveRuntimeGitTarget(worktree))
    const key = `${target.executionHostId}:${task}:${target.worktree.path}`
    if (this.pending.has(key)) {
      return {
        success: false as const,
        error: 'This auxiliary task is already running in this workspace.'
      }
    }
    const controller = new AbortController()
    this.pending.set(key, controller)
    try {
      return await this.generateAtTarget(
        target,
        task,
        inputPrompt,
        images,
        override,
        controller.signal,
        primaryAgent
      )
    } finally {
      if (this.pending.get(key) === controller) {
        this.pending.delete(key)
      }
    }
  }

  private async generateAtTarget(
    target: RuntimeGitTarget,
    task: AuxiliaryTaskId,
    inputPrompt: string,
    images: readonly string[],
    override: ResolvedSourceControlAiGenerationParams | undefined,
    signal: AbortSignal,
    primaryAgent?: TuiAgent
  ) {
    const route = runtimeGitRouteForTarget(target)
    const settings = this.host.getRuntimeSettings()
    const agent = resolveCommitMessageAgentChoice(
      null,
      primaryAgent ?? settings.defaultTuiAgent,
      settings.disabledTuiAgents
    )
    const spec = agent && agent !== 'custom' ? getCommitMessageAgentSpec(agent) : undefined
    if (!spec) {
      return { success: false as const, error: 'Choose a supported default auxiliary agent.' }
    }
    const resolved = override
      ? { ok: true as const, params: override }
      : resolveAuxiliaryGenerationParams(
          settings,
          task,
          {
            agentId: spec.id,
            model: spec.defaultModelId,
            agentCommandOverride: settings.agentCmdOverrides?.[spec.id]
          },
          modelDiscoveryHostKeyForTarget(target, route),
          primaryAgent
        )
    if (!resolved.ok) {
      return { success: false as const, error: resolved.error }
    }
    const params = attachAuxiliaryImages(override ?? resolved.params, images)
    const prompt = buildAuxiliaryTaskPrompt(task, inputPrompt, images)
    if (route.kind === 'ssh' && !route.provider) {
      return { success: false as const, error: 'ssh_git_provider_unavailable' }
    }
    const env =
      route.kind === 'local'
        ? await prepareLocalCommitMessageAgentEnv(
            params.agentId,
            this.host.getCommitMessageAgentEnvironment?.(),
            localAgentRuntimeTargetForTarget(target)
          )
        : undefined
    if (env && !env.ok) {
      return { success: false as const, error: env.error }
    }
    if (signal.aborted) {
      return CANCELED_AUXILIARY_RESULT
    }
    const generationTarget =
      route.kind === 'ssh' && route.provider
        ? {
            kind: 'remote' as const,
            cwd: target.worktree.path,
            execute: route.provider.executeCommitMessagePlan.bind(route.provider),
            missingBinaryLocation: 'remote PATH'
          }
        : localTextGenerationTargetForTarget(target, env?.ok ? env.env : undefined, this.host)
    const planned = planCommitMessageGeneration(
      { ...params, backslash: commandBackslashMode(generationTarget) },
      prompt
    )
    if (!planned.ok) {
      return { success: false as const, error: planned.error }
    }
    let requestedParams = params
    let attempts = 0
    const result = await executeGenerationPlan({
      onRouteSelected: (selected) => {
        requestedParams = selected
        attempts += 1
      },
      signal,
      params,
      prompt,
      plan: planned.plan,
      target: generationTarget,
      emptyResultName: 'auxiliary answer',
      operation: `auxiliary:${task}`,
      spawnAgent: spawnSourceControlAgent
    })
    return result.success
      ? {
          ...result,
          agentId: requestedParams.agentId,
          modelId: requestedParams.model,
          fallbackUsed: attempts > 1
        }
      : result
  }

  async cancelRuntimeAuxiliaryTask(worktree: string, task: AuxiliaryTaskId): Promise<{ ok: true }> {
    const target = await (this.host.resolveRuntimeAuxiliaryTarget?.(worktree) ??
      this.host.resolveRuntimeGitTarget(worktree))
    this.pending.get(`${target.executionHostId}:${task}:${target.worktree.path}`)?.abort()
    const route = runtimeGitRouteForTarget(target)
    if (route.kind === 'ssh') {
      await route.provider?.cancelGenerateCommitMessage(target.worktree.path, `auxiliary:${task}`)
    } else {
      cancelLocalGeneration(`auxiliary:${task}`, target.worktree.path)
    }
    return { ok: true }
  }
}
