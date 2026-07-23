import { execFile, spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { ipcMain } from 'electron'
import type {
  YgtEnvironmentConfigInput,
  YgtEnvironmentCheckResult,
  YgtEnvironmentInstallResult,
  YgtEnvironmentPrerequisiteResult
} from '../../shared/ygt-environment-types'
import { getHisMcpConnection, getOfficialYunxiaoConnection } from '../yunxiao/mcp-connections'
import {
  readYgtEnvironmentConfigSync,
  saveYgtEnvironmentConfig,
  snapshotYgtEnvironmentConfig,
  type YgtEnvironmentConfig
} from '../ygt-environment/config'

const YGT_SKILL_RELATIVE_PATH = path.join('.codex', 'skills', 'ygt', 'SKILL.md')
const YUNXIAO_TOKEN_COMMAND = 'export YUNXIAO_ACCESS_TOKEN=...'
const HIS_MCP_TOKEN_COMMAND = 'export HIS_MCP_TOKEN=...'

const YGT_SKILL_TEMPLATE = `---
name: ygt
description: Use when the user starts a request with /ygt, says to use the YGT harness, or asks to handle YGT platform bugs, requirements, layout issues, Jenkins rollout, smoke checks, or multi-project df-ygt work.
---

# YGT Workflow

Route YGT requests through the df-ygt-main harness before implementation.

1. Find the workspace containing \`df-ygt-main/scripts/harness/ygt-workflow.mjs\`.
2. Run \`node df-ygt-main/scripts/harness/ygt-workflow.mjs\` with the requested action.
3. Read required environment values from the local shell only. Never write secrets to a repository.
4. Verify the changed project with the closest available smoke check or targeted test.
`

type CommandResult = {
  ok: boolean
  stdout: string
  stderr: string
  errorMessage?: string
}

function runCommand(command: string, args: readonly string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(command, [...args], { timeout: 8000 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout),
        stderr: String(stderr),
        errorMessage: error instanceof Error ? error.message : undefined
      })
    })
  })
}

function runCommandWithInput(
  command: string,
  args: readonly string[],
  input: string
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
    }, 15_000)
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, stdout, stderr, errorMessage: error.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        ok: code === 0,
        stdout,
        stderr,
        errorMessage: code === null ? 'Command timed out' : undefined
      })
    })
    child.stdin.end(`${input}\n`)
  })
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function getYgtSkillPath(homeDirectory = homedir()): string {
  return path.join(homeDirectory, YGT_SKILL_RELATIVE_PATH)
}

export async function checkYgtSkillPrerequisite(
  homeDirectory = homedir()
): Promise<YgtEnvironmentPrerequisiteResult> {
  const skillPath = getYgtSkillPath(homeDirectory)
  if (await pathExists(skillPath)) {
    return {
      id: 'ygt-skill',
      label: 'YGT skill',
      status: 'ok',
      summary: 'Installed',
      detail: skillPath,
      fixable: true
    }
  }
  return {
    id: 'ygt-skill',
    label: 'YGT skill',
    status: 'missing',
    summary: 'Missing from this Codex home',
    detail: skillPath,
    fixable: true
  }
}

export async function ensureYgtSkillInstalled(homeDirectory = homedir()): Promise<string> {
  const skillPath = getYgtSkillPath(homeDirectory)
  if (await pathExists(skillPath)) {
    const existingContent = await readFile(skillPath, 'utf8').catch(() => '')
    if (existingContent.trim().length > 0) {
      return `YGT skill already exists at ${skillPath}.`
    }
  }
  await mkdir(path.dirname(skillPath), { recursive: true })
  await writeFile(skillPath, YGT_SKILL_TEMPLATE, 'utf8')
  return `Installed YGT skill at ${skillPath}.`
}

export function checkYunxiaoMcpPrerequisite(): YgtEnvironmentPrerequisiteResult {
  const connection = getOfficialYunxiaoConnection()
  if (!connection) {
    return {
      id: 'yunxiao-mcp',
      label: 'Yunxiao MCP',
      status: 'missing',
      summary: 'YUNXIAO_ACCESS_TOKEN is not set',
      detail: 'Paste the Yunxiao access token above, then click Save & install.',
      command: YUNXIAO_TOKEN_COMMAND,
      fixable: true
    }
  }
  return {
    id: 'yunxiao-mcp',
    label: 'Yunxiao MCP',
    status: 'ok',
    summary: 'Token configured',
    detail: connection.url,
    fixable: false
  }
}

