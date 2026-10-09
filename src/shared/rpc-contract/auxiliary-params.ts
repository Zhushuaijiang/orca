import { z } from 'zod'
import { AUXILIARY_TASK_IDS } from '../auxiliary-model-types'
import { ResolvedSourceControlAiGenerationParams } from './git-params'
import { isTuiAgent } from '../tui-agent-config'
import type { TuiAgent } from '../tui-agent'

export const AuxiliaryGenerate = z.object({
  worktree: z.string().min(1),
  task: z.enum(AUXILIARY_TASK_IDS),
  prompt: z.string().min(1).max(1_000_000),
  images: z.array(z.string().min(1).max(4096)).max(8).optional(),
  primaryAgent: z.custom<TuiAgent>(isTuiAgent).optional(),
  resolvedParams: ResolvedSourceControlAiGenerationParams.optional()
})

export const AuxiliaryCancel = AuxiliaryGenerate.pick({ worktree: true, task: true })

export const AuxiliaryRoute = AuxiliaryGenerate.pick({
  worktree: true,
  prompt: true,
  primaryAgent: true
}).extend({ depth: z.number().int().min(0).max(16).optional() })
export const AuxiliaryHistory = AuxiliaryGenerate.pick({ worktree: true })
export const AuxiliaryAuto = AuxiliaryRoute.extend({ images: AuxiliaryGenerate.shape.images })
