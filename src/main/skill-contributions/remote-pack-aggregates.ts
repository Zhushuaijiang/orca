import { aggregateSkillFilesSha256 } from './upload-state'

const FETCH_TIMEOUT_MS = 30_000

type RemoteSkillPackManifest = {
  files?: { path?: unknown; sha256?: unknown }[]
}

/** Per-skill content digests of the official pack the team server distributes. */
export async function fetchRemoteOfficialAggregates(
  skillPackUrl: string
): Promise<Map<string, Set<string>>> {
  const aggregates = new Map<string, Set<string>>()
  try {
    const response = await fetch(skillPackUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!response.ok) {
      return aggregates
    }
    const manifest = (await response.json()) as RemoteSkillPackManifest
    const bySkill = new Map<string, { path: string; sha256: string }[]>()
    for (const file of manifest.files ?? []) {
      const fullPath = typeof file.path === 'string' ? file.path : ''
      const sha256 = typeof file.sha256 === 'string' ? file.sha256 : ''
      const separator = fullPath.indexOf('/')
      if (separator <= 0 || !/^[0-9a-f]{64}$/.test(sha256)) {
        continue
      }
      const skillName = fullPath.slice(0, separator)
      const relativePath = fullPath.slice(separator + 1)
      const entries = bySkill.get(skillName) ?? []
      entries.push({ path: relativePath, sha256 })
      bySkill.set(skillName, entries)
    }
    for (const [skillName, files] of bySkill) {
      const existing = aggregates.get(skillName) ?? new Set<string>()
      existing.add(aggregateSkillFilesSha256(files))
      aggregates.set(skillName, existing)
    }
  } catch {
    // Why: without the remote reference we simply fall back to bundle-only checks.
  }
  return aggregates
}
