import { execFile, spawn } from 'node:child_process'
import type { DfHisEnvironmentPrerequisiteResult } from '../../shared/dfhis-environment-types'

export type DfHisCliTool = 'git' | 'python' | 'glab'

export type DfHisCommandResult = {
  ok: boolean
  stdout: string
  stderr: string
  errorMessage?: string
}

type DfHisCliAvailability = {
  available: boolean
  command?: string
  detail?: string
}

type DfHisCliInstallPlan = {
  command: string
  args: readonly string[]
  displayCommand: string
}

const DFHIS_CLI_INSTALL_TIMEOUT_MS = 10 * 60 * 1000
const MACOS_BREW_CANDIDATES = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew', 'brew'] as const

const CLI_TOOL_LABELS: Record<DfHisCliTool, string> = {
  git: 'Git',
  python: 'Python',
  glab: 'GitLab CLI'
}

export function runDfHisCommand(
  command: string,
  args: readonly string[],
  timeoutMs = 8000
): Promise<DfHisCommandResult> {
  return new Promise((resolve) => {
    execFile(command, [...args], { timeout: timeoutMs }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout),
        stderr: String(stderr),
        errorMessage: error instanceof Error ? error.message : undefined
      })
    })
  })
}

export function runDfHisCommandWithInput(
  command: string,
  args: readonly string[],
  input: string,
  timeoutMs = 15_000
): Promise<DfHisCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
    }, timeoutMs)
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

export function getDfHisCliInstallCommand(
  tool: DfHisCliTool,
  platform: NodeJS.Platform = process.platform
): string {
  if (platform === 'darwin') {
    return tool === 'python' ? 'brew install python' : `brew install ${tool}`
  }
  if (platform === 'win32') {
    if (tool === 'git') {
      return 'winget install --silent --accept-source-agreements --accept-package-agreements -e --id Git.Git'
    }
    if (tool === 'python') {
      return 'winget install --silent --accept-source-agreements --accept-package-agreements -e --id Python.Python.3.12'
    }
    return 'winget install --silent --accept-source-agreements --accept-package-agreements -e --id GLab.GLab'
  }
  if (tool === 'git') {
    return 'sudo apt-get install -y git'
  }
  if (tool === 'python') {
    return 'sudo apt-get install -y python3'
  }
  return 'See https://docs.gitlab.com/cli/ for your Linux distribution.'
}

function commandDetail(result: DfHisCommandResult): string | undefined {
  return result.stdout.trim() || result.stderr.trim() || result.errorMessage
}

async function commandAvailable(
  command: string,
  args: readonly string[] = ['--version']
): Promise<boolean> {
  return (await runDfHisCommand(command, args, 4000)).ok
}

async function firstAvailableCommand(
  candidates: readonly string[],
  args: readonly string[] = ['--version']
): Promise<string | null> {
  for (const candidate of candidates) {
    if (await commandAvailable(candidate, args)) {
      return candidate
    }
  }
  return null
}

function wingetPackageId(tool: DfHisCliTool): string {
  if (tool === 'git') {
    return 'Git.Git'
  }
  if (tool === 'python') {
    return 'Python.Python.3.12'
  }
  return 'GLab.GLab'
}

async function resolveDfHisCliInstallPlan(tool: DfHisCliTool): Promise<DfHisCliInstallPlan | null> {
  if (process.platform === 'win32') {
    if (!(await commandAvailable('winget'))) {
      return null
    }
    return {
      command: 'winget',
      args: [
        'install',
        '--silent',
        '--accept-source-agreements',
        '--accept-package-agreements',
        '-e',
        '--id',
        wingetPackageId(tool)
      ],
      displayCommand: getDfHisCliInstallCommand(tool)
    }
  }

  const brew = await firstAvailableCommand(MACOS_BREW_CANDIDATES)
  if (brew) {
    const packageName = tool === 'python' ? 'python' : tool
    return {
      command: brew,
      args: ['install', packageName],
      displayCommand: getDfHisCliInstallCommand(tool, 'darwin')
    }
  }

  if (process.platform !== 'darwin' && tool !== 'glab' && (await commandAvailable('apt-get'))) {
    const packageName = tool === 'python' ? 'python3' : tool
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      return {
        command: 'apt-get',
        args: ['install', '-y', packageName],
        displayCommand: `apt-get install -y ${packageName}`
      }
    }
    if (await commandAvailable('sudo', ['-n', 'true'])) {
      return {
        command: 'sudo',
        args: ['-n', 'apt-get', 'install', '-y', packageName],
        displayCommand: `sudo -n apt-get install -y ${packageName}`
      }
    }
  }

  return null
}

