import { existsSync, readFileSync } from 'node:fs'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import type {
  DfHisEnvironmentConfigInput,
  DfHisEnvironmentConfigSnapshot,
  DfHisWorkflowGateSettings
} from '../../shared/dfhis-environment-types'
import { writeProjectIndexManifest } from './project-index-manifest'

const CONFIG_FILE_NAME = 'dfhis-environment.json'
const DEFAULT_GITLAB_HOST = 'gitlab.df-mic.com'
const DEFAULT_HIS_MCP_URL = 'http://192.168.1.10:9020/mcp'
const DEFAULT_YUNXIAO_MCP_URL =
  'https://openapi-rdc.aliyuncs.com/ai/mcp?toolsets=organization-management,project-management'
const DEFAULT_ARCHIVE_WORKSPACE_PATH = path.join(homedir(), 'workspace', 'yunxiao')
const DEFAULT_HIS_FACT_INDEX_PATH = path.join(
  homedir(),
  '.cache',
  'orca',
  'his-index',
  'fact-cards.json'
)
const DEFAULT_PROJECT_INDEX_DIRECTORY = path.join(homedir(), '.cache', 'orca', 'project-index')
const DEFAULT_PROJECT_INDEX_MANIFEST_PATH = path.join(
  DEFAULT_PROJECT_INDEX_DIRECTORY,
  'manifest.json'
)
const DEFAULT_PROJECT_CODE_GRAPH_PATH = path.join(
  DEFAULT_PROJECT_INDEX_DIRECTORY,
  'code-graph.json'
)
const DEFAULT_PROJECT_KNOWLEDGE_INDEX_PATH = path.join(
  DEFAULT_PROJECT_INDEX_DIRECTORY,
  'knowledge.json'
)
const DEFAULT_HIS_WORKFLOW_CATALOG_PATH = path.join(
  homedir(),
  '.codex',
  'skills',
  'his-workflow-harness',
  'references',
  'company-environments.json'
)
const DEFAULT_DFHIS_SKILL_PACK_URL =
  'http://192.168.1.10:18800/static/downloads/dfhis/dfhis-skill-pack.json'
const DEFAULT_RELAY_EXEC_MODEL = 'deepseek/deepseek-v4-flash'

const DEFAULT_SMTP_HOST = 'smtp.exmail.qq.com'
const DEFAULT_SMTP_PORT = '465'
const DEFAULT_SMTP_FROM_NAME = 'HIS需求质量审核'
const DEFAULT_EMAIL_CC = 'chenbin@df-mic.com, yangyan@df-mic.com'

