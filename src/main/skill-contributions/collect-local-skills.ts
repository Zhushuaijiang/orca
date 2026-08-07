import { createHash } from 'node:crypto'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  AGENT_SKILL_HOME_DIRECTORIES,
  UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY
} from '../../shared/agent-skill-home-directories'
import {
  DFHIS_BUNDLED_SKILL_PACK,
  DFHIS_WORKFLOW_PACK_NAMES
} from '../dfhis-environment/dfhis-workflow-pack-targets'
import { getBundledSkillPackPath } from '../skill-packs/bundled-skill-pack-files'

const MAX_SKILL_FILE_BYTES = 1024 * 1024
const MAX_SKILL_TOTAL_BYTES = 5 * 1024 * 1024
const SKIPPED_ENTRY_NAMES = new Set(['.git', 'node_modules', '__pycache__', '.DS_Store'])
// Why: auto-upload must never leak personal tokens/keys to the shared server.
const SECRET_CONTENT_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/,
  /pt-[A-Za-z0-9]{20,}/,
  /glpat-[A-Za-z0-9_-]{15,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/
]

export type CollectedSkillFile = {
  path: string
  sha256: string
  contentBase64: string
}

export type CollectedSkill = {
  name: string
  files: CollectedSkillFile[]
  sourceHomes: string[]
}

export type SkippedSkill = {
  name: string
  reason: string
}

export type CollectLocalSkillsResult = {
  skills: CollectedSkill[]
  skipped: SkippedSkill[]
}

export type SkillHomeRoot = {
  label: string
  directory: string
}

export type CollectLocalSkillsOptions = {
  skillHomeRoots?: SkillHomeRoot[]
  bundledSkillPackPath?: string
  officialSkillNames?: readonly string[]
  // Why: installs pulled from the remote pack differ from the repo bundle and
  // must also count as "unmodified official", or every pack update looks like
  // a local edit on every machine.
  remoteOfficialAggregates?: ReadonlyMap<string, ReadonlySet<string>>
}

export function defaultSkillHomeRoots(homeDirectory = homedir()): SkillHomeRoot[] {
  const roots: SkillHomeRoot[] = [
    {
      label: 'agents',
      directory: path.join(homeDirectory, ...UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY)
    }
  ]
  for (const [agent, segments] of Object.entries(AGENT_SKILL_HOME_DIRECTORIES)) {
    roots.push({ label: agent, directory: path.join(homeDirectory, ...segments) })
  }
  return roots
}

class SkillTooLargeError extends Error {}

async function collectSkillFiles(
  directory: string,
  baseDirectory: string,
  totalBytes: { value: number }
): Promise<CollectedSkillFile[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: CollectedSkillFile[] = []
  for (const entry of entries) {
    if (SKIPPED_ENTRY_NAMES.has(entry.name)) {
      continue
    }
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectSkillFiles(fullPath, baseDirectory, totalBytes)))
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    const fileStat = await stat(fullPath)
    // Why: one huge file must not drop the whole skill, only that file.
    if (fileStat.size > MAX_SKILL_FILE_BYTES) {
      continue
    }
    totalBytes.value += fileStat.size
    if (totalBytes.value > MAX_SKILL_TOTAL_BYTES) {
      throw new SkillTooLargeError(`exceeds ${MAX_SKILL_TOTAL_BYTES} bytes total`)
    }
    const content = await readFile(fullPath)
    if (SECRET_CONTENT_PATTERNS.some((pattern) => pattern.test(content.toString('utf8')))) {
      continue
    }
    files.push({
      path: path.relative(baseDirectory, fullPath).split(path.sep).join('/'),
      sha256: createHash('sha256').update(content).digest('hex'),
      contentBase64: content.toString('base64')
    })
  }
  return files
}

function aggregateFilesSha256(files: readonly { path: string; sha256: string }[]): string {
  const basis = files
    .map((file) => `${file.path}:${file.sha256}`)
    .sort()
    .join('\n')
  return createHash('sha256').update(basis).digest('hex')
}

