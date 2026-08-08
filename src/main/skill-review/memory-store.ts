import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { TuiAgent } from '../../shared/types'

const MEMORY_DIRECTORY = ['.agents', 'memory'] as const
const MEMORY_FILE_NAME = 'MEMORY.md'

const MEMORY_FILE_HEADER = `<!--
  Orca 自动沉淀的用户偏好与长期经验（hermes 式 memory 层）。
  由 Orca 技能评审服务维护；可手工编辑，内容不会被自动删除。
-->

# 用户偏好与长期记忆

`

/**
 * 已验证全局指令文件位置的 agent；指针只追加、从不创建这些文件，
 * 所以表中缺失的 agent 不补——避免把文件写到 agent 实际不读的位置。
 */
export const AGENT_GLOBAL_INSTRUCTION_FILES: Partial<Record<TuiAgent, readonly string[]>> = {
  claude: ['.claude', 'CLAUDE.md'],
  'claude-agent-teams': ['.claude', 'CLAUDE.md'],
  openclaude: ['.claude', 'CLAUDE.md'],
  codex: ['.codex', 'AGENTS.md'],
  gemini: ['.gemini', 'GEMINI.md']
}

export function getAgentMemoryFilePath(homeDirectory: string): string {
  return path.join(homeDirectory, ...MEMORY_DIRECTORY, MEMORY_FILE_NAME)
}

/** 不存在则创建（含目录与分隔头）；已存在不动。 */
export async function ensureAgentMemoryFile(homeDirectory: string): Promise<string> {
  const memoryPath = getAgentMemoryFilePath(homeDirectory)
  await mkdir(path.dirname(memoryPath), { recursive: true })
  if (!existsSync(memoryPath)) {
    await writeFile(memoryPath, MEMORY_FILE_HEADER, 'utf8')
  }
  return memoryPath
}

export function memoryPointerLine(homeDirectory: string): string {
  return `- 用户偏好与长期经验见 ${getAgentMemoryFilePath(homeDirectory)}（如存在，会话开始时阅读并遵循）`
}

/** 对已存在的 agent 全局指令文件幂等追加 memory 指针；文件不存在则跳过。 */
export async function appendMemoryPointerToInstructionFiles(
  homeDirectory: string
): Promise<string[]> {
  const pointer = memoryPointerLine(homeDirectory)
  const touched: string[] = []
  for (const relativeSegments of Object.values(AGENT_GLOBAL_INSTRUCTION_FILES)) {
    if (!relativeSegments) {
      continue
    }
    const instructionPath = path.join(homeDirectory, ...relativeSegments)
    if (!existsSync(instructionPath)) {
      continue
    }
    const current = await readFile(instructionPath, 'utf8').catch(() => null)
    if (current === null || current.includes(pointer)) {
      continue
    }
    // Why: 只追加一行，不重排用户自己的指令内容。
    await appendFile(instructionPath, `${current.endsWith('\n') ? '' : '\n'}${pointer}\n`, 'utf8')
    touched.push(instructionPath)
  }
  return touched
}