export type DfHisEnvironmentConfig = {
  gitlabHost: string
  gitlabAccessToken: string
  yunxiaoAccessToken: string
  yunxiaoMcpUrl: string
  hisMcpToken: string
  hisMcpUrl: string
  hisCodeRoot: string
  hisWorkflowCatalogPath: string
  archiveWorkspacePath: string
  hisFactCardsRoot: string
  hisFactIndexPath: string
  ygtWorkspaceRoot: string
  projectIndexManifestPath: string
  projectCodeGraphPath: string
  projectKnowledgeIndexPath: string
  dfhisSkillPackUrl: string
  relayExecModel: string
  relayExecApiKey: string
  visionApiKey: string
  skillContributionUploadToken: string
  smtpHost: string
  smtpPort: string
  smtpUser: string
  smtpPassword: string
  smtpFromName: string
  emailCc: string
  hisWorkflow: DfHisWorkflowGateSettings
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

function cleanHisWorkflowGate(value: unknown): DfHisWorkflowGateSettings {
  const gate = typeof value === 'object' && value !== null ? value : {}
  return { rcE2eGate: (gate as Record<string, unknown>).rcE2eGate === true }
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
    hisWorkflowCatalogPath:
      cleanPath((config as Record<string, unknown>).hisWorkflowCatalogPath) ||
      DEFAULT_HIS_WORKFLOW_CATALOG_PATH,
    archiveWorkspacePath:
      cleanPath((config as Record<string, unknown>).archiveWorkspacePath) ||
      DEFAULT_ARCHIVE_WORKSPACE_PATH,
    hisFactCardsRoot: cleanPath((config as Record<string, unknown>).hisFactCardsRoot),
    hisFactIndexPath:
      cleanPath((config as Record<string, unknown>).hisFactIndexPath) ||
      DEFAULT_HIS_FACT_INDEX_PATH,
    ygtWorkspaceRoot: cleanPath((config as Record<string, unknown>).ygtWorkspaceRoot),
    projectIndexManifestPath:
      cleanPath((config as Record<string, unknown>).projectIndexManifestPath) ||
      DEFAULT_PROJECT_INDEX_MANIFEST_PATH,
    projectCodeGraphPath:
      cleanPath((config as Record<string, unknown>).projectCodeGraphPath) ||
      DEFAULT_PROJECT_CODE_GRAPH_PATH,
    projectKnowledgeIndexPath:
      cleanPath((config as Record<string, unknown>).projectKnowledgeIndexPath) ||
      DEFAULT_PROJECT_KNOWLEDGE_INDEX_PATH,
    dfhisSkillPackUrl:
      cleanString((config as Record<string, unknown>).dfhisSkillPackUrl) ||
      DEFAULT_DFHIS_SKILL_PACK_URL,
    relayExecModel:
      cleanString((config as Record<string, unknown>).relayExecModel) || DEFAULT_RELAY_EXEC_MODEL,
    relayExecApiKey: cleanString((config as Record<string, unknown>).relayExecApiKey),
    visionApiKey: cleanString((config as Record<string, unknown>).visionApiKey),
    skillContributionUploadToken: cleanString(
      (config as Record<string, unknown>).skillContributionUploadToken
    ),
    smtpHost: cleanString((config as Record<string, unknown>).smtpHost) || DEFAULT_SMTP_HOST,
    smtpPort: cleanString((config as Record<string, unknown>).smtpPort) || DEFAULT_SMTP_PORT,
    smtpUser: cleanString((config as Record<string, unknown>).smtpUser),
    smtpPassword: cleanString((config as Record<string, unknown>).smtpPassword),
    smtpFromName:
      cleanString((config as Record<string, unknown>).smtpFromName) || DEFAULT_SMTP_FROM_NAME,
    emailCc: cleanString((config as Record<string, unknown>).emailCc) || DEFAULT_EMAIL_CC,
    hisWorkflow: cleanHisWorkflowGate((config as Record<string, unknown>).hisWorkflow)
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
    hisWorkflowCatalogPath:
      cleanPath(patch.hisWorkflowCatalogPath) || current.hisWorkflowCatalogPath,
    archiveWorkspacePath: cleanPath(patch.archiveWorkspacePath) || current.archiveWorkspacePath,
    hisFactCardsRoot: cleanPath(patch.hisFactCardsRoot) || current.hisFactCardsRoot,
    hisFactIndexPath: cleanPath(patch.hisFactIndexPath) || current.hisFactIndexPath,
    ygtWorkspaceRoot: cleanPath(patch.ygtWorkspaceRoot) || current.ygtWorkspaceRoot,
    projectIndexManifestPath:
      cleanPath(patch.projectIndexManifestPath) || current.projectIndexManifestPath,
    projectCodeGraphPath: cleanPath(patch.projectCodeGraphPath) || current.projectCodeGraphPath,
    projectKnowledgeIndexPath:
      cleanPath(patch.projectKnowledgeIndexPath) || current.projectKnowledgeIndexPath,
    dfhisSkillPackUrl: cleanString(patch.dfhisSkillPackUrl) || current.dfhisSkillPackUrl,
    relayExecModel: cleanString(patch.relayExecModel) || current.relayExecModel,
    relayExecApiKey: cleanString(patch.relayExecApiKey) || current.relayExecApiKey,
    visionApiKey: cleanString(patch.visionApiKey) || current.visionApiKey,
    skillContributionUploadToken:
      cleanString(patch.skillContributionUploadToken) || current.skillContributionUploadToken,
    smtpHost: cleanString(patch.smtpHost) || current.smtpHost,
    smtpPort: cleanString(patch.smtpPort) || current.smtpPort,
    smtpUser: cleanString(patch.smtpUser) || current.smtpUser,
    smtpPassword: cleanString(patch.smtpPassword) || current.smtpPassword,
    smtpFromName: cleanString(patch.smtpFromName) || current.smtpFromName,
    emailCc: cleanString(patch.emailCc) || current.emailCc,
    // Why: boolean gate — `|| current` would make false unwritable, so an explicit patch wins.
    hisWorkflow: patch.hisWorkflow ?? current.hisWorkflow
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
  await writeProjectIndexManifest(next)
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
    hisWorkflowCatalogPath: config.hisWorkflowCatalogPath,
    archiveWorkspacePath: config.archiveWorkspacePath,
    hisFactCardsRoot: config.hisFactCardsRoot,
    hisFactIndexPath: config.hisFactIndexPath,
    ygtWorkspaceRoot: config.ygtWorkspaceRoot,
    projectIndexManifestPath: config.projectIndexManifestPath,
    projectCodeGraphPath: config.projectCodeGraphPath,
    projectKnowledgeIndexPath: config.projectKnowledgeIndexPath,
    dfhisSkillPackUrl: config.dfhisSkillPackUrl,
    relayExecModel: config.relayExecModel,
    relayExecApiKey: config.relayExecApiKey,
    hasRelayExecApiKey: config.relayExecApiKey.length > 0,
    visionApiKey: config.visionApiKey,
    hasVisionApiKey: config.visionApiKey.length > 0,
    // Why: the upload token ships a shared default, so only a configured override is worth exposing.
    hasSkillContributionUploadToken: config.skillContributionUploadToken.length > 0,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpUser: config.smtpUser,
    smtpPassword: config.smtpPassword,
    hasSmtpPassword: config.smtpPassword.length > 0,
    smtpFromName: config.smtpFromName,
    emailCc: config.emailCc,
    hisWorkflow: config.hisWorkflow
  }
}
