import type { TuiAgentConfig } from './tui-agent-config-types'

/** Authoring form: `launchCmd` and `expectedProcess` default to `detectCmd`. */
type TuiAgentConfigSource = Omit<TuiAgentConfig, 'launchCmd' | 'expectedProcess'> & {
  launchCmd?: string
  expectedProcess?: string
}

// Why a separate module: fork-only CodeBuddy registration kept the shared
// tui-agent-config.ts over its max-lines budget once upstream added its own
// harnesses; keeping the fork's entry here avoids re-tripping the limit.
export const CODEBUDDY_TUI_AGENT_CONFIG: TuiAgentConfigSource = {
  detectCmd: 'codebuddy',
  // Why: the @tencent-ai/codebuddy-code package also installs a `cbc` symlink.
  detectCmdAliases: ['cbc'],
  // Why: `codebuddy [prompt]` takes the task as a positional argv, same as Claude/Trae.
  promptInjectionMode: 'argv',
  // Why: separator so prompts starting with `-…` aren't parsed as CLI flags.
  argvPromptSeparator: '--'
}
