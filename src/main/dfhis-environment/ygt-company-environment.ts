import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { getBundledSkillPackPath } from '../skill-packs/bundled-skill-pack-files'
import { DFHIS_BUNDLED_SKILL_PACK } from './dfhis-workflow-pack-targets'

const REFERENCE_RELATIVE_PARTS = [
  'dfhis-company-environment',
  'references',
  'company-environment',
  '医共体公司开发环境信息.md'
] as const

// Why: mirrors the discovery order of the YGT harness bootstrap (ps1 + mjs).
const INSTALLED_SKILL_ROOTS = [
  ['.agents', 'skills'],
  ['.codex', 'skills'],
  ['.claude', 'skills']
] as const

export type YgtCompanyEnvironmentResolveOptions = {
  homeDirectory?: string
  bundledPackPath?: string
}

export type YgtCompanyEnvironment = {
  sourcePath: string
  variables: Record<string, string>
}

function sectionFor(text: string, heading: string): string {
  const start = text.toLowerCase().indexOf(heading.toLowerCase())
  if (start === -1) {
    return ''
  }
  const rest = text.slice(start)
  const next = rest.slice(1).search(/\n\s*\*\*/)
  return next === -1 ? rest : rest.slice(0, next + 1)
}

function credentialLines(section: string): string[] {
  return section
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\*\*/g, '')
        .trim()
    )
    .filter((line) => line && !/^#+\s*/.test(line))
    .filter((line) => !/^[-*]\s*$/.test(line))
    .filter((line) => !/https?:\/\//i.test(line))
    .filter((line) => !line.startsWith('$') && !/^mvn\b/i.test(line))
}

function setSlashCredential(
  values: Record<string, string>,
  userKey: string,
  passwordKey: string,
  section: string
): void {
  // Why: the user segment must be colon-free so JDBC-style `host:port/db` lines
  // are not mistaken for `user/password` credentials.
  const line = credentialLines(section).find((entry) => /^[^/\s:]+\/[^/\s]+$/.test(entry))
  if (!line) {
    return
  }
  const [user, password] = line.split('/')
  values[userKey] = user
  values[passwordKey] = password
}

function setLineCredentials(
  values: Record<string, string>,
  userKey: string,
  passwordKey: string,
  section: string
): void {
  // Why: exclude both colon widths so section headings like `网关管理：` are not
  // picked up as a username line.
  const lines = credentialLines(section).filter(
    (line) => !line.includes(':') && !line.includes('：')
  )
  if (lines.length < 2) {
    return
  }
  values[userKey] = lines[0]
  values[passwordKey] = lines[1]
}

export function parseYgtCompanyEnvironmentReference(text: string): Record<string, string> {
  const normalized = text
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\\_/g, '_')
  const values: Record<string, string> = {}
  setSlashCredential(values, 'YGT_MAIN_USER', 'YGT_MAIN_PASSWORD', sectionFor(normalized, '主应用'))
  setLineCredentials(
    values,
    'YGT_GATEWAY_USER',
    'YGT_GATEWAY_PASSWORD',
    sectionFor(normalized, '公司开发环境网关管理')
  )
  setLineCredentials(
    values,
    'YGT_NACOS_USER',
    'YGT_NACOS_PASSWORD',
    sectionFor(normalized, '公司开发环境nacos信息')
  )
  setSlashCredential(
    values,
    'YGT_DORIS_USER',
    'YGT_DORIS_PASSWORD',
    sectionFor(normalized, '公司开发环境数据库doris信息')
  )
  setSlashCredential(
    values,
    'YGT_JENKINS_USER',
    'YGT_JENKINS_PASSWORD',
    sectionFor(normalized, '公司开发环境jekins') || sectionFor(normalized, '公司开发环境jenkins')
  )
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value && !/[<>]/.test(value))
  )
}

function defaultBundledPackPath(): string | null {
  // Why: non-Electron contexts (plain Node tests, relays) can lack
  // process.resourcesPath; the bundled copy is only a fallback anyway.
  try {
    return getBundledSkillPackPath(DFHIS_BUNDLED_SKILL_PACK)
  } catch {
    return null
  }
}

export function resolveYgtCompanyEnvironmentReferencePath(
  options: YgtCompanyEnvironmentResolveOptions = {}
): string | null {
  const homeDirectory = options.homeDirectory ?? homedir()
  const bundledPackPath = options.bundledPackPath ?? defaultBundledPackPath()
  const candidates = [
    ...INSTALLED_SKILL_ROOTS.map((root) =>
      path.join(homeDirectory, ...root, ...REFERENCE_RELATIVE_PARTS)
    ),
    ...(bundledPackPath ? [path.join(bundledPackPath, ...REFERENCE_RELATIVE_PARTS)] : [])
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

export function getYgtCompanyEnvironment(
  options: YgtCompanyEnvironmentResolveOptions = {}
): YgtCompanyEnvironment | null {
  const sourcePath = resolveYgtCompanyEnvironmentReferencePath(options)
  if (!sourcePath) {
    return null
  }
  let text: string
  try {
    text = readFileSync(sourcePath, 'utf8')
  } catch {
    return null
  }
  const variables = parseYgtCompanyEnvironmentReference(text)
  if (Object.keys(variables).length === 0) {
    return null
  }
  return { sourcePath, variables: { ...variables, YGT_COMPANY_REFERENCE_PATH: sourcePath } }
}

export function describeYgtCompanyEnvironmentStatus(
  options: YgtCompanyEnvironmentResolveOptions = {}
): string {
  const environment = getYgtCompanyEnvironment(options)
  if (!environment) {
    return 'YGT company environment reference is missing; agent terminals will not receive YGT Jenkins/Doris credentials.'
  }
  return `YGT company credentials ready: ${Object.keys(environment.variables).length} variables from ${environment.sourcePath}, injected into agent terminals automatically.`
}
