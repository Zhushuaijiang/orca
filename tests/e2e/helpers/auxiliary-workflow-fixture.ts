import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test as base } from './orca-app'
import { buildFakeAgentCommandOverride } from './fake-agent-command-override'
import type { AuxiliaryModelSettings } from '../../../src/shared/auxiliary-model-types'

const stage = mkdtempSync(path.join(os.tmpdir(), 'orca-auxiliary-workflow-'))
export const ledgerPath = path.join(stage, 'ledger.jsonl')
export const cliEntry = path.join(process.cwd(), 'out', 'cli', 'index.js')
export const commands: Record<string, string> = {}
for (const agent of ['claude', 'codex']) {
  const file = path.join(stage, process.platform === 'win32' ? `${agent}.cmd` : agent)
  const source = path.join(process.cwd(), 'tests', 'e2e', 'helpers', 'auxiliary-workflow-agent.cjs')
  if (process.platform === 'win32') {
    copyFileSync(source, path.join(stage, `${agent}.cjs`))
    writeFileSync(file, `@echo off\r\nnode "%~dp0${agent}.cjs" %*\r\n`)
  } else {
    writeFileSync(file, `#!/usr/bin/env node\n${readFileSync(source, 'utf8')}`)
    chmodSync(file, 0o755)
  }
  commands[agent] = buildFakeAgentCommandOverride(file)
}

export const test = base.extend({
  launchEnv: {
    NODE_ENV: process.env.NODE_ENV ?? 'test',
    PATH: `${stage}${path.delimiter}${process.env.PATH ?? ''}`,
    ORCA_E2E_AUXILIARY_LEDGER: ledgerPath,
    ORCA_E2E_CLI_ENTRY: cliEntry,
    ORCA_E2E_NODE_BIN: process.execPath,
    ORCA_E2E_CHILD_PROCESS_MODULE: path.join(
      process.cwd(),
      'out',
      'shared',
      'child-process',
      'run-process.js'
    )
  }
})

export const auxiliaryModels: AuxiliaryModelSettings = {
  defaults: { agentId: 'codex', modelsByHost: { local: 'gpt-6.1-sol' } },
  tasks: {
    research: { agentId: 'claude', modelsByHost: { local: 'haiku' } },
    architecture: { agentId: 'codex', modelsByHost: { local: 'gpt-6.1-sol' } },
    review: { agentId: 'codex', modelsByHost: { local: 'gpt-6.1-sol' } },
    implementation: {
      agentId: 'claude',
      modelsByHost: { local: 'sonnet' },
      thinkingByHost: { local: 'high' }
    },
    testing: {
      agentId: 'claude',
      modelsByHost: { local: 'sonnet' },
      thinkingByHost: { local: 'medium' }
    }
  }
}

export function ledger(): { event: string; task?: string; args: string[]; code?: number }[] {
  return existsSync(ledgerPath)
    ? readFileSync(ledgerPath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : []
}

test.afterAll(() => rmSync(stage, { recursive: true, force: true }))
