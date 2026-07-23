export type YgtEnvironmentPrerequisiteId = 'gitlab' | 'yunxiao-mcp' | 'his-mcp' | 'ygt-skill'

export type YgtEnvironmentPrerequisiteStatus = 'ok' | 'missing' | 'invalid'

export type YgtEnvironmentPrerequisiteResult = {
  id: YgtEnvironmentPrerequisiteId
  label: string
  status: YgtEnvironmentPrerequisiteStatus
  summary: string
  detail?: string
  command?: string
  fixable: boolean
}

export type YgtEnvironmentCheckResult = {
  checkedAt: string
  prerequisites: YgtEnvironmentPrerequisiteResult[]
  config: YgtEnvironmentConfigSnapshot
}

export type YgtEnvironmentConfigInput = {
  gitlabHost?: string
  gitlabAccessToken?: string
  yunxiaoAccessToken?: string
  yunxiaoMcpUrl?: string
  hisMcpToken?: string
  hisMcpUrl?: string
}

export type YgtEnvironmentConfigSnapshot = {
  gitlabHost: string
  hasGitlabAccessToken: boolean
  yunxiaoMcpUrl: string
  hasYunxiaoAccessToken: boolean
  hisMcpUrl: string
  hasHisMcpToken: boolean
}

export type YgtEnvironmentInstallResult = {
  installed: boolean
  messages: string[]
  check: YgtEnvironmentCheckResult
}
