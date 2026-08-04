import type { TuiAgent } from './types'

/** Why: one workflow-pack row per supported agent home; keyed off TuiAgent so
 * newly supported agents join the checklist without another type edit. */
export type DfHisWorkflowPackPrerequisiteId =
  | 'dfhis-workflow-pack-agent-skills'
  | `dfhis-workflow-pack-${TuiAgent}`

export type DfHisEnvironmentPrerequisiteId =
  | 'git'
  | 'python'
  | 'gitlab'
  | 'yunxiao-mcp'
  | 'his-mcp'
  | 'yunxiao-mcp-tools'
  | 'his-mcp-tools'
  | DfHisWorkflowPackPrerequisiteId
  | 'his-code-root'
  | 'his-workflow-catalog'
  | 'archive-workspace'
  | 'kimi-cli'
  | 'relay-exec-model'

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
  hisWorkflowCatalogPath?: string
  archiveWorkspacePath?: string
  dfhisSkillPackUrl?: string
  relayExecModel?: string
  relayExecApiKey?: string
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
  hisWorkflowCatalogPath: string
  archiveWorkspacePath: string
  dfhisSkillPackUrl: string
  relayExecModel: string
  relayExecApiKey: string
  hasRelayExecApiKey: boolean
}

export type DfHisEnvironmentInstallResult = {
  installed: boolean
  messages: string[]
  check: DfHisEnvironmentCheckResult
}
