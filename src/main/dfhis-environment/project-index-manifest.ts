import { existsSync } from 'node:fs'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DfHisEnvironmentConfig } from './config'

export async function writeProjectIndexManifest(config: DfHisEnvironmentConfig): Promise<void> {
  const projects: Record<string, unknown>[] = []
  if (config.hisCodeRoot) {
    projects.push({
      id: 'his',
      label: 'HIS / DFHIS',
      aliases: ['HIS', 'DFHIS', '云HIS'],
      codeRoots: [config.hisCodeRoot],
      knowledgeRoots: config.hisFactCardsRoot ? [config.hisFactCardsRoot] : [],
      historyRoots: config.archiveWorkspacePath ? [config.archiveWorkspacePath] : [],
      historyPriority: 0,
      repositoryPatterns: ['df-(?!ygt|web-ygt)[a-z0-9-]+']
    })
  }
  if (config.ygtWorkspaceRoot) {
    const ygtRoot = path.join(config.ygtWorkspaceRoot, 'df-ygt')
    const baseRoot = path.join(config.ygtWorkspaceRoot, 'df-base')
    const codeRoots = [ygtRoot, baseRoot].filter((root) => existsSync(root))
    if (codeRoots.length > 0) {
      projects.push({
        id: 'ygt',
        label: '医共体 / YGT',
        aliases: ['医共体', 'YGT'],
        codeRoots,
        knowledgeRoots: existsSync(ygtRoot) ? [ygtRoot] : [],
        historyRoots: config.archiveWorkspacePath ? [config.archiveWorkspacePath] : [],
        historyPriority: 100,
        repositoryPatterns: ['df-ygt', 'df-web-ygt', '医共体', 'YGT']
      })
    }
  }
  const manifestPath = config.projectIndexManifestPath
  await mkdir(path.dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify({ version: 1, projects }, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  })
  await chmod(manifestPath, 0o600)
}
