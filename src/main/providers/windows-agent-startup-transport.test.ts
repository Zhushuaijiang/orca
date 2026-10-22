import { describe, expect, it } from 'vitest'
import { TUI_AGENT_CONFIG, isTuiAgent } from '../../shared/tui-agent-config'
import {
  buildAgentStartupPlan,
  buildAgentDraftLaunchPlan,
  buildAgentResumeStartupPlan
} from '../../shared/tui-agent-startup'
import { RESUMABLE_TUI_AGENTS } from '../../shared/agent-session-resume'
import { buildYunxiaoReviewHandoffPrompt } from '../../shared/yunxiao-review-handoff'
import { resolveWindowsShellLaunchArgs } from './windows-shell-args'
import { buildWindowsPowerShellSpawnAttempts } from './windows-shell-fallback-chain'
import {
  buildWindowsShellStartupEnvironment,
  POWERSHELL_STARTUP_COMMAND_ENV
} from './windows-powershell-startup-command'

const agents = Object.keys(TUI_AGENT_CONFIG).filter(isTuiAgent)
for (const shell of ['powershell', 'cmd'] as const) {
  describe(`${shell} startup for every registered agent`, () => {
    it.each(RESUMABLE_TUI_AGENTS)('%s resumes without terminal command typing', (agent) => {
      const plan = buildAgentResumeStartupPlan({
        agent,
        providerSession: {
          key: agent === 'antigravity' || agent === 'cursor' ? 'conversation_id' : 'session_id',
          id: '77777777-7777-4777-8777-777777777777',
          transcriptPath: 'C:\\sessions\\saved.jsonl'
        },
        ompResumeFilePath: 'C:\\sessions\\saved.jsonl',
        cmdOverrides: {},
        platform: 'win32',
        shell
      })
      if (!plan) {
        throw new Error(`No ${agent} resume plan`)
      }
      const launch = resolveWindowsShellLaunchArgs(
        `${shell}.exe`,
        'C:\\repo',
        'C:\\home',
        undefined,
        plan.launchCommand
      )
      expect(launch.startupCommandDeliveredInShellArgs).toBe(true)
    })

    it.each(
      agents.filter(
        (agent) =>
          TUI_AGENT_CONFIG[agent].draftPromptFlag || TUI_AGENT_CONFIG[agent].draftPromptEnvVar
      )
    )('%s delivers its native draft launch without terminal command typing', (agent) => {
      const plan = buildAgentDraftLaunchPlan({
        agent,
        draft: 'review the pending changes',
        cmdOverrides: {},
        platform: 'win32',
        shell
      })
      if (!plan) {
        throw new Error(`No ${agent} draft plan`)
      }
      const launch = resolveWindowsShellLaunchArgs(
        `${shell}.exe`,
        'C:\\repo',
        'C:\\home',
        undefined,
        plan.launchCommand
      )
      expect(launch.startupCommandDeliveredInShellArgs).toBe(true)
    })
    it.each(agents)(
      '%s launches through both native and SSH providers without terminal typing',
      (agent) => {
        for (const prompt of ['', `审核任务 ${'x'.repeat(6800)}`]) {
          const plan = buildAgentStartupPlan({
            agent,
            prompt,
            cmdOverrides: {},
            platform: 'win32',
            shell,
            allowEmptyPromptLaunch: true
          })
          if (!plan) {
            throw new Error(`No ${agent} launch plan`)
          }
          const shellPath = `${shell}.exe`
          const launch = resolveWindowsShellLaunchArgs(
            shellPath,
            'C:\\repo',
            'C:\\home',
            undefined,
            plan.launchCommand
          )
          expect(launch.startupCommandDeliveredInShellArgs).toBe(true)
          const env = buildWindowsShellStartupEnvironment(plan.env ?? {}, launch.startupCommandEnv)
          if (launch.startupCommandEnv) {
            expect(env[POWERSHELL_STARTUP_COMMAND_ENV]).toBe(plan.launchCommand)
          } else if (shell === 'powershell') {
            expect(Buffer.from(launch.shellArgs[3], 'base64').toString('utf16le')).toContain(
              `\n${plan.launchCommand}`
            )
          } else {
            expect(launch.shellArgs[1]).toContain(plan.launchCommand)
          }
        }
      }
    )
  })
}

it('keeps a valid long PowerShell launch when cmd cannot hold its prompt', () => {
  const command = `codex '${'x'.repeat(12_000)}'`
  const attempts = buildWindowsPowerShellSpawnAttempts({
    shellPath: 'pwsh.exe',
    cwd: 'C:\\repo',
    defaultCwd: 'C:\\home',
    startupCommand: command,
    resolveOptions: {
      platform: 'win32',
      env: { ProgramFiles: 'C:\\Program Files', SystemRoot: 'C:\\Windows' },
      isRealExecutable: () => true
    }
  })
  expect(attempts).toHaveLength(2)
  expect(attempts.every((attempt) => attempt.startupCommandEnv === command)).toBe(true)
  expect(() =>
    resolveWindowsShellLaunchArgs('cmd.exe', 'C:\\repo', 'C:\\home', undefined, command)
  ).toThrow('Select PowerShell')
})

it('carries the Codex review handoff prompt and model through Windows startup exactly once', () => {
  const prompt = buildYunxiaoReviewHandoffPrompt({
    runTitle: 'DFHIS-32769 审核',
    implementerAgentId: 'claude',
    implementerSessionId: 'implementer-session',
    workItemIds: ['DFHIS-32769'],
    worktreePath: 'D:\\MacRestore\\workspace\\yunxiao',
    archiveDirs: ['D:\\MacRestore\\workspace\\yunxiao\\DFHIS-32769'],
    outcomesSummary: '已完成归档，等待独立审核。'.repeat(60)
  })
  const plan = buildAgentStartupPlan({
    agent: 'codex',
    prompt,
    cmdOverrides: {},
    platform: 'win32',
    shell: 'powershell',
    sessionOptions: { model: 'review-model', effort: 'high' }
  })
  if (!plan) {
    throw new Error('Missing review handoff plan')
  }
  expect(plan.launchCommand).toMatch(/^codex\s/)
  expect(plan.launchCommand).toContain('review-model')
  const launch = resolveWindowsShellLaunchArgs(
    'powershell.exe',
    'D:\\MacRestore\\workspace\\yunxiao',
    'C:\\home',
    undefined,
    plan.launchCommand
  )
  expect(launch.startupCommandDeliveredInShellArgs).toBe(true)
  const carried =
    launch.startupCommandEnv ?? Buffer.from(launch.shellArgs[3], 'base64').toString('utf16le')
  expect(carried).toContain(plan.launchCommand)
  expect(carried.split('Orca Yunxiao review handoff:')).toHaveLength(2)
})
