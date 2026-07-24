import type { McpConnection } from './mcp-http-transport'
import { readDfHisEnvironmentConfigSync } from '../dfhis-environment/config'

const DEFAULT_HIS_MCP_URL = 'http://192.168.1.10:9020/mcp'
const DEFAULT_YUNXIAO_MCP_URL =
  'https://openapi-rdc.aliyuncs.com/ai/mcp?toolsets=organization-management,project-management'

export function getHisMcpConnection(): McpConnection {
  const config = readDfHisEnvironmentConfigSync()
  const url = (process.env.HIS_MCP_URL || config.hisMcpUrl || DEFAULT_HIS_MCP_URL).trim()
  const bearerToken = (process.env.HIS_MCP_TOKEN || config.hisMcpToken || '').trim() || null
  let hasQueryToken = false
  try {
    hasQueryToken = Boolean(new URL(url).searchParams.get('t')?.trim())
  } catch {
    hasQueryToken = false
  }
  return { url, bearerToken, hasQueryToken }
}

function appendToolsetQuery(url: URL): string {
  if (!url.searchParams.has('toolsets')) {
    url.searchParams.set('toolsets', 'organization-management,project-management')
  }
  return url.toString()
}

function getOfficialYunxiaoMcpUrl(): string {
  const savedConfig = readDfHisEnvironmentConfigSync()
  const explicitUrl = process.env.YUNXIAO_MCP_URL?.trim()
  if (explicitUrl) {
    return explicitUrl
  }
  if (savedConfig.yunxiaoMcpUrl) {
    return savedConfig.yunxiaoMcpUrl
  }
  const apiBaseUrl = process.env.YUNXIAO_API_BASE_URL?.trim()
  if (apiBaseUrl) {
    return appendToolsetQuery(
      new URL('/ai/mcp', apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`)
    )
  }
  return DEFAULT_YUNXIAO_MCP_URL
}

export function getOfficialYunxiaoConnection(): McpConnection | null {
  const savedConfig = readDfHisEnvironmentConfigSync()
  const bearerToken =
    (process.env.YUNXIAO_ACCESS_TOKEN || savedConfig.yunxiaoAccessToken).trim() || null
  return bearerToken ? { url: getOfficialYunxiaoMcpUrl(), bearerToken, hasQueryToken: false } : null
}
