import { execFile, spawn } from 'node:child_process'
import type { DfHisEnvironmentPrerequisiteResult } from '../../shared/dfhis-environment-types'

export type DfHisCommandResult = {
  ok: boolean
  stdout: string
  stderr: string
  errorMessage?: string
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

function platformInstallCommand(tool: 'git' | 'python' | 'glab'): string {
  if (process.platform === 'darwin') {
    return tool === 'python' ? 'brew install python' : `brew install ${tool}`
  }
  if (process.platform === 'win32') {
    if (tool === 'git') {
      return 'winget install -e --id Git.Git'
    }
    if (tool === 'python') {
      return 'winget install -e --id Python.Python.3.12'
    }
    return 'winget install -e --id GLab.GLab'
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

export async function checkGitPrerequisite(): Promise<DfHisEnvironmentPrerequisiteResult> {
  const result = await runDfHisCommand('git', ['--version'])
  if (!result.ok) {
    return {
      id: 'git',
      label: 'Git',
      status: 'missing',
      summary: 'Git is not installed',
      detail: commandDetail(result),
      command: platformInstallCommand('git'),
      fixable: false
    }
  }
  return {
    id: 'git',
    label: 'Git',
    status: 'ok',
    summary: 'Git is available',
    detail: commandDetail(result),
    fixable: false
  }
}

export async function checkPythonPrerequisite(): Promise<DfHisEnvironmentPrerequisiteResult> {
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
      id: 'python',
      label: 'Python',
      status: 'ok',
      summary: `${available.command} is available for DFHIS workflow scripts`,
      detail: commandDetail(available.result),
      fixable: false
    }
  }
  return {
    id: 'python',
    label: 'Python',
    status: 'missing',
    summary: 'Python 3 is not installed',
    detail: results.map(({ command, result }) => `${command}: ${commandDetail(result)}`).join('\n'),
    command: platformInstallCommand('python'),
    fixable: false
  }
}

export function getGlabInstallCommand(): string {
  return platformInstallCommand('glab')
}
