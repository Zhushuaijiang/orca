import type {
  AuxiliaryModelRoute,
  AuxiliaryTaskId,
  AuxiliaryGenerationResult
} from './auxiliary-model-types'
import type { TuiAgent } from './tui-agent'

export const TASK_DIFFICULTIES = ['simple', 'standard', 'complex'] as const
export type TaskDifficulty = (typeof TASK_DIFFICULTIES)[number]

export type AutomaticTaskRoutingSettings = {
  enabled: boolean
  keepComplexInPrimary?: boolean
  tiers?: Partial<Record<TaskDifficulty, AuxiliaryModelRoute>>
}

export type AutomaticTaskDecision = {
  task: AuxiliaryTaskId
  difficulty: TaskDifficulty
  reason: string
  confidence: number
  mode?: 'analysis' | 'change'
  keepPrimary?: boolean
}

export type AutomaticTaskRoute = {
  decision: AutomaticTaskDecision
  action: 'keep-primary' | 'generate' | 'worker'
  agentId?: TuiAgent
  modelId?: string
  thinkingLevel?: string
  fallbackToDefault?: boolean
  reason: string
}

export type AutomaticRoutingResult = {
  enabled: boolean
  route?: AutomaticTaskRoute
  historyId?: string
  error?: string
}

export type AutomaticTaskExecutionResult = {
  routing: AutomaticRoutingResult
  result?: AuxiliaryGenerationResult
}

export function isTaskDifficulty(value: string): value is TaskDifficulty {
  return TASK_DIFFICULTIES.some((difficulty) => difficulty === value)
}
