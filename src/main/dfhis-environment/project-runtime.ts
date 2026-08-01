import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

export type DfHisProjectFamily = 'his' | 'ygt' | 'unknown'
export type DfHisPackageManager = 'pnpm' | 'yarn' | 'npm' | 'unknown'

export type DfHisProjectRuntime = {
  family: DfHisProjectFamily
  nodeMajor: number | null
  nodeSource: 'repository' | 'project-family' | 'unknown'
  packageManager: DfHisPackageManager
  packageManagerSource: 'package-json' | 'lockfile' | 'unknown'
  nodeBinPath: string | null
}

type RuntimeResolverOptions = {
  homeDirectory?: string
  platform?: NodeJS.Platform
}

function readText(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf8').trim()
  } catch {
    return null
  }
}

function parseNodeMajor(value: string | null | undefined): number | null {
  const match = value?.match(/(?:^|[^\d])(\d{2})(?:\D|$)/)
  const major = match ? Number.parseInt(match[1], 10) : Number.NaN
  return Number.isFinite(major) && major >= 16 && major <= 99 ? major : null
}

function readPackageJson(root: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function resolveFamily(
  root: string,
  packageJson: Record<string, unknown> | null
): DfHisProjectFamily {
  const identity = `${root} ${String(packageJson?.name ?? '')}`.toLowerCase()
  if (/df[-_/\\]ygt|ygt[-_/\\]|医共体/.test(identity)) {
    return 'ygt'
  }
  if (/df[-_/\\](?:web|his|mic|bff|agg)|云his|dfhis/.test(identity)) {
    return 'his'
  }
  return 'unknown'
}

function resolvePackageManager(
  root: string,
  packageJson: Record<string, unknown> | null
): Pick<DfHisProjectRuntime, 'packageManager' | 'packageManagerSource'> {
  const declared = typeof packageJson?.packageManager === 'string' ? packageJson.packageManager : ''
  const declaredManager = /^(pnpm|yarn|npm)@/.exec(declared)?.[1] as DfHisPackageManager | undefined
  if (declaredManager) {
    return { packageManager: declaredManager, packageManagerSource: 'package-json' }
  }
  if (existsSync(path.join(root, 'pnpm-lock.yaml'))) {
    return { packageManager: 'pnpm', packageManagerSource: 'lockfile' }
  }
  if (existsSync(path.join(root, 'yarn.lock'))) {
    return { packageManager: 'yarn', packageManagerSource: 'lockfile' }
  }
  if (existsSync(path.join(root, 'package-lock.json'))) {
    return { packageManager: 'npm', packageManagerSource: 'lockfile' }
  }
  return { packageManager: 'unknown', packageManagerSource: 'unknown' }
}

function explicitNodeMajor(
  root: string,
  packageJson: Record<string, unknown> | null
): number | null {
  const toolVersions = readText(path.join(root, '.tool-versions'))
  const toolVersionsNode = toolVersions?.match(/^nodejs\s+([^\s]+)$/m)?.[1]
  const engines = packageJson?.engines
  const engineNode =
    engines && typeof engines === 'object'
      ? String((engines as Record<string, unknown>).node ?? '')
      : ''
  return (
    parseNodeMajor(readText(path.join(root, '.nvmrc'))) ??
    parseNodeMajor(readText(path.join(root, '.node-version'))) ??
    parseNodeMajor(toolVersionsNode) ??
    parseNodeMajor(engineNode)
  )
}

function compareVersionsDescending(left: string, right: string): number {
  return right.localeCompare(left, undefined, { numeric: true, sensitivity: 'base' })
}

function firstNodeBin(root: string, major: number, platform: NodeJS.Platform): string | null {
  if (!existsSync(root)) {
    return null
  }
  try {
    const versions = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && parseNodeMajor(entry.name) === major)
      .map((entry) => entry.name)
      .sort(compareVersionsDescending)
    for (const version of versions) {
      const candidate =
        platform === 'win32' ? path.join(root, version) : path.join(root, version, 'bin')
      const executable = path.join(candidate, platform === 'win32' ? 'node.exe' : 'node')
      if (existsSync(executable)) {
        return candidate
      }
    }
  } catch {
    return null
  }
  return null
}

function resolveNodeBinPath(major: number | null, options: RuntimeResolverOptions): string | null {
  if (!major) {
    return null
  }
  const homeDirectory = options.homeDirectory ?? homedir()
  const platform = options.platform ?? process.platform
  const roots = [
    path.join(homeDirectory, '.nvm', 'versions', 'node'),
    path.join(homeDirectory, '.fnm', 'node-versions'),
    path.join(homeDirectory, '.local', 'share', 'fnm', 'node-versions')
  ]
  for (const root of roots) {
    const direct = firstNodeBin(root, major, platform)
    if (direct) {
      return direct
    }
    const installation = firstNodeBinWithInstallation(root, major, platform)
    if (installation) {
      return installation
    }
  }
  return null
}

function firstNodeBinWithInstallation(
  root: string,
  major: number,
  platform: NodeJS.Platform
): string | null {
  if (!existsSync(root)) {
    return null
  }
  try {
    const versions = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && parseNodeMajor(entry.name) === major)
      .map((entry) => entry.name)
      .sort(compareVersionsDescending)
    for (const version of versions) {
      const candidate =
        platform === 'win32'
          ? path.join(root, version, 'installation')
          : path.join(root, version, 'installation', 'bin')
      const executable = path.join(candidate, platform === 'win32' ? 'node.exe' : 'node')
      if (existsSync(executable)) {
        return candidate
      }
    }
  } catch {
    return null
  }
  return null
}

export function resolveDfHisProjectRuntime(
  workspaceRoot: string | null | undefined,
  options: RuntimeResolverOptions = {}
): DfHisProjectRuntime {
  const root = workspaceRoot?.trim() ? path.resolve(workspaceRoot) : ''
  const packageJson = root ? readPackageJson(root) : null
  const family = resolveFamily(root, packageJson)
  const repositoryNodeMajor = root ? explicitNodeMajor(root, packageJson) : null
  const nodeMajor = repositoryNodeMajor ?? (family === 'ygt' ? 22 : family === 'his' ? 18 : null)
  const packageManager = root
    ? resolvePackageManager(root, packageJson)
    : { packageManager: 'unknown' as const, packageManagerSource: 'unknown' as const }
  return {
    family,
    nodeMajor,
    nodeSource: repositoryNodeMajor ? 'repository' : nodeMajor ? 'project-family' : 'unknown',
    ...packageManager,
    nodeBinPath: resolveNodeBinPath(nodeMajor, options)
  }
}
