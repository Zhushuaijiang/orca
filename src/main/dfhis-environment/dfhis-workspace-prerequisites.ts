import { constants } from 'node:fs'
import { access, mkdir, stat } from 'node:fs/promises'
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
