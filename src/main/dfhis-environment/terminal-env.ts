import path from 'node:path'
import type { FolderWorkspace } from '../../shared/types'
import { readDfHisEnvironmentConfigSync } from './config'
import { resolveDfHisProjectRuntime } from './project-runtime'
import { getYgtCompanyEnvironment } from './ygt-company-environment'

function addIfMissing(
  env: Record<string, string>,
  key: string,
  value: string | null | undefined
): void {
  const cleanValue = value?.trim()
  if (cleanValue && !env[key]?.trim()) {
    env[key] = cleanValue
  }
}

export function getYunxiaoRequirementDirectory(
  workspaceRoot: string | null | undefined,
  identifier: string | null | undefined
): string | null {
  const cleanRoot = workspaceRoot?.trim()
  const cleanIdentifier = identifier?.trim()
  if (!cleanRoot || !cleanIdentifier) {
    return null
  }
  const normalizedRoot = path.normalize(cleanRoot)
  return path.basename(normalizedRoot) === cleanIdentifier
    ? normalizedRoot
    : path.join(normalizedRoot, cleanIdentifier)
}

export function buildYunxiaoTerminalEnv(
  folderWorkspace: Pick<FolderWorkspace, 'linkedTask'> | null | undefined,
  baseEnv: Record<string, string>,
  options: { codeWorkspaceRoot?: string | null; workspaceRoot?: string | null } = {}
): Record<string, string> {
  if (folderWorkspace?.linkedTask?.provider !== 'yunxiao') {
    return baseEnv
  }
  const config = readDfHisEnvironmentConfigSync()
  const env = { ...baseEnv }
  const identifier = folderWorkspace.linkedTask.yunxiaoIdentifier?.trim()
  if (identifier) {
    addIfMissing(env, 'YUNXIAO_WORK_ITEM_ID', identifier)
  }
  addIfMissing(
    env,
    'YUNXIAO_REQUIREMENT_DIR',
    getYunxiaoRequirementDirectory(options.workspaceRoot, identifier)
  )
  addIfMissing(env, 'YUNXIAO_CODE_WORKSPACE_ROOT', options.codeWorkspaceRoot || config.hisCodeRoot)
  addIfMissing(env, 'YUNXIAO_DEFAULT_CODE_ROOT', config.hisCodeRoot)
  addIfMissing(env, 'YUNXIAO_ACCESS_TOKEN', config.yunxiaoAccessToken)
  addIfMissing(env, 'YUNXIAO_MCP_URL', config.yunxiaoMcpUrl)
  addIfMissing(env, 'HIS_MCP_TOKEN', config.hisMcpToken)
  addIfMissing(env, 'HIS_MCP_URL', config.hisMcpUrl)
  addIfMissing(env, 'HIS_WORKFLOW_CATALOG', config.hisWorkflowCatalogPath)
  addIfMissing(env, 'YUNXIAO_ARCHIVE_WORKSPACE', config.archiveWorkspacePath)
  const ygtCompanyEnvironment = getYgtCompanyEnvironment()
  if (ygtCompanyEnvironment) {
    for (const [key, value] of Object.entries(ygtCompanyEnvironment.variables)) {
      addIfMissing(env, key, value)
    }
  }
  const codeWorkspaceRoot = options.codeWorkspaceRoot || config.hisCodeRoot
  const runtime = resolveDfHisProjectRuntime(codeWorkspaceRoot)
  addIfMissing(env, 'DFHIS_PROJECT_FAMILY', runtime.family)
  addIfMissing(env, 'DFHIS_NODE_MAJOR', runtime.nodeMajor?.toString())
  addIfMissing(env, 'DFHIS_NODE_SOURCE', runtime.nodeSource)
  addIfMissing(env, 'DFHIS_PACKAGE_MANAGER', runtime.packageManager)
  if (runtime.nodeBinPath) {
    const pathKey = process.platform === 'win32' && !Object.hasOwn(env, 'PATH') ? 'Path' : 'PATH'
    env[pathKey] = [runtime.nodeBinPath, env[pathKey]].filter(Boolean).join(path.delimiter)
  }
  return env
}
