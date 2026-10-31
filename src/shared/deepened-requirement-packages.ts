/**
 * Deterministic work-package split for a deepened requirement.
 *
 * Why: the deepening rewrite tags every acceptance criterion with a module tag
 * ([数据变更]/[后端]/[前端]/[测试]/[文档]), so splitting is grouping — no second
 * model call, no free-form split that could hallucinate interfaces. Untagged
 * criteria fail safe to a monolithic dispatch instead of being dropped.
 */

import type { RequirementDeepeningBrief } from './requirement-deepening'

export const REQUIREMENT_PACKAGE_TAGS = ['数据变更', '后端', '前端', '测试', '文档'] as const

export type RequirementPackageTag = (typeof REQUIREMENT_PACKAGE_TAGS)[number]

const TAG_PATTERN = new RegExp(`[\\[【](${REQUIREMENT_PACKAGE_TAGS.join('|')})[\\]】]`)

export type RequirementWorkPackage = {
  tag: RequirementPackageTag
  /** Pool-ready title: `[后端] <parent title>`. */
  title: string
  criteria: string[]
  /** Execution-scope note carried on the pool item. */
  note: string
  /** Pool item id: `<parent id>::pkg:<tag>` (distinct pool identity per package). */
  poolItemId: string
}

export type RequirementPackageSplit = {
  packages: RequirementWorkPackage[]
  /** Criteria the model left untagged; any non-empty list forces monolithic dispatch. */
  untaggedCriteria: string[]
  monolithic: boolean
}

export const REQUIREMENT_PACKAGE_SCOPE_MARKER = '【本包范围】'

export function isRequirementPackageTag(value: string): value is RequirementPackageTag {
  return (REQUIREMENT_PACKAGE_TAGS as readonly string[]).includes(value)
}

function tagOf(line: string): RequirementPackageTag | null {
  const match = TAG_PATTERN.exec(line)
  return match ? (match[1] as RequirementPackageTag) : null
}

function isCriterionLine(line: string): boolean {
  const trimmed = line.trim()
  return /^[-*]\s+/.test(trimmed) || /^\d+[.、]\s+/.test(trimmed)
}

/**
 * First prose paragraph of the rewrite (the 目标 statement) reused as each
 * package's global-context line so an executor never loses the overall goal.
 */
function globalGoalOf(rewritten: string): string {
  for (const line of rewritten.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed && !line.startsWith('#') && !isCriterionLine(trimmed) && !tagOf(trimmed)) {
      return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed
    }
  }
  return ''
}

export function composeRequirementPackageNote(args: {
  tag: RequirementPackageTag
  criteria: readonly string[]
  goal: string
  method: string
  gaps: string
}): string {
  const parts = [
    `此条目是拆分后的执行包，只做 ${args.tag} 范围；其余模块由其他包负责，不要越界实现。`,
    args.goal ? `全局目标：${args.goal}` : '',
    `${REQUIREMENT_PACKAGE_SCOPE_MARKER}（${args.tag}）`,
    ...args.criteria.map(
      (criterion) => `- ${criterion.replace(/^[-*]\s+/, '').replace(/^\d+[.、]\s+/, '')}`
    ),
    args.method.trim() ? `接口事实与方法（共享）：\n${args.method.trim()}` : '',
    args.gaps.trim() && args.gaps.trim() !== '无'
      ? `动手前待取证（共享）：\n${args.gaps.trim()}`
      : ''
  ]
  return parts.filter(Boolean).join('\n')
}

export function splitDeepenedRequirement(args: {
  brief: RequirementDeepeningBrief
  requirementTitle?: string
  parentPoolItemId?: string
}): RequirementPackageSplit {
  const tagged = new Map<RequirementPackageTag, string[]>()
  const untagged: string[] = []
  for (const line of args.brief.rewritten.split(/\r?\n/)) {
    if (!isCriterionLine(line)) {
      continue
    }
    const tag = tagOf(line)
    if (tag) {
      const criteria = tagged.get(tag) ?? []
      criteria.push(line.trim())
      tagged.set(tag, criteria)
    } else {
      untagged.push(line.trim())
    }
  }

  const goal = globalGoalOf(args.brief.rewritten)
  const parentTitle = args.requirementTitle?.trim() ?? ''
  const parentPoolItemId = args.parentPoolItemId?.trim() ?? ''
  const packages = REQUIREMENT_PACKAGE_TAGS.flatMap((tag) => {
    const criteria = tagged.get(tag)
    if (!criteria || criteria.length === 0) {
      return []
    }
    return [
      {
        tag,
        title: parentTitle ? `[${tag}] ${parentTitle}` : `[${tag}]`,
        criteria,
        note: composeRequirementPackageNote({
          tag,
          criteria,
          goal,
          method: args.brief.method,
          gaps: args.brief.gaps
        }),
        poolItemId: parentPoolItemId ? `${parentPoolItemId}::pkg:${tag}` : `pkg:${tag}`
      }
    ]
  })

  return {
    packages,
    untaggedCriteria: untagged,
    monolithic: packages.length <= 1 || untagged.length > 0
  }
}
