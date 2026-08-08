import { hostname } from 'node:os'
import {
  readDfHisEnvironmentConfigSync,
  type DfHisEnvironmentConfig
} from '../dfhis-environment/config'
import { collectLocalSkills, type CollectedSkill } from './collect-local-skills'
import { fetchRemoteOfficialAggregates } from './remote-pack-aggregates'
import { getContributorIdentity } from './contributor-identity'
import { resolveSkillContributionServerOrigin, skillPackUrlForOrigin } from './server-origin'
import {
  aggregateSkillFilesSha256,
  readSkillContributionState,
  writeSkillContributionState
} from './upload-state'

export const DEFAULT_SKILL_CONTRIB_UPLOAD_TOKEN = 'skillcontrib-6d7bd508ede6cbef6a74ed6ac5755f0c'

const UPLOAD_TIMEOUT_MS = 120_000
// Why: the server rejects payloads over 5MB decoded; stay well under per request.
const MAX_BATCH_DECODED_BYTES = 4 * 1024 * 1024

function skillDecodedBytes(skill: CollectedSkill): number {
  return skill.files.reduce((total, file) => total + Math.ceil(file.contentBase64.length * 0.75), 0)
}

function batchSkillsBySize(skills: CollectedSkill[]): CollectedSkill[][] {
  const batches: CollectedSkill[][] = []
  let current: CollectedSkill[] = []
  let currentBytes = 0
  for (const skill of skills) {
    const bytes = skillDecodedBytes(skill)
    if (current.length > 0 && currentBytes + bytes > MAX_BATCH_DECODED_BYTES) {
      batches.push(current)
      current = []
      currentBytes = 0
    }
    current.push(skill)
    currentBytes += bytes
  }
  if (current.length > 0) {
    batches.push(current)
  }
  return batches
}

export type SkillContributionUploadResult = {
  uploaded: string[]
  unchanged: string[]
  skipped: string[]
  error?: string
}

export function resolveSkillContributionUploadToken(config: DfHisEnvironmentConfig): string {
  return (
    process.env.SKILL_CONTRIB_UPLOAD_TOKEN?.trim() ||
    config.skillContributionUploadToken ||
    DEFAULT_SKILL_CONTRIB_UPLOAD_TOKEN
  )
}

export async function runSkillContributionUpload(): Promise<SkillContributionUploadResult> {
  const result: SkillContributionUploadResult = { uploaded: [], unchanged: [], skipped: [] }
  try {
    const identity = await getContributorIdentity()
    if (!identity) {
      return result
    }
    const config = readDfHisEnvironmentConfigSync()
    const origin = await resolveSkillContributionServerOrigin(config)
    const remoteOfficialAggregates = await fetchRemoteOfficialAggregates(
      skillPackUrlForOrigin(config, origin)
    )
    const collected = await collectLocalSkills({ remoteOfficialAggregates })
    result.skipped = collected.skipped.map((skill) => skill.name)
    const state = await readSkillContributionState()
    const changed = collected.skills.filter((skill) => {
      const aggregate = aggregateSkillFilesSha256(skill.files)
      if (state.skills[skill.name] === aggregate) {
        result.unchanged.push(skill.name)
        return false
      }
      return true
    })
    if (changed.length === 0) {
      return result
    }
    const url = `${origin}/api/skill-contributions`
    const token = resolveSkillContributionUploadToken(config)
    for (const batch of batchSkillsBySize(changed)) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': token
        },
        body: JSON.stringify({
          schemaVersion: 1,
          contributor: identity,
          clientHost: hostname(),
          collectedAt: new Date().toISOString(),
          skills: batch
        }),
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
      })
      if (!response.ok) {
        result.error = `upload failed with status ${response.status}`
        return result
      }
      const body: unknown = await response.json().catch(() => null)
      const stored = new Set(
        body && typeof body === 'object' && Array.isArray((body as { results?: unknown }).results)
          ? (body as { results: { skill?: unknown; status?: unknown }[] }).results
              .filter((entry) => entry.status === 'stored' && typeof entry.skill === 'string')
              .map((entry) => entry.skill as string)
          : batch.map((skill) => skill.name)
      )
      for (const skill of batch) {
        state.skills[skill.name] = aggregateSkillFilesSha256(skill.files)
        if (stored.has(skill.name)) {
          result.uploaded.push(skill.name)
        } else {
          result.unchanged.push(skill.name)
        }
      }
      state.lastRunAt = new Date().toISOString()
      await writeSkillContributionState(state)
    }
    return result
  } catch (error) {
    // Why: a hidden background task must never surface failures to the app.
    result.error = error instanceof Error ? error.message : String(error)
    console.warn('[skill-contributions] upload run failed:', result.error)
    return result
  }
}
