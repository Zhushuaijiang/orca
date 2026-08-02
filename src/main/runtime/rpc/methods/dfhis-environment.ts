import { z } from 'zod'
import type {
  DfHisEnvironmentConfigInput,
  DfHisEnvironmentInstallResult,
  DfHisEnvironmentPrerequisiteResult
} from '../../../../shared/dfhis-environment-types'
import { defineMethod, type RpcMethod } from '../core'
import { OptionalPlainString } from '../schemas'
import { getHisMcpConnection, getOfficialYunxiaoConnection } from '../../../yunxiao/mcp-connections'
import {
  readDfHisEnvironmentConfigSync,
  saveDfHisEnvironmentConfig,
  snapshotDfHisEnvironmentConfig,
  type DfHisEnvironmentConfig
} from '../../../dfhis-environment/config'
import {
  checkArchiveWorkspacePrerequisite,
  checkHisCodeRootPrerequisite,
  checkHisWorkflowCatalogPrerequisite,
  ensureArchiveWorkspace
} from '../../../dfhis-environment/dfhis-workspace-prerequisites'
import {
  checkDfHisWorkflowPackPrerequisites,
  ensureDfHisWorkflowPackInstalled,
  pullAndEnsureDfHisWorkflowPack
} from '../../../dfhis-environment/dfhis-workflow-pack-installer'
import {
  checkGitPrerequisite,
  checkPythonPrerequisite,
  ensureDfHisCliPrerequisitesInstalled,
  getGlabInstallCommand,
  runDfHisCommand,
  runDfHisCommandWithInput
} from '../../../dfhis-environment/cli-prerequisites'
import {
  checkHisMcpToolsPrerequisite,
  checkYunxiaoMcpToolsPrerequisite
} from '../../../dfhis-environment/mcp-tool-prerequisites'

const DfHisEnvironmentConfigInputSchema = z
  .object({
    gitlabHost: OptionalPlainString,
    gitlabAccessToken: OptionalPlainString,
    yunxiaoAccessToken: OptionalPlainString,
    yunxiaoMcpUrl: OptionalPlainString,
    hisMcpToken: OptionalPlainString,
    hisMcpUrl: OptionalPlainString,
    hisCodeRoot: OptionalPlainString,
    hisWorkflowCatalogPath: OptionalPlainString,
    archiveWorkspacePath: OptionalPlainString,
    dfhisSkillPackUrl: OptionalPlainString
  })
  .optional()
  .nullable()
  .transform((value) => value ?? undefined)

const YUNXIAO_TOKEN_COMMAND =
  process.platform === 'win32' ? 'setx YUNXIAO_ACCESS_TOKEN ...' : 'export YUNXIAO_ACCESS_TOKEN=...'
const HIS_MCP_TOKEN_COMMAND =
  process.platform === 'win32' ? 'setx HIS_MCP_TOKEN ...' : 'export HIS_MCP_TOKEN=...'

function checkYunxiaoMcpPrerequisite(): DfHisEnvironmentPrerequisiteResult {
  const connection = getOfficialYunxiaoConnection()
  if (!connection) {
    return {
      id: 'yunxiao-mcp',
      label: 'Yunxiao MCP',
      status: 'missing',
      summary: 'YUNXIAO_ACCESS_TOKEN is not set',
      detail: 'Paste the Yunxiao access token in DFHIS Setup, then click Save & install.',
      command: YUNXIAO_TOKEN_COMMAND,
      fixable: true
    }
  }
  return {
    id: 'yunxiao-mcp',
    label: 'Yunxiao MCP',
    status: 'ok',
    summary: 'Token configured',
    detail: connection.url,
    fixable: false
  }
}

function checkHisMcpPrerequisite(): DfHisEnvironmentPrerequisiteResult {
  const connection = getHisMcpConnection()
  if (!connection.bearerToken && !connection.hasQueryToken) {
    return {
      id: 'his-mcp',
      label: 'HIS MCP business expert',
      status: 'missing',
      summary: 'HIS MCP credentials are required for business-semantics verification',
      detail:
        'Configure HIS MCP so diagnosis, rule, dictionary, tenant, and cross-station decisions can be verified before implementation.',
      command: HIS_MCP_TOKEN_COMMAND,
      fixable: true
    }
  }
  return {
    id: 'his-mcp',
    label: 'HIS MCP business expert',
    status: 'ok',
    summary: 'Credentials configured',
    detail: connection.url,
    fixable: false
  }
}

