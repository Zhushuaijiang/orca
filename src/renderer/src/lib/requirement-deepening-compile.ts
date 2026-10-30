import { translate } from '@/i18n/i18n'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/worktree-runtime-owner'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'
import { captureRuntimeEnvironmentRequestRevision } from '@/runtime/runtime-environment-revision'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { useAppStore } from '@/store'
import {
  getAuxiliaryBaselineAgentSpec,
  resolveAuxiliaryGenerationParams
} from '../../../shared/auxiliary-generation-routing'
import type { AuxiliaryGenerationResult } from '../../../shared/auxiliary-model-types'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import {
  buildRequirementDeepeningPrompt,
  parseRequirementDeepeningOutput,
  type RequirementDeepeningBrief
} from '../../../shared/requirement-deepening'

export type RequirementDeepeningCompileResult =
  | { ok: true; brief: RequirementDeepeningBrief }
  | { ok: false; error: string }

/**
 * One deepening pass through the configured auxiliary model. Shared by the single-item
 * dialog and the batch dialog so the routing, timeout, and output contract stay identical.
 */
export async function requestRequirementDeepening(args: {
  settings: GlobalSettings
  hostKey: string
  worktreeId: string | null
  title?: string
  body: string
}): Promise<RequirementDeepeningCompileResult> {
  const body = args.body.trim()
  if (!body) {
    return {
      ok: false,
      error: translate('requirementDeepening.emptyBody', '先填写需求正文。')
    }
  }
  if (!args.worktreeId) {
    return {
      ok: false,
      error: translate(
        'requirementDeepening.noWorkspace',
        '深化需要在一个已打开的工作区里调用辅助模型。'
      )
    }
  }
  try {
    const spec = getAuxiliaryBaselineAgentSpec(args.settings, 'requirementDeepening')
    if (!spec) {
      throw new Error(
        translate('requirementDeepening.noAgent', '先在设置里选择一个可用的辅助智能体。')
      )
    }
    const resolved = resolveAuxiliaryGenerationParams(
      args.settings,
      'requirementDeepening',
      { agentId: spec.id, model: spec.defaultModelId },
      args.hostKey
    )
    if (!resolved.ok) {
      throw new Error(resolved.error)
    }
    const owner = runtimeEnvironmentIdOrLocalUnlessTwin(useAppStore.getState(), args.worktreeId)
    const target = runtimeTargetForOwnerEnvironment(owner)
    const result = await callRuntimeRpc<AuxiliaryGenerationResult>(
      target,
      'auxiliary.generate',
      {
        worktree: toRuntimeWorktreeSelector(args.worktreeId),
        task: 'requirementDeepening',
        prompt: buildRequirementDeepeningPrompt({ title: args.title, body }),
        resolvedParams: resolved.params
      },
      {
        timeoutMs: 180_000,
        expectedEnvironmentPairingRevision:
          target.kind === 'environment'
            ? captureRuntimeEnvironmentRequestRevision(target.environmentId)
            : undefined
      }
    )
    if (!result.success) {
      throw new Error(result.error)
    }
    const parsed = parseRequirementDeepeningOutput(result.rawOutput)
    if (!parsed.brief.rewritten) {
      throw new Error(
        translate('requirementDeepening.missingRewrite', '模型没有返回重写稿，换一个辅助模型重试。')
      )
    }
    return { ok: true, brief: parsed.brief }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
