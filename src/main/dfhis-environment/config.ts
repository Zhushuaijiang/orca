import { existsSync, readFileSync } from 'node:fs'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import type {
  DfHisEnvironmentConfigInput,
  DfHisEnvironmentConfigSnapshot
} from '../../shared/dfhis-environment-types'

const CONFIG_FILE_NAME = 'dfhis-environment.json'
const DEFAULT_GITLAB_HOST = 'gitlab.df-mic.com'
const DEFAULT_HIS_MCP_URL = 'http://192.168.1.10:9020/mcp'
const DEFAULT_YUNXIAO_MCP_URL =
  'https://openapi-rdc.aliyuncs.com/ai/mcp?toolsets=organization-management,project-management'
const DEFAULT_ARCHIVE_WORKSPACE_PATH = path.join(homedir(), 'workspace', 'yunxiao')

export type DfHisEnvironmentConfig = {
  gitlabHost: string
  gitlabAccessToken: string
  yunxiaoAccessToken: string
  yunxiaoMcpUrl: string
  hisMcpToken: string
  hisMcpUrl: string
  hisCodeRoot: string
  archiveWorkspacePath: string
}

function userDataPath(): string {
  return process.env.ORCA_USER_DATA_PATH?.trim() || app.getPath('userData')
}

export function getDfHisEnvironmentConfigPath(userDataDirectory = userDataPath()): string {
  return path.join(userDataDirectory, CONFIG_FILE_NAME)
}

function resolveDfHisEnvironmentConfigPath(userDataDirectory: string): string | null {
  const configPath = getDfHisEnvironmentConfigPath(userDataDirectory)
  return existsSync(configPath) ? configPath : null
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanPath(value: unknown): string {
  const rawPath = cleanString(value)
  if (!rawPath) {
    return ''
  }
  if (rawPath === '~') {
    return homedir()
  }
  if (rawPath.startsWith(`~${path.sep}`) || rawPath.startsWith('~/') || rawPath.startsWith('~\\')) {
    return path.join(homedir(), rawPath.slice(2))
  }
  return path.normalize(rawPath)
}

export function normalizeDfHisEnvironmentConfig(value: unknown): DfHisEnvironmentConfig {
  const config = typeof value === 'object' && value !== null ? value : {}
  return {
    gitlabHost: cleanString((config as Record<string, unknown>).gitlabHost) || DEFAULT_GITLAB_HOST,
    gitlabAccessToken: cleanString((config as Record<string, unknown>).gitlabAccessToken),
    yunxiaoAccessToken: cleanString((config as Record<string, unknown>).yunxiaoAccessToken),
    yunxiaoMcpUrl:
      cleanString((config as Record<string, unknown>).yunxiaoMcpUrl) || DEFAULT_YUNXIAO_MCP_URL,
    hisMcpToken: cleanString((config as Record<string, unknown>).hisMcpToken),
    hisMcpUrl: cleanString((config as Record<string, unknown>).hisMcpUrl) || DEFAULT_HIS_MCP_URL,
    hisCodeRoot: cleanPath((config as Record<string, unknown>).hisCodeRoot),
    archiveWorkspacePath:
      cleanPath((config as Record<string, unknown>).archiveWorkspacePath) ||
      DEFAULT_ARCHIVE_WORKSPACE_PATH
  }
}

export function readDfHisEnvironmentConfigSync(
  userDataDirectory = userDataPath()
): DfHisEnvironmentConfig {
  const configPath = resolveDfHisEnvironmentConfigPath(userDataDirectory)
  if (!configPath) {
    return normalizeDfHisEnvironmentConfig(null)
  }
  try {
    return normalizeDfHisEnvironmentConfig(JSON.parse(readFileSync(configPath, 'utf8')))
  } catch {
    return normalizeDfHisEnvironmentConfig(null)
  }
}

function mergeConfigPatch(
  current: DfHisEnvironmentConfig,
  patch: DfHisEnvironmentConfigInput
): DfHisEnvironmentConfig {
  return normalizeDfHisEnvironmentConfig({
    gitlabHost: cleanString(patch.gitlabHost) || current.gitlabHost,
    gitlabAccessToken: cleanString(patch.gitlabAccessToken) || current.gitlabAccessToken,
    yunxiaoAccessToken: cleanString(patch.yunxiaoAccessToken) || current.yunxiaoAccessToken,
    yunxiaoMcpUrl: cleanString(patch.yunxiaoMcpUrl) || current.yunxiaoMcpUrl,
    hisMcpToken: cleanString(patch.hisMcpToken) || current.hisMcpToken,
    hisMcpUrl: cleanString(patch.hisMcpUrl) || current.hisMcpUrl,
    hisCodeRoot: cleanPath(patch.hisCodeRoot) || current.hisCodeRoot,
    archiveWorkspacePath: cleanPath(patch.archiveWorkspacePath) || current.archiveWorkspacePath
  })
}

export async function saveDfHisEnvironmentConfig(
  patch: DfHisEnvironmentConfigInput,
  userDataDirectory = userDataPath()
): Promise<DfHisEnvironmentConfig> {
  const next = mergeConfigPatch(readDfHisEnvironmentConfigSync(userDataDirectory), patch)
  const configPath = getDfHisEnvironmentConfigPath(userDataDirectory)
  await mkdir(path.dirname(configPath), { recursive: true })
  await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  })
  await chmod(configPath, 0o600)
  return next
}

export function snapshotDfHisEnvironmentConfig(
  config = readDfHisEnvironmentConfigSync()
): DfHisEnvironmentConfigSnapshot {
  return {
    gitlabHost: config.gitlabHost,
    gitlabAccessToken: config.gitlabAccessToken,
    hasGitlabAccessToken: config.gitlabAccessToken.length > 0,
    yunxiaoMcpUrl: config.yunxiaoMcpUrl,
    yunxiaoAccessToken: config.yunxiaoAccessToken,
    hasYunxiaoAccessToken: config.yunxiaoAccessToken.length > 0,
    hisMcpUrl: config.hisMcpUrl,
    hisMcpToken: config.hisMcpToken,
    hasHisMcpToken: config.hisMcpToken.length > 0,
    hisCodeRoot: config.hisCodeRoot,
    archiveWorkspacePath: config.archiveWorkspacePath
  }
}
