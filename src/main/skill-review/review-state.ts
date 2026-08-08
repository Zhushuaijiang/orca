import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

export type SkillReviewState = {
  /** `${worktreeId}:${agent}` → 上次评审时间（ISO），用于节流。 */
  lastReviewAtByTarget: Record<string, string>
  lastCuratorRunAt: string | null
}

const STATE_FILE_NAME = 'skill-review-state.json'

function userDataPath(): string {
  return process.env.ORCA_USER_DATA_PATH?.trim() || app.getPath('userData')
}

export function getSkillReviewStatePath(userDataDirectory = userDataPath()): string {
  return path.join(userDataDirectory, STATE_FILE_NAME)
}

/** 评审专用目录（kimi staging home、guard 脚本等都放这里）。 */
export function getSkillReviewStateDirectory(userDataDirectory = userDataPath()): string {
  return path.join(userDataDirectory, 'skill-review')
}

export function emptySkillReviewState(): SkillReviewState {
  return { lastReviewAtByTarget: {}, lastCuratorRunAt: null }
}

export async function readSkillReviewState(
  statePath = getSkillReviewStatePath()
): Promise<SkillReviewState> {
  try {
    const parsed: unknown = JSON.parse(await readFile(statePath, 'utf8'))
    if (!parsed || typeof parsed !== 'object') {
      return emptySkillReviewState()
    }
    const record = parsed as Partial<SkillReviewState>
    const lastReviewAtByTarget =
      record.lastReviewAtByTarget && typeof record.lastReviewAtByTarget === 'object'
        ? Object.fromEntries(
            Object.entries(record.lastReviewAtByTarget).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string'
            )
          )
        : {}
    return {
      lastReviewAtByTarget,
      lastCuratorRunAt: typeof record.lastCuratorRunAt === 'string' ? record.lastCuratorRunAt : null
    }
  } catch {
    return emptySkillReviewState()
  }
}

export async function writeSkillReviewState(
  state: SkillReviewState,
  statePath = getSkillReviewStatePath()
): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true })
  const temporaryPath = `${statePath}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, statePath)
}