async function checkDfHisCliAvailability(tool: DfHisCliTool): Promise<DfHisCliAvailability> {
  if (tool === 'git') {
    const result = await runDfHisCommand('git', ['--version'])
    return { available: result.ok, command: 'git', detail: commandDetail(result) }
  }
  if (tool === 'glab') {
    const result = await runDfHisCommand('glab', ['--version'])
    return { available: result.ok, command: 'glab', detail: commandDetail(result) }
  }

  const candidates: readonly [string, readonly string[]][] =
    process.platform === 'win32'
      ? [
          ['py', ['-3', '--version']],
          ['python', ['--version']]
        ]
      : [
          ['python3', ['--version']],
          ['python', ['--version']]
        ]
  const results = await Promise.all(
    candidates.map(async ([command, args]) => ({
      command,
      result: await runDfHisCommand(command, args)
    }))
  )
  const available = results.find(({ result }) => result.ok)
  if (available) {
    return {
      available: true,
      command: available.command,
      detail: commandDetail(available.result)
    }
  }
  return {
    available: false,
    detail: results.map(({ command, result }) => `${command}: ${commandDetail(result)}`).join('\n')
  }
}

export async function ensureDfHisCliToolInstalled(tool: DfHisCliTool): Promise<string> {
  const label = CLI_TOOL_LABELS[tool]
  const before = await checkDfHisCliAvailability(tool)
  if (before.available) {
    return `${label} already available${before.detail ? `: ${before.detail}` : '.'}`
  }

  const plan = await resolveDfHisCliInstallPlan(tool)
  if (!plan) {
    return `${label} auto-install failed: no supported silent package manager was found. Install manually with ${getDfHisCliInstallCommand(tool)}.`
  }

  const install = await runDfHisCommand(plan.command, plan.args, DFHIS_CLI_INSTALL_TIMEOUT_MS)
  if (!install.ok) {
    return `${label} auto-install failed with ${plan.displayCommand}: ${commandDetail(install) ?? 'unknown error'}`
  }

  const after = await checkDfHisCliAvailability(tool)
  if (!after.available) {
    return `${label} auto-install failed: ${plan.displayCommand} completed, but ${label} is still not installed.${after.detail ? ` ${after.detail}` : ''}`
  }
  return `${label} installed with ${plan.displayCommand}.`
}

export async function ensureDfHisCliPrerequisitesInstalled(): Promise<string[]> {
  const messages: string[] = []
  for (const tool of ['git', 'python', 'glab'] as const) {
    messages.push(await ensureDfHisCliToolInstalled(tool))
  }
  return messages
}

export async function checkGitPrerequisite(): Promise<DfHisEnvironmentPrerequisiteResult> {
  const result = await checkDfHisCliAvailability('git')
  if (!result.available) {
    return {
      id: 'git',
      label: 'Git',
      status: 'missing',
      summary: 'Git is not installed',
      detail: result.detail,
      command: getDfHisCliInstallCommand('git'),
      fixable: true
    }
  }
  return {
    id: 'git',
    label: 'Git',
    status: 'ok',
    summary: 'Git is available',
    detail: result.detail,
    fixable: false
  }
}

export async function checkPythonPrerequisite(): Promise<DfHisEnvironmentPrerequisiteResult> {
  const result = await checkDfHisCliAvailability('python')
  if (result.available) {
    return {
      id: 'python',
      label: 'Python',
      status: 'ok',
      summary: `${result.command ?? 'python'} is available for DFHIS workflow scripts`,
      detail: result.detail,
      fixable: false
    }
  }
  return {
    id: 'python',
    label: 'Python',
    status: 'missing',
    summary: 'Python 3 is not installed',
    detail: result.detail,
    command: getDfHisCliInstallCommand('python'),
    fixable: true
  }
}

export function getGlabInstallCommand(): string {
  return getDfHisCliInstallCommand('glab')
}