async function bundledSkillAggregate(
  skillName: string,
  bundledSkillPackPath: string
): Promise<string | null> {
  const bundledSkillDirectory = path.join(bundledSkillPackPath, skillName)
  try {
    const files = await collectSkillFiles(bundledSkillDirectory, bundledSkillDirectory, {
      value: 0
    })
    return files.length > 0 ? aggregateFilesSha256(files) : null
  } catch {
    return null
  }
}

export async function collectLocalSkills(
  options: CollectLocalSkillsOptions = {}
): Promise<CollectLocalSkillsResult> {
  const roots = options.skillHomeRoots ?? defaultSkillHomeRoots()
  const bundledSkillPackPath =
    options.bundledSkillPackPath ?? getBundledSkillPackPath(DFHIS_BUNDLED_SKILL_PACK)
  const officialSkillNames = new Set(options.officialSkillNames ?? DFHIS_WORKFLOW_PACK_NAMES)

  const result: CollectLocalSkillsResult = { skills: [], skipped: [] }
  const seenRealPaths = new Map<string, CollectedSkill>()
  const seenAggregates = new Map<string, CollectedSkill>()
  const usedNames = new Set<string>()
  const skippedNames = new Set<string>()
  const bundledAggregates = new Map<string, string | null>()

  for (const root of roots) {
    let entries
    try {
      entries = await readdir(root.directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || (!entry.isDirectory() && !entry.isSymbolicLink())) {
        continue
      }
      const skillDirectory = path.join(root.directory, entry.name)
      // Why: many agents symlink their skills root to ~/.agents/skills; the
      // canonical path is the dedupe key so one skill uploads once.
      let canonicalDirectory: string
      try {
        canonicalDirectory = await realpath(skillDirectory)
        if (!(await stat(canonicalDirectory)).isDirectory()) {
          continue
        }
      } catch {
        continue
      }
      const existing = seenRealPaths.get(canonicalDirectory)
      if (existing) {
        if (!existing.sourceHomes.includes(root.label)) {
          existing.sourceHomes.push(root.label)
        }
        continue
      }
      let files: CollectedSkillFile[]
      try {
        files = await collectSkillFiles(canonicalDirectory, canonicalDirectory, { value: 0 })
      } catch (error) {
        result.skipped.push({
          name: entry.name,
          reason: error instanceof SkillTooLargeError ? 'skill-too-large' : 'read-failed'
        })
        continue
      }
      if (files.length === 0) {
        result.skipped.push({ name: entry.name, reason: 'no-collectable-files' })
        continue
      }
      const aggregate = aggregateFilesSha256(files)
      if (officialSkillNames.has(entry.name)) {
        if (!bundledAggregates.has(entry.name)) {
          bundledAggregates.set(
            entry.name,
            await bundledSkillAggregate(entry.name, bundledSkillPackPath)
          )
        }
        const isUnmodifiedOfficial =
          bundledAggregates.get(entry.name) === aggregate ||
          options.remoteOfficialAggregates?.get(entry.name)?.has(aggregate) === true
        if (isUnmodifiedOfficial) {
          if (!skippedNames.has(entry.name)) {
            skippedNames.add(entry.name)
            result.skipped.push({ name: entry.name, reason: 'official-skill-unmodified' })
          }
          continue
        }
      }
      // Why: `npx skills add --global --agent X` drops identical copies into
      // several homes; identical content merges into one contribution.
      const identical = seenAggregates.get(aggregate)
      if (identical) {
        seenRealPaths.set(canonicalDirectory, identical)
        if (!identical.sourceHomes.includes(root.label)) {
          identical.sourceHomes.push(root.label)
        }
        continue
      }
      // Why: identical names with different content across agent homes would
      // ping-pong the dedupe hash; suffix keeps each copy a stable identity.
      let name = entry.name
      if (usedNames.has(name)) {
        name = `${name}-${root.label}`.slice(0, 64)
      }
      if (usedNames.has(name)) {
        result.skipped.push({ name: entry.name, reason: 'name-collision' })
        continue
      }
      usedNames.add(name)
      const skill: CollectedSkill = { name, files, sourceHomes: [root.label] }
      seenRealPaths.set(canonicalDirectory, skill)
      seenAggregates.set(aggregate, skill)
      result.skills.push(skill)
    }
  }
  return result
}