async function checkGitLabPrerequisite(): Promise<DfHisEnvironmentPrerequisiteResult> {
  const config = readDfHisEnvironmentConfigSync()
  const version = await runDfHisCommand('glab', ['--version'])
  if (!version.ok) {
    return {
      id: 'gitlab',
      label: 'GitLab access',
      status: 'missing',
      summary: 'glab is not installed',
      detail: 'Install GitLab CLI, then authenticate with the team GitLab host.',
      command: `${getGlabInstallCommand()} && glab auth login --hostname ${config.gitlabHost}`,
      fixable: true
    }
  }

  const auth = await runDfHisCommand('glab', ['auth', 'status', '--hostname', config.gitlabHost])
  if (!auth.ok) {
    return {
      id: 'gitlab',
      label: 'GitLab access',
      status: 'invalid',
      summary: config.gitlabAccessToken
        ? 'Saved token has not been installed into glab'
        : 'glab is installed but not authenticated',
      detail: auth.stderr.trim() || auth.stdout.trim() || auth.errorMessage,
      command: `glab auth login --hostname ${config.gitlabHost} --stdin`,
      fixable: Boolean(config.gitlabAccessToken)
    }
  }

  return {
    id: 'gitlab',
    label: 'GitLab access',
    status: 'ok',
    summary: 'glab is authenticated',
    detail: auth.stdout.trim() || auth.stderr.trim(),
    fixable: false
  }
}

async function checkDfHisEnvironment() {
  await ensureDfHisWorkflowPackInstalled()
  const [
    git,
    python,
    gitlab,
    yunxiaoMcpTools,
    hisMcpTools,
    dfhisWorkflowPack,
    hisCodeRoot,
    hisWorkflowCatalog,
    archiveWorkspace
  ] = await Promise.all([
    checkGitPrerequisite(),
    checkPythonPrerequisite(),
    checkGitLabPrerequisite(),
    checkYunxiaoMcpToolsPrerequisite(),
    checkHisMcpToolsPrerequisite(),
    checkDfHisWorkflowPackPrerequisites(),
    checkHisCodeRootPrerequisite(),
    checkHisWorkflowCatalogPrerequisite(),
    checkArchiveWorkspacePrerequisite()
  ])
  return {
    checkedAt: new Date().toISOString(),
    prerequisites: [
      git,
      python,
      gitlab,
      checkYunxiaoMcpPrerequisite(),
      checkHisMcpPrerequisite(),
      yunxiaoMcpTools,
      hisMcpTools,
      ...dfhisWorkflowPack,
      hisCodeRoot,
      hisWorkflowCatalog,
      archiveWorkspace
    ],
    config: snapshotDfHisEnvironmentConfig()
  }
}

async function installGitLabAccess(config: DfHisEnvironmentConfig): Promise<string> {
  const version = await runDfHisCommand('glab', ['--version'])
  if (!version.ok) {
    return `GitLab CLI is not installed. Run ${getGlabInstallCommand()}, then Save & install again.`
  }
  if (!config.gitlabAccessToken) {
    return 'GitLab access token is not saved yet.'
  }
  const auth = await runDfHisCommandWithInput(
    'glab',
    ['auth', 'login', '--hostname', config.gitlabHost, '--stdin'],
    config.gitlabAccessToken
  )
  if (!auth.ok) {
    return `GitLab auth failed: ${auth.stderr.trim() || auth.stdout.trim() || auth.errorMessage || 'Unknown error'}`
  }
  return `GitLab access installed for ${config.gitlabHost}.`
}

async function installDfHisEnvironment(
  configInput?: DfHisEnvironmentConfigInput
): Promise<DfHisEnvironmentInstallResult> {
  const config = configInput
    ? await saveDfHisEnvironmentConfig(configInput)
    : readDfHisEnvironmentConfigSync()
  const messages = [
    configInput ? 'Saved DFHIS setup configuration.' : 'Using saved DFHIS setup configuration.',
    ...(await ensureDfHisCliPrerequisitesInstalled()),
    await installGitLabAccess(config),
    ...(await pullAndEnsureDfHisWorkflowPack(config.dfhisSkillPackUrl)),
    await ensureArchiveWorkspace(config)
  ]
  return {
    installed: messages.every(
      (message) => !message.includes('failed') && !message.includes('not installed')
    ),
    messages,
    check: await checkDfHisEnvironment()
  }
}

export const DFHIS_ENVIRONMENT_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'dfhisEnvironment.getConfig',
    params: null,
    handler: () => ({ config: snapshotDfHisEnvironmentConfig() })
  }),
  defineMethod({
    name: 'dfhisEnvironment.check',
    params: null,
    handler: async () => ({ check: await checkDfHisEnvironment() })
  }),
  defineMethod({
    name: 'dfhisEnvironment.install',
    params: DfHisEnvironmentConfigInputSchema,
    handler: async (params) => ({ result: await installDfHisEnvironment(params) })
  })
]
