import { existsSync, readFileSync } from 'node:fs'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import type {
  YgtEnvironmentConfigInput,
  YgtEnvironmentConfigSnapshot
} from '../../shared/ygt-environment-types'

const CONFIG_FILE_NAME = 'ygt-environment.json'
const DEFAULT_GITLAB_HOST = 'gitlab.df-mic.com'
const DEFAULT_HIS_MCP_URL = 'http://192.168.1.10:9020/mcp'
const DEFAULT_YUNXIAO_MCP_URL =
  'https://openapi-rdc.aliyuncs.com/ai/mcp?toolsets=organization-management,project-management'

export type YgtEnvironmentConfig = {
  gitlabHost: string
  gitlabAccessToken: string
  yunxiaoAccessToken: string
  yunxiaoMcpUrl: string
  hisMcpToken: string
  hisMcpUrl: string
}

function userDataPath(): string {
  return process.env.ORCA_USER_DATA_PATH?.trim() || app.getPath('userData')
}

export function getYgtEnvironmentConfigPath(userDataDirectory = userDataPath()): string {
  return path.join(userDataDirectory, CONFIG_FILE_NAME)
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeYgtEnvironmentConfig(value: unknown): YgtEnvironmentConfig {
  const config = typeof value === 'object' && value !== null ? value : {}
  return {
    gitlabHost: cleanString((config as Record<string, unknown>).gitlabHost) || DEFAULT_GITLAB_HOST,
    gitlabAccessToken: cleanString((config as Record<string, unknown>).gitlabAccessToken),
    yunxiaoAccessToken: cleanString((config as Record<string, unknown>).yunxiaoAccessToken),
    yunxiaoMcpUrl:
      cleanString((config as Record<string, unknown>).yunxiaoMcpUrl) || DEFAULT_YUNXIAO_MCP_URL,
    hisMcpToken: cleanString((config as Record<string, unknown>).hisMcpToken),
    hisMcpUrl: cleanString((config as Record<string, unknown>).hisMcpUrl) || DEFAULT_HIS_MCP_URL
  }
}

export function readYgtEnvironmentConfigSync(
  userDataDirectory = userDataPath()
): YgtEnvironmentConfig {
  const configPath = getYgtEnvironmentConfigPath(userDataDirectory)
  if (!existsSync(configPath)) {
    return normalizeYgtEnvironmentConfig(null)
  }
  try {
    return normalizeYgtEnvironmentConfig(JSON.parse(readFileSync(configPath, 'utf8')))
  } catch {
    return normalizeYgtEnvironmentConfig(null)
  }
}

function mergeConfigPatch(
  current: YgtEnvironmentConfig,
  patch: YgtEnvironmentConfigInput
): YgtEnvironmentConfig {
  return normalizeYgtEnvironmentConfig({
    gitlabHost: cleanString(patch.gitlabHost) || current.gitlabHost,
    gitlabAccessToken: cleanString(patch.gitlabAccessToken) || current.gitlabAccessToken,
    yunxiaoAccessToken: cleanString(patch.yunxiaoAccessToken) || current.yunxiaoAccessToken,
    yunxiaoMcpUrl: cleanString(patch.yunxiaoMcpUrl) || current.yunxiaoMcpUrl,
    hisMcpToken: cleanString(patch.hisMcpToken) || current.hisMcpToken,
    hisMcpUrl: cleanString(patch.hisMcpUrl) || current.hisMcpUrl
  })
}

export async function saveYgtEnvironmentConfig(
  patch: YgtEnvironmentConfigInput,
  userDataDirectory = userDataPath()
): Promise<YgtEnvironmentConfig> {
  const next = mergeConfigPatch(readYgtEnvironmentConfigSync(userDataDirectory), patch)
  const configPath = getYgtEnvironmentConfigPath(userDataDirectory)
  await mkdir(path.dirname(configPath), { recursive: true })
  await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  })
  await chmod(configPath, 0o600)
  return next
}

export function snapshotYgtEnvironmentConfig(
  config = readYgtEnvironmentConfigSync()
): YgtEnvironmentConfigSnapshot {
  return {
    gitlabHost: config.gitlabHost,
    hasGitlabAccessToken: config.gitlabAccessToken.length > 0,
    yunxiaoMcpUrl: config.yunxiaoMcpUrl,
    hasYunxiaoAccessToken: config.yunxiaoAccessToken.length > 0,
    hisMcpUrl: config.hisMcpUrl,
    hasHisMcpToken: config.hisMcpToken.length > 0
  }
}
