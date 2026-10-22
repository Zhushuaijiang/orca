import type { CommitMessageModel, ThinkingLevel } from './commit-message-agent-spec'

export function buildCopilotCommitMessageModels(
  openAiThinkingLevels: ThinkingLevel[]
): CommitMessageModel[] {
  return [
    { id: 'auto', label: 'Auto' },
    {
      id: 'claude-haiku-4.5',
      label: 'Claude Haiku 4.5'
    },
    {
      id: 'claude-sonnet-4.5',
      label: 'Claude Sonnet 4.5'
    },
    {
      id: 'claude-sonnet-4.6',
      label: 'Claude Sonnet 4.6'
    },
    {
      id: 'claude-opus-4.5',
      label: 'Claude Opus 4.5'
    },
    {
      id: 'claude-opus-4.6',
      label: 'Claude Opus 4.6'
    },
    {
      id: 'claude-opus-4.6-fast',
      label: 'Claude Opus 4.6 Fast'
    },
    {
      id: 'claude-opus-4.7',
      label: 'Claude Opus 4.7'
    },
    {
      id: 'gpt-4.1',
      label: 'GPT-4.1'
    },
    {
      id: 'gpt-5-mini',
      label: 'GPT-5 Mini',
      thinkingLevels: openAiThinkingLevels,
      defaultThinkingLevel: 'low'
    },
    {
      id: 'gpt-5.2',
      label: 'GPT-5.2',
      thinkingLevels: openAiThinkingLevels,
      defaultThinkingLevel: 'low'
    },
    {
      id: 'gpt-5.2-codex',
      label: 'GPT-5.2 Codex',
      thinkingLevels: openAiThinkingLevels,
      defaultThinkingLevel: 'low'
    },
    {
      id: 'gpt-5.3-codex',
      label: 'GPT-5.3 Codex',
      thinkingLevels: openAiThinkingLevels,
      defaultThinkingLevel: 'low'
    },
    {
      id: 'gpt-5.4',
      label: 'GPT-5.4',
      thinkingLevels: openAiThinkingLevels,
      defaultThinkingLevel: 'low'
    },
    {
      id: 'gpt-5.4-mini',
      label: 'GPT-5.4 Mini',
      thinkingLevels: openAiThinkingLevels,
      defaultThinkingLevel: 'low'
    },
    {
      id: 'gpt-5.5',
      label: 'GPT-5.5',
      thinkingLevels: openAiThinkingLevels,
      defaultThinkingLevel: 'low'
    }
  ]
}
