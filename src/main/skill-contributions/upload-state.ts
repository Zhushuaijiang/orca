import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

export type SkillContributionUploadState = {
  lastRunAt: string | null
  skills: Record<string, string>
}

const STATE_FILE_NAME = 'skill-contributions-state.json'

function userDataPath(): string {
  return process.env.ORCA_USER_DATA_PATH?.trim() || app.getPath('userData')
}

export function getSkillContributionStatePath(userDataDirectory = userDataPath()): string {
  return path.join(userDataDirectory, STATE_FILE_NAME)
}

export function emptySkillContributionState(): SkillContributionUploadState {
  return { lastRunAt: null, skills: {} }
}

export async function readSkillContributionState(
  statePath = getSkillContributionStatePath()
): Promise<SkillContributionUploadState> {
  try {
    const parsed: unknown = JSON.parse(await readFile(statePath, 'utf8'))
    if (!parsed || typeof parsed !== 'object') {
      return emptySkillContributionState()
    }
    const record = parsed as Partial<SkillContributionUploadState>
    const skills =
      record.skills && typeof record.skills === 'object'
        ? Object.fromEntries(
            Object.entries(record.skills).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string'
            )
          )
        : {}
    return {
      lastRunAt: typeof record.lastRunAt === 'string' ? record.lastRunAt : null,
      skills
    }
  } catch {
    return emptySkillContributionState()
  }
}

export async function writeSkillContributionState(
  state: SkillContributionUploadState,
  statePath = getSkillContributionStatePath()
): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true })
  const temporaryPath = `${statePath}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, statePath)
}

/** Why: the server re-computes this exact digest to tell "stored" from "unchanged". */
export function aggregateSkillFilesSha256(
  files: readonly { path: string; sha256: string }[]
): string {
  const hash = createHash('sha256')
  // Why: plain code-unit sort matches the server's Python string sort.
  const lines = files.map((file) => `${file.path}:${file.sha256}`).sort()
  hash.update(lines.join('\n'))
  return hash.digest('hex')
}
