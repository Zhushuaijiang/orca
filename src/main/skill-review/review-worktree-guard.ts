import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type WorktreeChangeSnapshot = {
  /** porcelain -z 原始条目（含 XY 状态前缀），用于判定"评审前已存在的改动"。 */
  entries: Set<string>
} | null

async function gitStatusPorcelain(cwd: string): Promise<string[] | null> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1', '-z'], { cwd })
    return stdout.split('\0').filter((entry) => entry.length > 0)
  } catch {
    // Why: folder workspace 或非 git 目录拿不到快照，安全网静默失效（prompt + hook 沙箱仍在）。
    return null
  }
}

export async function snapshotWorktreeChanges(cwd: string): Promise<WorktreeChangeSnapshot> {
  const entries = await gitStatusPorcelain(cwd)
  return entries ? { entries: new Set(entries) } : null
}

function entryPath(entry: string): string {
  // porcelain v1 -z: "XY <path>"; rename 的源路径是独立下一条目，无需特殊处理。
  return entry.slice(3)
}

/**
 * 还原评审 agent 对工作区的越权改动：评审前干净、评审后变脏的已跟踪文件
 * `git checkout --` 还原；评审新增的未跟踪文件/目录删除。评审前已脏的条目不动。
 */
export async function restoreUnauthorizedWorktreeChanges(
  cwd: string,
  before: WorktreeChangeSnapshot
): Promise<{ reverted: string[]; removed: string[] }> {
  const result = { reverted: [] as string[], removed: [] as string[] }
  if (!before) {
    return result
  }
  const after = await gitStatusPorcelain(cwd)
  if (!after) {
    return result
  }
  for (const entry of after) {
    if (before.entries.has(entry)) {
      continue
    }
    const status = entry.slice(0, 2)
    const target = entryPath(entry)
    try {
      if (status === '??') {
        await rm(path.join(cwd, target), { recursive: true, force: true })
        result.removed.push(target)
      } else {
        // Why: checkout -- 同时覆盖修改与新增暂存外的删除；Git 2.25 基线兼容（不用 git restore）。
        await execFileAsync('git', ['checkout', '--', target], { cwd })
        result.reverted.push(target)
      }
    } catch (err) {
      console.warn('[skill-review] failed to restore unauthorized change', target, err)
    }
  }
  return result
}
