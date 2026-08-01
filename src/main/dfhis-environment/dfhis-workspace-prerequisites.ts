import { constants } from 'node:fs'
import { access, mkdir, readFile, stat } from 'node:fs/promises'
import type { DfHisEnvironmentPrerequisiteResult } from '../../shared/dfhis-environment-types'
import { readDfHisEnvironmentConfigSync, type DfHisEnvironmentConfig } from './config'

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function pathIsDirectory(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory()
  } catch {
    return false
  }
}

async function pathHasAccess(filePath: string, mode: number): Promise<boolean> {
  try {
    await access(filePath, mode)
    return true
  } catch {
    return false
  }
}

export async function checkHisCodeRootPrerequisite(): Promise<DfHisEnvironmentPrerequisiteResult> {
  const config = readDfHisEnvironmentConfigSync()
  if (!config.hisCodeRoot) {
    return {
      id: 'his-code-root',
      label: 'Default code root',
      status: 'missing',
      summary: 'Default code root is not configured',
      detail: 'Set this only as a fallback; Yunxiao workspaces prefer the selected Orca repo.',
      fixable: false
    }
  }
  if (!(await pathExists(config.hisCodeRoot))) {
    return {
      id: 'his-code-root',
      label: 'Default code root',
      status: 'missing',
      summary: 'Code root does not exist',
      detail: config.hisCodeRoot,
      fixable: false
    }
  }
  if (!(await pathIsDirectory(config.hisCodeRoot))) {
    return {
      id: 'his-code-root',
      label: 'Default code root',
      status: 'invalid',
      summary: 'Configured path is not a directory',
      detail: config.hisCodeRoot,
      fixable: false
    }
  }
  return {
    id: 'his-code-root',
    label: 'Default code root',
    status: 'ok',
    summary: 'Code root configured',
    detail: config.hisCodeRoot,
    fixable: false
  }
}

export async function checkHisWorkflowCatalogPrerequisite(): Promise<DfHisEnvironmentPrerequisiteResult> {
  const { hisWorkflowCatalogPath } = readDfHisEnvironmentConfigSync()
  const base = {
    id: 'his-workflow-catalog' as const,
    label: 'HIS workflow service catalog',
    fixable: false
  }
  if (!hisWorkflowCatalogPath || !(await pathExists(hisWorkflowCatalogPath))) {
    return {
      ...base,
      status: 'missing',
      summary: hisWorkflowCatalogPath
        ? 'Service catalog does not exist'
        : 'Service catalog is not configured',
      detail:
        hisWorkflowCatalogPath ||
        'Configure the catalog that maps HIS services to databases, Jenkins jobs, deployments, and smoke checks.'
    }
  }
  try {
    const value = JSON.parse(await readFile(hisWorkflowCatalogPath, 'utf8')) as {
      schemaVersion?: unknown
      services?: unknown
    }
    if (value.schemaVersion !== 1 || !value.services || typeof value.services !== 'object') {
      throw new Error('Expected schemaVersion 1 and a services object')
    }
  } catch (error) {
    return {
      ...base,
      status: 'invalid',
      summary: 'Service catalog is not valid JSON or has an unsupported schema',
      detail: `${hisWorkflowCatalogPath}: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  return {
    ...base,
    status: 'ok',
    summary: 'Service catalog ready',
    detail: hisWorkflowCatalogPath
  }
}

export async function checkArchiveWorkspacePrerequisite(): Promise<DfHisEnvironmentPrerequisiteResult> {
  const config = readDfHisEnvironmentConfigSync()
  if (!(await pathExists(config.archiveWorkspacePath))) {
    return {
      id: 'archive-workspace',
      label: 'Yunxiao archive workspace',
      status: 'missing',
      summary: 'Archive workspace does not exist',
      detail: config.archiveWorkspacePath,
      fixable: true
    }
  }
  if (!(await pathIsDirectory(config.archiveWorkspacePath))) {
    return {
      id: 'archive-workspace',
      label: 'Yunxiao archive workspace',
      status: 'invalid',
      summary: 'Configured path is not a directory',
      detail: config.archiveWorkspacePath,
      fixable: false
    }
  }
  if (!(await pathHasAccess(config.archiveWorkspacePath, constants.R_OK | constants.W_OK))) {
    return {
      id: 'archive-workspace',
      label: 'Yunxiao archive workspace',
      status: 'invalid',
      summary: 'Archive workspace is not readable and writable',
      detail: config.archiveWorkspacePath,
      fixable: false
    }
  }
  return {
    id: 'archive-workspace',
    label: 'Yunxiao archive workspace',
    status: 'ok',
    summary: 'Archive workspace ready',
    detail: config.archiveWorkspacePath,
    fixable: true
  }
}

export async function ensureArchiveWorkspace(config: DfHisEnvironmentConfig): Promise<string> {
  await mkdir(config.archiveWorkspacePath, { recursive: true })
  return `Yunxiao archive workspace ready at ${config.archiveWorkspacePath}.`
}