export function checkHisMcpPrerequisite(): YgtEnvironmentPrerequisiteResult {
  const connection = getHisMcpConnection()
  if (!connection.bearerToken && !connection.hasQueryToken) {
    return {
      id: 'his-mcp',
      label: 'HIS MCP',
      status: 'missing',
      summary: 'HIS MCP token is not set',
      detail: 'Paste the HIS MCP token above, then click Save & install.',
      command: HIS_MCP_TOKEN_COMMAND,
      fixable: true
    }
  }
  return {
    id: 'his-mcp',
    label: 'HIS MCP',
    status: 'ok',
    summary: 'Credentials configured',
    detail: connection.url,
    fixable: false
  }
}

async function checkGitLabPrerequisite(): Promise<YgtEnvironmentPrerequisiteResult> {
  const config = readYgtEnvironmentConfigSync()
  const version = await runCommand('glab', ['--version'])
  if (!version.ok) {
    return {
      id: 'gitlab',
      label: 'GitLab access',
      status: 'missing',
      summary: 'glab is not installed',
      detail: 'Install GitLab CLI, then authenticate with the team GitLab host.',
      command: `brew install glab && glab auth login --hostname ${config.gitlabHost}`,
      fixable: true
    }
  }

  const auth = await runCommand('glab', ['auth', 'status', '--hostname', config.gitlabHost])
  if (!auth.ok) {
    return {
      id: 'gitlab',
      label: 'GitLab access',
      status: 'invalid',
      summary: config.gitlabAccessToken
        ? 'Saved token has not been installed into glab'
        : 'glab is installed but not authenticated',
      detail: auth.stderr.trim() || auth.stdout.trim() || auth.errorMessage,
      command: `glab auth login --hostname ${config.gitlabHost} --stdin`,
      fixable: true
    }
  }

  return {
    id: 'gitlab',
    label: 'GitLab access',
    status: 'ok',
    summary: 'glab is authenticated',
    detail: auth.stdout.trim() || auth.stderr.trim(),
    fixable: false
  }
}

export async function checkYgtEnvironment(): Promise<YgtEnvironmentCheckResult> {
  const [gitlab, ygtSkill] = await Promise.all([
    checkGitLabPrerequisite(),
    checkYgtSkillPrerequisite()
  ])
  return {
    checkedAt: new Date().toISOString(),
    prerequisites: [gitlab, checkYunxiaoMcpPrerequisite(), checkHisMcpPrerequisite(), ygtSkill],
    config: snapshotYgtEnvironmentConfig()
  }
}

async function installGitLabAccess(config: YgtEnvironmentConfig): Promise<string> {
  const version = await runCommand('glab', ['--version'])
  if (!version.ok) {
    return 'GitLab CLI is not installed. Install glab first, then run Save & install again.'
  }
  if (!config.gitlabAccessToken) {
    return 'GitLab access token is not saved yet.'
  }
  const auth = await runCommandWithInput(
    'glab',
    ['auth', 'login', '--hostname', config.gitlabHost, '--stdin'],
    config.gitlabAccessToken
  )
  if (!auth.ok) {
    return `GitLab auth failed: ${auth.stderr.trim() || auth.stdout.trim() || auth.errorMessage || 'Unknown error'}`
  }
  return `GitLab access installed for ${config.gitlabHost}.`
}

export async function installYgtEnvironment(
  configInput?: YgtEnvironmentConfigInput
): Promise<YgtEnvironmentInstallResult> {
  const config = configInput
    ? await saveYgtEnvironmentConfig(configInput)
    : readYgtEnvironmentConfigSync()
  const messages = [
    configInput
      ? 'Saved YGT environment configuration.'
      : 'Using saved YGT environment configuration.',
    await installGitLabAccess(config),
    await ensureYgtSkillInstalled()
  ]
  return {
    installed: messages.every(
      (message) => !message.includes('failed') && !message.includes('not installed')
    ),
    messages,
    check: await checkYgtEnvironment()
  }
}

export function registerYgtEnvironmentHandlers(): void {
  ipcMain.handle('ygtEnvironment:getConfig', () => snapshotYgtEnvironmentConfig())

  ipcMain.handle('ygtEnvironment:check', async (): Promise<YgtEnvironmentCheckResult> => {
    return checkYgtEnvironment()
  })

  ipcMain.handle(
    'ygtEnvironment:install',
    async (
      _event,
      configInput?: YgtEnvironmentConfigInput
    ): Promise<YgtEnvironmentInstallResult> => {
      return installYgtEnvironment(configInput)
    }
  )
}
