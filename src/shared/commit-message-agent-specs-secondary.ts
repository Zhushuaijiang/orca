import type { TuiAgent } from './tui-agent'
import type {
  CommitMessageModel,
  CommitMessageAgentSpec,
  ThinkingLevel
} from './commit-message-agent-spec'

type SecondaryAgentSpecDeps = {
  BASIC_THINKING_LEVELS: ThinkingLevel[]
  OPENAI_THINKING_LEVELS: ThinkingLevel[]
  CLAUDE_THINKING_LEVELS: ThinkingLevel[]
  parseCursorModels: (stdout: string) => CommitMessageModel[]
  parseAntigravityModels: (stdout: string) => CommitMessageModel[]
}

// Why: CodeBuddy documents its supported --model ids in `codebuddy --help`
// (frontier models first, matching the help order). There is no list subcommand.
const CODEBUDDY_MODEL_CATALOG: readonly { id: string; label: string }[] = [
  { id: 'hy4-preview', label: 'Hunyuan 4 Preview' },
  { id: 'hy4-preview-x', label: 'Hunyuan 4 Preview X' },
  { id: 'hy3', label: 'Hunyuan 3' },
  { id: 'hy3-x', label: 'Hunyuan 3 X' },
  { id: 'glm-5.3', label: 'GLM 5.3' },
  { id: 'glm-5.3-flash', label: 'GLM 5.3 Flash' },
  { id: 'glm-5.2', label: 'GLM 5.2' },
  { id: 'glm-5.1', label: 'GLM 5.1' },
  { id: 'glm-5v-turbo', label: 'GLM 5V Turbo' },
  { id: 'minimax-m3', label: 'MiniMax M3' },
  { id: 'minimax-m2.7', label: 'MiniMax M2.7' },
  { id: 'kimi-k3-1', label: 'Kimi K3.1' },
  { id: 'kimi-k2.7', label: 'Kimi K2.7' },
  { id: 'kimi-k2.6', label: 'Kimi K2.6' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' }
]

export function buildSecondaryCommitMessageAgentSpecs({
  BASIC_THINKING_LEVELS,
  OPENAI_THINKING_LEVELS,
  CLAUDE_THINKING_LEVELS,
  parseCursorModels,
  parseAntigravityModels
}: SecondaryAgentSpecDeps): Partial<Record<TuiAgent, CommitMessageAgentSpec>> {
  return {
    amp: {
      id: 'amp',
      label: 'Amp',
      binary: 'amp',
      promptDelivery: 'stdin',
      buildArgs: ({ model, thinkingLevel }) => [
        '--execute',
        '--no-notifications',
        '--no-ide',
        '--no-jetbrains',
        '--mode',
        model,
        ...(thinkingLevel ? ['--effort', thinkingLevel] : [])
      ],
      // Amp selects the model with `--mode`, not `--model`.
      singletonOptions: [['--mode']],
      modelSource: 'static',
      models: [
        { id: 'smart', label: 'Smart' },
        { id: 'rush', label: 'Rush' },
        {
          id: 'large',
          label: 'Large',
          thinkingLevels: BASIC_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        },
        {
          id: 'deep',
          label: 'Deep',
          thinkingLevels: BASIC_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        }
      ],
      defaultModelId: 'smart'
    },
    cursor: {
      id: 'cursor',
      label: 'Cursor',
      binary: 'cursor-agent',
      promptDelivery: 'argv',
      buildArgs: ({ prompt, model }) => [
        '--print',
        '--mode',
        'ask',
        '--trust',
        '--output-format',
        'text',
        '--model',
        model,
        prompt
      ],
      modelSource: 'dynamic',
      modelDiscovery: { binary: 'cursor-agent', args: ['--list-models'], parse: parseCursorModels },
      models: [{ id: 'auto', label: 'Auto' }],
      defaultModelId: 'auto'
    },
    kimi: {
      id: 'kimi',
      label: 'Kimi',
      binary: 'kimi',
      // Why: kimi-code accepts the generation prompt only via --prompt/-p (Claude's
      // --print is rejected). Deliver on argv so --prompt receives the text (#11669).
      promptDelivery: 'argv',
      buildArgs: ({ prompt, model, thinkingLevel }) => [
        '--prompt',
        prompt,
        '--quiet',
        ...(model && model !== 'default' ? ['--model', model] : []),
        ...(thinkingLevel === 'on'
          ? ['--thinking']
          : thinkingLevel === 'off'
            ? ['--no-thinking']
            : [])
      ],
      modelSource: 'static',
      models: [
        { id: 'default', label: 'Config default' },
        {
          // Why: Kimi resolves its managed model by provider/model; bare model
          // names are rejected by the CLI with "LLM not set".
          id: 'kimi-code/kimi-for-coding',
          label: 'Kimi K2.6',
          thinkingLevels: [
            { id: 'on', label: 'On' },
            { id: 'off', label: 'Off' }
          ],
          defaultThinkingLevel: 'on'
        }
      ],
      defaultModelId: 'default'
    },
    codebuddy: {
      id: 'codebuddy',
      label: 'CodeBuddy',
      binary: 'codebuddy',
      // Why: CodeBuddy's -p/--print is a boolean flag (Claude-shaped) and reads
      // the prompt from stdin when no positional prompt is given — verified live
      // with `echo <prompt> | codebuddy -p --output-format text`. Stdin keeps
      // large staged diffs off argv, same rationale as the Claude spec.
      promptDelivery: 'stdin',
      buildArgs: ({ model, thinkingLevel }) => [
        '-p',
        '--output-format',
        'text',
        ...(model && model !== 'default' ? ['--model', model] : []),
        '--permission-mode',
        'plan',
        ...(thinkingLevel ? ['--effort', thinkingLevel] : [])
      ],
      modelSource: 'static',
      // Why: `codebuddy --help` prints the supported --model catalog on this
      // install; --effort is a session-level flag (minimal..max) documented for
      // every model, so each entry shares the Claude-style effort levels.
      models: [
        { id: 'default', label: 'Config default' },
        ...CODEBUDDY_MODEL_CATALOG.map((model) => ({
          ...model,
          thinkingLevels: CLAUDE_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        }))
      ],
      defaultModelId: 'default'
    },
    copilot: {
      id: 'copilot',
      label: 'GitHub Copilot',
      binary: 'copilot',
      promptDelivery: 'argv',
      buildArgs: ({ prompt, model, thinkingLevel }) => [
        '--prompt',
        prompt,
        '--silent',
        '--stream',
        'off',
        '--no-custom-instructions',
        '--model',
        model,
        ...(thinkingLevel ? ['--effort', thinkingLevel] : [])
      ],
      modelSource: 'static',
      // Why: Copilot CLI's picker is policy-filtered per account/org. Keep the
      // full hosted CLI catalog here so users can select models enabled for them.
      models: [
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
          thinkingLevels: OPENAI_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        },
        {
          id: 'gpt-5.2',
          label: 'GPT-5.2',
          thinkingLevels: OPENAI_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        },
        {
          id: 'gpt-5.2-codex',
          label: 'GPT-5.2 Codex',
          thinkingLevels: OPENAI_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        },
        {
          id: 'gpt-5.3-codex',
          label: 'GPT-5.3 Codex',
          thinkingLevels: OPENAI_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        },
        {
          id: 'gpt-5.4',
          label: 'GPT-5.4',
          thinkingLevels: OPENAI_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        },
        {
          id: 'gpt-5.4-mini',
          label: 'GPT-5.4 Mini',
          thinkingLevels: OPENAI_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        },
        {
          id: 'gpt-5.5',
          label: 'GPT-5.5',
          thinkingLevels: OPENAI_THINKING_LEVELS,
          defaultThinkingLevel: 'low'
        }
      ],
      defaultModelId: 'gpt-5.4'
    },
    antigravity: {
      id: 'antigravity',
      label: 'Antigravity',
      binary: 'agy',
      promptDelivery: 'stdin',
      buildArgs: ({ model }) => ['--print', '--sandbox', '--model', model],
      modelSource: 'dynamic',
      modelDiscovery: { binary: 'agy', args: ['models'], parse: parseAntigravityModels },
      models: [
        { id: 'Gemini 3.5 Flash (Medium)', label: 'Gemini 3.5 Flash (Medium)' },
        { id: 'Gemini 3.5 Flash (High)', label: 'Gemini 3.5 Flash (High)' },
        { id: 'Gemini 3.5 Flash (Low)', label: 'Gemini 3.5 Flash (Low)' }
      ],
      defaultModelId: 'Gemini 3.5 Flash (Medium)'
    }
  }
}
