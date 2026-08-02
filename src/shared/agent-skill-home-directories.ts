import type { TuiAgent } from './types'

/** Home skills root shared by agents with no dedicated root (kimi, cline, ...). */
export const UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY = ['.agents', 'skills'] as const

/**
 * Home-relative global skills directory for every agent that keeps its own root.
 *
 * Why: mirrors the community `skills` CLI's `globalSkillsDir` map so an Orca
 * install and `npx skills add --global` land in the same place. Agents without
 * a verified dedicated root (kimi, cline, aider, codebuff, ante, mimo-code)
 * are covered by UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY instead.
 */
export const AGENT_SKILL_HOME_DIRECTORIES: Partial<Record<TuiAgent, readonly string[]>> = {
  claude: ['.claude', 'skills'],
  codex: ['.codex', 'skills'],
  amp: ['.config', 'agents', 'skills'],
  antigravity: ['.gemini', 'antigravity', 'skills'],
  aug: ['.augment', 'skills'],
  autohand: ['.autohand', 'skills'],
  'command-code': ['.commandcode', 'skills'],
  continue: ['.continue', 'skills'],
  copilot: ['.copilot', 'skills'],
  crush: ['.config', 'crush', 'skills'],
  cursor: ['.cursor', 'skills'],
  devin: ['.config', 'devin', 'skills'],
  droid: ['.factory', 'skills'],
  gemini: ['.gemini', 'skills'],
  goose: ['.config', 'goose', 'skills'],
  grok: ['.grok', 'skills'],
  hermes: ['.hermes', 'skills'],
  kilo: ['.kilocode', 'skills'],
  kiro: ['.kiro', 'skills'],
  'mistral-vibe': ['.vibe', 'skills'],
  omp: ['.omp', 'agent', 'skills'],
  openclaw: ['.openclaw', 'skills'],
  opencode: ['.config', 'opencode', 'skills'],
  pi: ['.pi', 'agent', 'skills'],
  'qwen-code': ['.qwen', 'skills'],
  rovo: ['.rovodev', 'skills'],
  trae: ['.trae-cn', 'skills']
}
