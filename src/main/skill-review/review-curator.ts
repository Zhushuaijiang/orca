import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { TuiAgent } from '../../shared/types'
import { buildReviewAgentSpawnSpec, computeAllSkillDirectories } from './review-agent-command'
import { getAgentMemoryFilePath } from './memory-store'
import { buildSkillCuratorPrompt } from './review-prompt'
import { spawnReviewProcess, type SpawnReviewProcess } from './review-runner'
import {
  getSkillReviewStateDirectory,
  readSkillReviewState,
  writeSkillReviewState
} from './review-state'

const FIRST_RUN_DELAY_MS = 10 * 60_000
const RUN_INTERVAL_MS = 24 * 60 * 60_000
const CURATOR_TIMEOUT_MS = 10 * 60_000
// Why: 整理 agent 不需要工作区上下文，cwd 只是 hook/工具的落点。
const CURATOR_AGENT_PRIORITY: readonly TuiAgent[] = ['kimi', 'claude']

function findBinaryOnPath(binary: string): boolean {
  const extensions = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : ['']
  for (const entry of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!entry) {
      continue
    }
    for (const extension of extensions) {
      if (existsSync(path.join(entry, `${binary}${extension}`))) {
        return true
      }
    }
  }
  return false
}

export type SkillReviewCuratorDeps = {
  homeDirectory?: string
  stateDirectory?: string
  spawnProcess?: SpawnReviewProcess
  binaryExists?: (binary: string) => boolean
  isEnabled?: () => boolean
}

let running = false

/** 跑一次周期整理：去重/补丁/归档建议，永不硬删除（不变量写在 prompt 里）。 */
export async function runSkillReviewCuratorOnce(deps: SkillReviewCuratorDeps = {}): Promise<void> {
  if (running) {
    return
  }
  if (deps.isEnabled && !deps.isEnabled()) {
    return
  }
  const state = await readSkillReviewState()
  // Why: 重启后 10 分钟就来一次首跑——落盘的 lastCuratorRunAt 挡住重复整理。
  if (state.lastCuratorRunAt && Date.now() - Date.parse(state.lastCuratorRunAt) < RUN_INTERVAL_MS) {
    return
  }
  running = true
  try {
    const homeDirectory = deps.homeDirectory ?? homedir()
    const binaryExists = deps.binaryExists ?? findBinaryOnPath
    const agent = CURATOR_AGENT_PRIORITY.find((candidate) => binaryExists(candidate))
    if (!agent) {
      console.warn('[skill-review] curator: no supported agent binary on PATH; skipped')
      return
    }
    const roots = {
      directories: computeAllSkillDirectories(homeDirectory),
      files: [getAgentMemoryFilePath(homeDirectory)]
    }
    const spec = await buildReviewAgentSpawnSpec({
      agent,
      homeDirectory,
      stateDirectory: deps.stateDirectory ?? getSkillReviewStateDirectory(),
      rootsOverride: roots
    })
    if (!spec) {
      return
    }
    const prompt = buildSkillCuratorPrompt({
      worktreePath: homeDirectory,
      skillDirectories: roots.directories,
      memoryFilePath: getAgentMemoryFilePath(homeDirectory)
    })
    const spawnProcess = deps.spawnProcess ?? spawnReviewProcess
    const result = await spawnProcess(spec, prompt, homeDirectory, CURATOR_TIMEOUT_MS)
    if (result.timedOut || result.exitCode !== 0) {
      console.warn(
        `[skill-review] curator run failed (timedOut=${result.timedOut} exit=${result.exitCode})`
      )
      return
    }
    const latest = await readSkillReviewState()
    latest.lastCuratorRunAt = new Date().toISOString()
    await writeSkillReviewState(latest)
    console.log('[skill-review] curator run completed')
  } finally {
    running = false
  }
}

let started = false

export function startSkillReviewCurator(deps: SkillReviewCuratorDeps = {}): void {
  if (started) {
    return
  }
  started = true
  const firstRun = setTimeout(() => {
    void runSkillReviewCuratorOnce(deps)
    const interval = setInterval(() => void runSkillReviewCuratorOnce(deps), RUN_INTERVAL_MS)
    interval.unref()
  }, FIRST_RUN_DELAY_MS)
  firstRun.unref()
}
