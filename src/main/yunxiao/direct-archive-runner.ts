import { spawn } from 'node:child_process'
import path from 'node:path'
import { app } from 'electron'
import { readDfHisEnvironmentConfigSync } from '../dfhis-environment/config'

const DIRECT_ARCHIVE_SCRIPT_RELATIVE_PATH = path.join(
  'dfhis',
  'yunxiao-requirement-archiver',
  'scripts',
  'run_direct_archive.py'
)

export type DirectArchivePayload = {
  ok?: boolean
  work_item_id?: string
  message?: string
  error?: string
}

function getDirectArchiveScriptPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, DIRECT_ARCHIVE_SCRIPT_RELATIVE_PATH)
    : path.join(process.cwd(), 'resources', DIRECT_ARCHIVE_SCRIPT_RELATIVE_PATH)
}

function pythonCommandCandidates(): readonly { command: string; args: readonly string[] }[] {
  return process.platform === 'win32'
    ? [
        { command: 'py', args: ['-3'] },
        { command: 'python', args: [] }
      ]
    : [
        { command: 'python3', args: [] },
        { command: 'python', args: [] }
      ]
}

function runPythonJson(
  candidate: { command: string; args: readonly string[] },
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number
): Promise<DirectArchivePayload> {
  return new Promise((resolve, reject) => {
    const child = spawn(candidate.command, [...candidate.args, ...args], {
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
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
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `Python exited with ${code}`))
        return
      }
      try {
        resolve(JSON.parse(stdout) as DirectArchivePayload)
      } catch (error) {
        reject(error)
      }
    })
  })
}

export async function runDirectYunxiaoArchive(target: string): Promise<DirectArchivePayload> {
  const config = readDfHisEnvironmentConfigSync()
  const scriptPath = getDirectArchiveScriptPath()
  const env = {
    ...process.env,
    YUNXIAO_ACCESS_TOKEN: process.env.YUNXIAO_ACCESS_TOKEN || config.yunxiaoAccessToken,
    YUNXIAO_MCP_URL: process.env.YUNXIAO_MCP_URL || config.yunxiaoMcpUrl,
    YUNXIAO_ARCHIVE_WORKSPACE: process.env.YUNXIAO_ARCHIVE_WORKSPACE || config.archiveWorkspacePath
  }
  const args = [scriptPath, target, '--json']
  let lastError: Error | null = null
  for (const candidate of pythonCommandCandidates()) {
    try {
      return await runPythonJson(candidate, args, env, 1_800_000)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }
  throw lastError ?? new Error('No Python 3 command is available.')
}
