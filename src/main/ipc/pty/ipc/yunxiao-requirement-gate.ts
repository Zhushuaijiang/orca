import type { Store } from '../../../persistence'
import type { IPtyProvider } from '../../../providers/types'
import { inspectPtyProviderProcess } from '../../../providers/pty-process-inspection'
import {
  applyYunxiaoRequirementPromptGateToTerminalInput,
  containsYunxiaoRequirementReference,
  createManualYunxiaoRequirementGate
} from '../../../../shared/yunxiao-requirement-prompt-gate'
import {
  ensureDfHisWorkflowPackCurrentForYunxiaoText,
  isYunxiaoRequirementAgentCommand
} from '../../../dfhis-environment/workflow-pack-refresh'
import {
  hasRecordedPtyLaunchAgent,
  isKnownTuiAgentForegroundProcess
} from '../provider/launch-agent-state'

function getYunxiaoRequirementSpawnText(
  command: string | null | undefined,
  env: Record<string, string> | null | undefined
): string {
  const values = env ? Object.values(env).filter(Boolean) : []
  return [command ?? '', ...values].filter(Boolean).join('\n')
}

// Why: every spawn mentioning a Yunxiao requirement must refresh the workflow
// skill pack first, refuse direct agent-command launches, and seed the manual
// prompt gate the renderer will evaluate against.
// Why sync-undefined when inactive: spawn.ts must not await an extra microtask on the
// common path — pane-race and hidden-at-spawn tests depend on pre-reservation timing.
export function applyYunxiaoRequirementSpawnGate(
  store: Store | undefined,
  args: {
    command?: string | null
    env?: Record<string, string> | null
    worktreeId?: string
  }
): Promise<void> | undefined {
  const yunxiaoRequirementSpawnText = getYunxiaoRequirementSpawnText(args.command, args.env)
  const hasYunxiaoRequirementSpawnText =
    yunxiaoRequirementSpawnText.length > 0 &&
    containsYunxiaoRequirementReference(yunxiaoRequirementSpawnText)
  if (!hasYunxiaoRequirementSpawnText) {
    if (isYunxiaoRequirementAgentCommand(args.command)) {
      return Promise.reject(new Error('yunxiao_requirement_agent_command_requires_prompt_gate'))
    }
    return undefined
  }
  return (async () => {
    await ensureDfHisWorkflowPackCurrentForYunxiaoText(yunxiaoRequirementSpawnText)
    if (isYunxiaoRequirementAgentCommand(args.command)) {
      throw new Error('yunxiao_requirement_agent_command_requires_prompt_gate')
    }
    if (store && args.worktreeId) {
      const existing = store.getWorktreeMeta(args.worktreeId)?.yunxiaoRequirementGate ?? null
      const gate = createManualYunxiaoRequirementGate(yunxiaoRequirementSpawnText, existing)
      if (gate) {
        store.setWorktreeMeta(args.worktreeId, { yunxiaoRequirementGate: gate })
      }
    }
  })()
}

export function withDfHisWorkflowPackRefreshForInput(
  data: string,
  write: () => boolean | Promise<boolean>
): boolean | Promise<boolean> {
  if (!containsYunxiaoRequirementReference(data)) {
    return write()
  }
  return ensureDfHisWorkflowPackCurrentForYunxiaoText(data)
    .then(write)
    .catch(() => false)
}

async function shouldGateYunxiaoRequirementPtyWrite(
  ptyId: string,
  ptyOwnership: Map<string, string | null>,
  tryGetProviderForPty: (id: string) => IPtyProvider | undefined
): Promise<boolean> {
  if (hasRecordedPtyLaunchAgent(ptyId)) {
    return true
  }
  const provider = ptyOwnership.has(ptyId) ? tryGetProviderForPty(ptyId) : undefined
  if (!provider) {
    return false
  }
  try {
    const inspection = await inspectPtyProviderProcess(provider, ptyId)
    return isKnownTuiAgentForegroundProcess(inspection.foregroundProcess)
  } catch {
    return false
  }
}

// Why: prompts typed into a TUI agent pane must pass the manual gate even when
// the terminal was not spawned through the Yunxiao launcher.
export async function applyYunxiaoRequirementGateForPtyWrite<
  T extends { id: string; data: string }
>(
  args: T,
  ptyOwnership: Map<string, string | null>,
  tryGetProviderForPty: (id: string) => IPtyProvider | undefined
): Promise<T> {
  if (!(await shouldGateYunxiaoRequirementPtyWrite(args.id, ptyOwnership, tryGetProviderForPty))) {
    return args
  }
  const data = applyYunxiaoRequirementPromptGateToTerminalInput(args.data)
  return data === args.data ? args : { ...args, data }
}
