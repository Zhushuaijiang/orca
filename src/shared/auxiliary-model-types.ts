import type { TuiAgent } from './tui-agent'

export const AUXILIARY_TASK_IDS = [
  'conversationName',
  'commitMessage',
  'pullRequest',
  'branchName',
  'fixCommitFailure',
  'fixPushFailure',
  'fixChecks',
  'resolveConflicts',
  'resolveComments',
  'vision',
  'compression',
  'skills',
  'approval',
  'mcp',
  'review',
  'voice',
  'classification',
  'decomposition',
  'configDescription',
  'skillReview',
  'skillCurator'
] as const

export type AuxiliaryTaskId = (typeof AUXILIARY_TASK_IDS)[number]

export type AuxiliaryGenerationResult =
  | {
      success: true
      rawOutput: string
      agentLabel?: string
      agentId?: TuiAgent | 'custom'
      modelId?: string
      fallbackUsed?: boolean
    }
  | { success: false; error: string; canceled?: boolean }

export type AuxiliaryModelRoute = {
  agentId?: TuiAgent
  modelsByHost?: Record<string, string>
  thinkingByHost?: Record<string, string>
  fallbackToDefault?: boolean
}

export type AuxiliaryTaskRoutes = Partial<Record<AuxiliaryTaskId, AuxiliaryModelRoute>>

export type AuxiliaryModelSettings = {
  defaults?: AuxiliaryModelRoute
  tasks?: AuxiliaryTaskRoutes
  byPrimaryAgent?: Partial<Record<TuiAgent, AuxiliaryTaskRoutes>>
}

export type AuxiliaryTaskDefinition = {
  id: AuxiliaryTaskId
  title: string
  description: string
  kind: 'text' | 'workflow' | 'guarded-review'
}

export const AUXILIARY_TASKS: readonly AuxiliaryTaskDefinition[] = [
  {
    id: 'conversationName',
    title: 'Conversation titles',
    description: 'Name new conversations.',
    kind: 'text'
  },
  {
    id: 'commitMessage',
    title: 'Commit messages',
    description: 'Describe staged changes.',
    kind: 'text'
  },
  {
    id: 'pullRequest',
    title: 'Review request descriptions',
    description: 'Generate PR and MR titles and descriptions.',
    kind: 'text'
  },
  {
    id: 'branchName',
    title: 'Branch names',
    description: 'Name branches from their tasks.',
    kind: 'text'
  },
  {
    id: 'vision',
    title: 'Vision',
    description: 'Analyze supplied images in an auxiliary request.',
    kind: 'text'
  },
  {
    id: 'compression',
    title: 'Compression',
    description:
      'Summarize supplied context. Agent-internal compaction remains managed by the agent.',
    kind: 'text'
  },
  {
    id: 'skills',
    title: 'Skill search',
    description: 'Select relevant skills from supplied candidates.',
    kind: 'text'
  },
  {
    id: 'approval',
    title: 'Approval analysis',
    description: 'Assess a proposed action. Existing permission checks still apply.',
    kind: 'text'
  },
  {
    id: 'mcp',
    title: 'MCP tool selection',
    description:
      'Recommend tools from supplied definitions. The caller decides which tool to execute.',
    kind: 'text'
  },
  { id: 'review', title: 'Code review', description: 'Review supplied changes.', kind: 'text' },
  {
    id: 'voice',
    title: 'Voice responses',
    description: 'Draft concise responses from supplied speech text.',
    kind: 'text'
  },
  {
    id: 'classification',
    title: 'Task classification',
    description: 'Classify tasks and clarify their requirements.',
    kind: 'text'
  },
  {
    id: 'decomposition',
    title: 'Task decomposition',
    description: 'Break a task into actionable steps.',
    kind: 'text'
  },
  {
    id: 'configDescription',
    title: 'Configuration descriptions',
    description: 'Describe supplied configuration.',
    kind: 'text'
  },
  {
    id: 'skillReview',
    title: 'Skill and memory review',
    description: 'Review completed sessions inside the existing write guard.',
    kind: 'guarded-review'
  },
  {
    id: 'skillCurator',
    title: 'Skill and memory maintenance',
    description: 'Periodically organize reusable lessons inside the existing write guard.',
    kind: 'guarded-review'
  },
  {
    id: 'fixCommitFailure',
    title: 'Commit failure fixes',
    description: 'Start an agent to fix failed commits.',
    kind: 'workflow'
  },
  {
    id: 'fixPushFailure',
    title: 'Push failure fixes',
    description: 'Start an agent to fix failed pushes.',
    kind: 'workflow'
  },
  {
    id: 'fixChecks',
    title: 'CI failure fixes',
    description: 'Start an agent to fix failed checks.',
    kind: 'workflow'
  },
  {
    id: 'resolveConflicts',
    title: 'Conflict resolution',
    description: 'Start an agent to resolve merge conflicts.',
    kind: 'workflow'
  },
  {
    id: 'resolveComments',
    title: 'Review comment resolution',
    description: 'Start an agent to address review comments.',
    kind: 'workflow'
  }
]

export function isAuxiliaryTaskId(value: string): value is AuxiliaryTaskId {
  return AUXILIARY_TASK_IDS.some((task) => task === value)
}
