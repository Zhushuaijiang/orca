import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { TuiAgent } from '../../shared/types'
import {
  AGENT_SKILL_HOME_DIRECTORIES,
  UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY
} from '../../shared/agent-skill-home-directories'
import { removeManagedKimiHooks, tomlBasicString } from '../kimi/kimi-hook-config-toml'
import { getAgentMemoryFilePath } from './memory-store'
import { SKILL_REVIEW_WRITE_GUARD_SCRIPT } from './write-guard-script'

export type SkillReviewWriteRoots = {
  directories: string[]
  files: string[]
}

export type ReviewAgentSpawnSpec = {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
}

/** 评审允许写入的根：universal 技能目录 + 该 agent 专属技能目录 + memory。 */
export function computeSkillReviewWriteRoots(
  homeDirectory: string,
  agent: TuiAgent
): SkillReviewWriteRoots {
  const directories = new Set<string>()
  directories.add(path.join(homeDirectory, ...UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY))
  const dedicated = AGENT_SKILL_HOME_DIRECTORIES[agent]
  if (dedicated) {
    directories.add(path.join(homeDirectory, ...dedicated))
  }
  const memoryFile = getAgentMemoryFilePath(homeDirectory)
  directories.add(path.dirname(memoryFile))
  return { directories: [...directories], files: [memoryFile] }
}

/** 周期整理的写范围：全部已知技能目录（universal + 各 agent 专属）+ memory。 */
export function computeAllSkillDirectories(homeDirectory: string): string[] {
  const directories = new Set<string>()
  directories.add(path.join(homeDirectory, ...UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY))
  for (const segments of Object.values(AGENT_SKILL_HOME_DIRECTORIES)) {
    if (segments) {
      directories.add(path.join(homeDirectory, ...segments))
    }
  }
  directories.add(path.dirname(getAgentMemoryFilePath(homeDirectory)))
  return [...directories]
}

/**
 * 评审进程环境：剥掉 ORCA_* 变量——评审会话的 agent hook（无论用户装了什么）
 * 都不应回贴 Orca，避免隐藏会话污染状态栏或递归触发评审。
 */
export function buildReviewEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('ORCA_')) {
      env[key] = value
    }
  }
  return { ...env, ...extra }
}

/** claude 权限规则用 `//<abs path>` 前缀表示绝对路径。 */
function claudeAbsoluteRule(tool: string, absolutePath: string): string {
  return `${tool}(//${absolutePath.replace(/^\//, '')}/**)`
}

function buildClaudeSpawnSpec(roots: SkillReviewWriteRoots): ReviewAgentSpawnSpec {
  const allowedTools = ['Read', 'Glob', 'Grep']
  const addDirs: string[] = []
  for (const directory of roots.directories) {
    allowedTools.push(claudeAbsoluteRule('Edit', directory), claudeAbsoluteRule('Write', directory))
    addDirs.push('--add-dir', directory)
  }
  for (const file of roots.files) {
    allowedTools.push(`Edit(//${file.replace(/^\//, '')})`, `Write(//${file.replace(/^\//, '')})`)
  }
  return {
    command: 'claude',
    // Why: 不在 allowedTools 里的工具（Bash 等）在 headless 下审批即拒绝；
    // permission-mode default 保持最小授权，acceptEdits 会放开全部编辑。
    args: [
      '-p',
      '--output-format',
      'text',
      '--permission-mode',
      'default',
      '--allowedTools',
      ...allowedTools,
      ...addDirs
    ],
    env: buildReviewEnvironment()
  }
}

const KIMI_STAGING_FILES = ['config.toml', 'device_id'] as const
const KIMI_STAGING_DIRECTORIES = ['credentials', 'oauth'] as const

/**
 * kimi 硬沙箱：独立 KIMI_CODE_HOME（复制 provider/凭据，替换 Orca managed
 * hooks 为写保护 hook）。评审会话的 hook 因此不回贴 Orca，也不可能触发二次评审。
 */
async function prepareKimiStagingHome(
  stagingHome: string,
  realKimiHome: string,
  roots: SkillReviewWriteRoots
): Promise<void> {
  await mkdir(stagingHome, { recursive: true })
  for (const file of KIMI_STAGING_FILES) {
    const source = path.join(realKimiHome, file)
    if (existsSync(source)) {
      await copyFile(source, path.join(stagingHome, file))
    }
  }
  for (const directory of KIMI_STAGING_DIRECTORIES) {
    const source = path.join(realKimiHome, directory)
    if (existsSync(source)) {
      await cp(source, path.join(stagingHome, directory), { recursive: true })
    }
  }
  const guardPath = path.join(stagingHome, 'skill-review-write-guard.mjs')
  const rootsPath = path.join(stagingHome, 'skill-review-roots.json')
  await writeFile(guardPath, SKILL_REVIEW_WRITE_GUARD_SCRIPT, 'utf8')
  await writeFile(rootsPath, JSON.stringify(roots), 'utf8')
  const toHookPath = (value: string) =>
    process.platform === 'win32' ? value.replaceAll('\\', '/') : value
  const guardCommand = `node "${toHookPath(guardPath)}" --roots-file "${toHookPath(rootsPath)}"`

  const configPath = path.join(stagingHome, 'config.toml')
  const current = existsSync(configPath) ? await readFile(configPath, 'utf8') : ''
  // Why: 剥掉 Orca managed hooks（评审会话不该回贴 Orca），只挂 PreToolUse 写保护。
  const { text: stripped } = removeManagedKimiHooks(current)
  const guardBlock = [
    '# >>> orca-skill-review-guard (managed by Orca; do not edit) >>>',
    '[[hooks]]',
    'event = "PreToolUse"',
    `command = ${tomlBasicString(guardCommand)}`,
    'timeout = 5',
    '# <<< orca-skill-review-guard <<<'
  ].join('\n')
  const next =
    stripped.trim().length > 0
      ? `${stripped.replace(/\s+$/, '')}\n\n${guardBlock}\n`
      : `${guardBlock}\n`
  await writeFile(configPath, next, 'utf8')
}

export type BuildReviewSpawnSpecOptions = {
  agent: TuiAgent
  homeDirectory: string
  /** userData 下评审专用目录（staging home 放这里）。 */
  stateDirectory: string
  /** 周期整理用：显式指定写范围，跳过按 agent 计算。 */
  rootsOverride?: SkillReviewWriteRoots
}

/** 跟随原会话 agent 构造 headless 评审进程；不支持的 agent 返回 null（跳过，周期整理兜底）。 */
export async function buildReviewAgentSpawnSpec(
  options: BuildReviewSpawnSpecOptions
): Promise<ReviewAgentSpawnSpec | null> {
  const roots =
    options.rootsOverride ?? computeSkillReviewWriteRoots(options.homeDirectory, options.agent)
  if (options.agent === 'claude' || options.agent === 'openclaude') {
    return buildClaudeSpawnSpec(roots)
  }
  if (options.agent === 'kimi') {
    const realKimiHome =
      process.env.KIMI_CODE_HOME?.trim() || path.join(options.homeDirectory, '.kimi-code')
    const stagingHome = path.join(options.stateDirectory, 'kimi-home')
    await prepareKimiStagingHome(stagingHome, realKimiHome, roots)
    return {
      command: 'kimi',
      args: ['--print', '--quiet'],
      env: buildReviewEnvironment({ KIMI_CODE_HOME: stagingHome })
    }
  }
  return null
}
