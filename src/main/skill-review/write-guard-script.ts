/**
 * Kimi PreToolUse 写保护 hook 脚本源码。运行时被 review-runner 写入评审专用
 * staging home 后由 `node <path> --roots-file <path>` 调用（同 agent-hooks
 * managed-script 模式：源码内嵌，无打包路径依赖）。
 * 协议：stdin 收 hook JSON；exit 0 放行，exit 2 拒绝（stderr 为原因）。
 */
export const SKILL_REVIEW_WRITE_GUARD_SCRIPT = `#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

function deny(reason) {
  console.error(reason)
  process.exit(2)
}

function readRootsFile() {
  const flagIndex = process.argv.indexOf('--roots-file')
  if (flagIndex < 0 || !process.argv[flagIndex + 1]) {
    deny('skill-review-write-guard: missing --roots-file')
  }
  try {
    const parsed = JSON.parse(readFileSync(process.argv[flagIndex + 1], 'utf8'))
    return {
      directories: Array.isArray(parsed.directories) ? parsed.directories : [],
      files: Array.isArray(parsed.files) ? parsed.files : []
    }
  } catch {
    deny('skill-review-write-guard: roots file unreadable')
  }
}

// Realpath the nearest existing ancestor so symlinked parents can't smuggle a
// write outside the roots; non-existent tails are appended verbatim.
function canonicalize(candidate) {
  let current = candidate
  const tail = []
  while (!existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) {
      return candidate
    }
    tail.unshift(path.basename(current))
    current = parent
  }
  const real = realpathSync(current)
  return path.join(real, ...tail)
}

function isAllowed(candidate, roots) {
  const canonical = canonicalize(candidate)
  for (const file of roots.files) {
    if (canonical === canonicalize(file)) {
      return true
    }
  }
  for (const directory of roots.directories) {
    const root = canonicalize(directory)
    if (canonical === root || canonical.startsWith(root + path.sep)) {
      return true
    }
  }
  return false
}

let input = ''
process.stdin.on('data', (chunk) => {
  input += chunk
})
process.stdin.on('end', () => {
  let payload
  try {
    payload = JSON.parse(input)
  } catch {
    process.exit(0) // malformed payload: fail open like a hook error
  }
  const toolName = payload.tool_name ?? payload.toolName ?? ''
  const toolInput = payload.tool_input ?? payload.toolInput ?? {}

  if (toolName === 'Bash') {
    deny('skill-review: shell 已禁用，请用 Read/Write/Edit 工具完成评审写入')
  }
  if (!WRITE_TOOLS.has(toolName)) {
    process.exit(0)
  }
  const target = toolInput.file_path ?? toolInput.path ?? toolInput.notebook_path
  if (typeof target !== 'string' || target.length === 0) {
    process.exit(0)
  }
  const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd()
  const candidate = path.isAbsolute(target) ? target : path.resolve(cwd, target)
  if (!isAllowed(candidate, readRootsFile())) {
    deny('skill-review: 只允许写入技能目录与 MEMORY.md，已拒绝: ' + target)
  }
  process.exit(0)
})
`
