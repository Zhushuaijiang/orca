import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import {
  buildReviewAgentSpawnSpec,
  computeSkillReviewWriteRoots,
  type ReviewAgentSpawnSpec
} from './review-agent-command'
import {
  appendMemoryPointerToInstructionFiles,
  ensureAgentMemoryFile,
  getAgentMemoryFilePath
} from './memory-store'
import { buildSkillReviewPrompt } from './review-prompt'
import type { SkillReviewRequest } from './review-queue'
import { getSkillReviewStateDirectory } from './review-state'
import {
  restoreUnauthorizedWorktreeChanges,
  snapshotWorktreeChanges
} from './review-worktree-guard'

const REVIEW_TIMEOUT_MS = 10 * 60_000
// Why: transcript 小于这个体量说明会话几乎没有内容，评审纯属浪费 token。
const MIN_TRANSCRIPT_BYTES = 2048
const MAX_OUTPUT_CHARS = 64 * 1024

export type SkillReviewSpawnResult = {
  exitCode: number | null
  timedOut: boolean
  outputTail: string
}

export type SpawnReviewProcess = (
  spec: ReviewAgentSpawnSpec,
  prompt: string,
  cwd: string,
  timeoutMs: number
) => Promise<SkillReviewSpawnResult>

/** 默认执行器：child_process spawn，prompt 走 stdin（避免超长 argv 与转义问题）。 */
export const spawnReviewProcess: SpawnReviewProcess = (spec, prompt, cwd, timeoutMs) =>
  new Promise((resolve) => {
    let child
    try {
      child = spawn(spec.command, spec.args, {
        cwd,
        env: spec.env,
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch (err) {
      resolve({ exitCode: null, timedOut: false, outputTail: String(err) })
      return
    }
    let output = ''
    const append = (chunk: Buffer) => {
      output = (output + chunk.toString('utf8')).slice(-MAX_OUTPUT_CHARS)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ exitCode: null, timedOut, outputTail: String(err) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ exitCode: code, timedOut, outputTail: output.trim() })
    })
    child.stdin.on('error', () => {
      // Why: 子进程提前退出时 stdin EPIPE，close 事件会给出最终结果。
    })
    child.stdin.end(prompt)
  })

export type RunSkillReviewDeps = {
  resolveWorktreePath: (worktreeId: string) => string | null
  spawnProcess?: SpawnReviewProcess
  homeDirectory?: string
  stateDirectory?: string
}

export async function runSkillReview(
  request: SkillReviewRequest,
  deps: RunSkillReviewDeps
): Promise<void> {
  const worktreePath = deps.resolveWorktreePath(request.worktreeId)
  if (!worktreePath || !existsSync(worktreePath)) {
    return
  }
  let transcriptPath: string | null = null
  if (request.transcriptPath && existsSync(request.transcriptPath)) {
    if (statSync(request.transcriptPath).size < MIN_TRANSCRIPT_BYTES) {
      return
    }
    transcriptPath = request.transcriptPath
  }

  const homeDirectory = deps.homeDirectory ?? homedir()
  // Why: 每次评审前幂等确保 memory 层存在且各 agent 指令文件带指针——
  // 用户可能中途删过文件，指针追加本身去重。
  await ensureAgentMemoryFile(homeDirectory)
  await appendMemoryPointerToInstructionFiles(homeDirectory)

  const stateDirectory = deps.stateDirectory ?? getSkillReviewStateDirectory()
  const spec = await buildReviewAgentSpawnSpec({
    agent: request.agent,
    homeDirectory,
    stateDirectory
  })
  if (!spec) {
    console.warn(`[skill-review] no headless spec for agent ${request.agent}; skipped`)
    return
  }

  const roots = computeSkillReviewWriteRoots(homeDirectory, request.agent)
  const prompt = buildSkillReviewPrompt({
    worktreePath,
    transcriptPath,
    skillDirectories: roots.directories,
    memoryFilePath: getAgentMemoryFilePath(homeDirectory)
  })

  const before = await snapshotWorktreeChanges(worktreePath)
  const spawnProcess = deps.spawnProcess ?? spawnReviewProcess
  const result = await spawnProcess(spec, prompt, worktreePath, REVIEW_TIMEOUT_MS)

  const restored = await restoreUnauthorizedWorktreeChanges(worktreePath, before)
  if (restored.reverted.length > 0 || restored.removed.length > 0) {
    console.warn(
      `[skill-review] reverted unauthorized worktree changes: reverted=${restored.reverted.length} removed=${restored.removed.length}`
    )
  }
  if (result.timedOut) {
    console.warn('[skill-review] review timed out; process killed')
    return
  }
  if (result.exitCode !== 0) {
    console.warn(
      `[skill-review] review exited ${result.exitCode}: ${result.outputTail.slice(-500)}`
    )
    return
  }
  const lastLine = result.outputTail.split('\n').findLast((line) => line.length > 0) ?? ''
  console.log(`[skill-review] ${request.agent} @ ${request.worktreeId}: ${lastLine.slice(-200)}`)
}
