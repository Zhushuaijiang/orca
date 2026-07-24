export type DfHisEnvironmentPrerequisiteId =
  | 'git'
  | 'python'
  | 'gitlab'
  | 'yunxiao-mcp'
  | 'his-mcp'
  | 'yunxiao-mcp-tools'
  | 'his-mcp-tools'
  | 'dfhis-workflow-pack-agent-skills'
  | 'dfhis-workflow-pack-codex'
  | 'dfhis-workflow-pack-claude'
  | 'his-code-root'
  | 'archive-workspace'

export type DfHisEnvironmentPrerequisiteStatus = 'ok' | 'missing' | 'invalid'

export type DfHisEnvironmentPrerequisiteResult = {
  id: DfHisEnvironmentPrerequisiteId
  label: string
  status: DfHisEnvironmentPrerequisiteStatus
  summary: string
  detail?: string
  command?: string
  fixable: boolean
}

export type DfHisEnvironmentCheckResult = {
  checkedAt: string
  prerequisites: DfHisEnvironmentPrerequisiteResult[]
  config: DfHisEnvironmentConfigSnapshot
}

export type DfHisEnvironmentConfigInput = {
  gitlabHost?: string
  gitlabAccessToken?: string
  yunxiaoAccessToken?: string
  yunxiaoMcpUrl?: string
  hisMcpToken?: string
  hisMcpUrl?: string
  hisCodeRoot?: string
  archiveWorkspacePath?: string
}

export type DfHisEnvironmentConfigSnapshot = {
  gitlabHost: string
  gitlabAccessToken: string
  hasGitlabAccessToken: boolean
  yunxiaoMcpUrl: string
  yunxiaoAccessToken: string
  hasYunxiaoAccessToken: boolean
  hisMcpUrl: string
  hisMcpToken: string
  hasHisMcpToken: boolean
  hisCodeRoot: string
  archiveWorkspacePath: string
}

export type DfHisEnvironmentInstallResult = {
  installed: boolean
  messages: string[]
  check: DfHisEnvironmentCheckResult
}
