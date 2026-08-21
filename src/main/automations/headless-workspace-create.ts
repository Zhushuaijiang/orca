import type { Automation, AutomationRun } from '../../shared/automations-types'
import type { AgentLaunchPreferences } from '../../shared/agent-session-host-authority'
import { buildAutomationWorkspaceProvenance } from '../../shared/automation-workspace-provenance'
import type { Repo } from '../../shared/repo-types'
import { tokenizeStartupCommand } from '../../shared/tui-agent-startup-shell'
import {
  readCodexTopLevelModel,
  readCodexTopLevelModelProvider
} from '../codex/codex-model-provider-config'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'

type HeadlessAutomationRunForWorkspace = Pick<AutomationRun, 'id' | 'title' | 'scheduledFor'>
type RuntimeCreateManagedWorktreeArgs = Parameters<OrcaRuntimeService['createManagedWorktree']>[0]

export const YUNXIAO_OPENAI_SOL_LAUNCH_PREFERENCES = {
  model: 'gpt-5.6-terra',
  effort: 'medium'
} as const satisfies AgentLaunchPreferences

export function resolveHeadlessAutomationLaunchPreferences(
  automation: Pick<Automation, 'agentId' | 'yunxiaoTodoPool'>,
  codex?: { agentArgs?: string | null; config?: string | null }
): AgentLaunchPreferences | undefined {
  if (automation.agentId !== 'codex' || automation.yunxiaoTodoPool?.kind !== 'yunxiao-todo-pool') {
    return undefined
  }

  const tokens = codex?.agentArgs?.trim()
    ? tokenizeStartupCommand(codex.agentArgs.trim(), 'posix')
    : null
  if (tokens && !tokens.ok) {
    return undefined
  }
  const argv = tokens?.tokens ?? []
  const config = codex?.config ?? ''
  const model = readCodexArgValue(argv, ['-m', '--model']) ?? readCodexTopLevelModel(config)
  const provider =
    readCodexConfigOverride(argv, 'model_provider') ??
    readCodexTopLevelModelProvider(config) ??
    'openai'

  // Why: Kimi, GLM and other OpenAI-compatible providers may accept Codex's
  // transport but not its model_reasoning_effort setting. Only downgrade a
  // model/provider pair whose semantics Orca knows; preserve everything else.
  return provider.toLowerCase() === 'openai' && model?.toLowerCase() === 'gpt-5.6-sol'
    ? YUNXIAO_OPENAI_SOL_LAUNCH_PREFERENCES
    : undefined
}

function readCodexArgValue(tokens: readonly string[], aliases: readonly string[]): string | null {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '--') {
      break
    }
    if (aliases.includes(token)) {
      return tokens[index + 1] ?? null
    }
    for (const alias of aliases) {
      if (token.startsWith(`${alias}=`)) {
        return token.slice(alias.length + 1)
      }
      if (alias.length === 2 && token.startsWith(alias) && token.length > alias.length) {
        return token.slice(alias.length)
      }
    }
  }
  return null
}

function readCodexConfigOverride(tokens: readonly string[], key: string): string | null {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '--') {
      break
    }
    const value =
      token === '-c' || token === '--config'
        ? tokens[index + 1]
        : token.startsWith('-c=')
          ? token.slice(3)
          : token.startsWith('-c')
            ? token.slice(2)
            : token.startsWith('--config=')
              ? token.slice('--config='.length)
              : undefined
    if (value?.startsWith(`${key}=`)) {
      return value.slice(key.length + 1).replace(/^['"]|['"]$/g, '')
    }
    if (token === '-c' || token === '--config') {
      index += 1
    }
  }
  return null
}

export function buildHeadlessAutomationWorkspaceName(
  runTitle: string,
  scheduledFor: number
): string {
  // Why: generated workspace names must stay deterministic and short enough for
  // cross-provider branch/path displays while still carrying the run timestamp.
  const slug = runTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  const stamp = new Date(scheduledFor).toISOString().replace(/[-:]/g, '').slice(0, 13)
  return `auto-${slug || 'run'}-${stamp}`
}

export function buildHeadlessAutomationWorktreeCreateArgs({
  automation,
  run,
  repo,
  launchPreferences,
  createdAt = Date.now()
}: {
  automation: Automation
  run: HeadlessAutomationRunForWorkspace
  repo: Repo
  launchPreferences?: AgentLaunchPreferences
  createdAt?: number
}): RuntimeCreateManagedWorktreeArgs {
  return {
    repoSelector: repo.id,
    name: buildHeadlessAutomationWorkspaceName(run.title, run.scheduledFor),
    baseBranch: automation.baseBranch ?? undefined,
    setupDecision: automation.setupDecision ?? 'skip',
    activate: false,
    createdWithAgent: automation.agentId,
    startupAgent: automation.agentId,
    startupPrompt: automation.prompt,
    startupLaunchPreferences: launchPreferences,
    telemetrySource: 'unknown',
    automationProvenance: buildAutomationWorkspaceProvenance(automation, run, repo, createdAt)
  }
}
