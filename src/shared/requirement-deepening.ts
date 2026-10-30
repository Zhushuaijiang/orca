/**
 * Requirement deepening: turn a thin requirement into a narrower, verifiable prompt.
 *
 * Why: the four "deeper not bigger" questions are all additive, so without a hard
 * subtraction budget and an external acceptance oracle the rewrite only inflates. The
 * prompt and the parser below enforce both, and keep the original text for audit.
 */

export const REQUIREMENT_DEEPENING_GROWTH_LIMIT = 1.2

export const REQUIREMENT_DEEPENING_SECTIONS = {
  delta: '1. 领域增量',
  sources: '2. 一手素材',
  method: '3. 方法与工具',
  oracle: '4. 独立裁判',
  rewritten: '重写稿',
  dropped: '删除清单',
  gaps: '待取证'
} as const

export type RequirementDeepeningSection = keyof typeof REQUIREMENT_DEEPENING_SECTIONS

export type RequirementDeepeningBrief = Record<RequirementDeepeningSection, string>

export type RequirementDeepeningParseResult = {
  brief: RequirementDeepeningBrief
  missingSections: RequirementDeepeningSection[]
}

export type RequirementDeepeningInput = {
  title?: string
  body: string
  /** Extra context the caller already holds, e.g. repo names or prior decisions. */
  context?: string
}

const SECTION_BY_TITLE = new Map<string, RequirementDeepeningSection>(
  Object.entries(REQUIREMENT_DEEPENING_SECTIONS).map(([section, title]) => [
    title.toLowerCase(),
    section as RequirementDeepeningSection
  ])
)

const EMPTY_BRIEF = (): RequirementDeepeningBrief => ({
  delta: '',
  sources: '',
  method: '',
  oracle: '',
  rewritten: '',
  dropped: '',
  gaps: ''
})

export function buildRequirementDeepeningPrompt(input: RequirementDeepeningInput): string {
  const title = input.title?.trim() ?? ''
  const context = input.context?.trim()
  return `你是需求编译器。把下面这条需求改写成一份"更深入、而不是更大"的执行提示词。

硬约束：
1. 只允许压缩与澄清，不允许净增范围。重写稿的字符数不超过原文的 ${REQUIREMENT_DEEPENING_GROWTH_LIMIT} 倍；新增条目必须先在【1. 领域增量】里出现，并说明它防止哪种失败。
2. 每一问都要具体到可执行，禁止"深入分析""全面考虑""注意兼容性"这类空话。
3. 无法从现有材料确认的内容不要编，逐条写进【待取证】。
4. 每条验收标准后面用括号标注独立裁判，只能取这几类：数据库查询 / 第三方回执 / 标准条款 / 具名专家 / 历史黄金样本。不接受"测试通过""我认为""代码已改"。

严格使用下面的标题，顺序不变，不要增删标题，不要写标题以外的开场白：

## 1. 领域增量
本领域顶尖从业者会做、而我没要求的事。每条写成：做什么 | 防止哪种失败 | 成本 | 本轮做/延后/不做。

## 2. 一手素材
他们会从哪些原始材料开始（生产库、旧系统代码、原始报文、客户原图、线上日志），而不是我这份已被转述的需求；并指出我给出的哪些内容属于二手加工。

## 3. 方法与工具
具体到可执行的命令、查询语句、文件路径、接口名。给不出具体项就写"待取证"。

## 4. 独立裁判
逐条验收标准由谁判定：裁判类型 + 具体取数或取证人。

## 重写稿
可以直接交给执行模型的需求正文，包含：目标、范围（含明确不做什么）、验收标准（每条带裁判）、约束。不要包含分析过程。

## 删除清单
我原文里被删掉或延后的内容 + 理由。没有就写"无"。

## 待取证
动手前必须先查清的事项，每条写成"待取证：<查什么> / 在哪查"。没有就写"无"。

原始需求标题：${title || '（未提供）'}
原始需求正文：
${input.body.trim()}
${context ? `\n补充上下文：\n${context}\n` : ''}`
}

/**
 * A heading may carry its content on the same line ("**1. 领域增量**：无"), which a
 * plain line-by-line heading match would drop.
 */
function matchSectionHeading(
  line: string
): { section: RequirementDeepeningSection; inlineContent: string } | null {
  const stripped = line
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\*\*/, '')
  for (const [title, section] of SECTION_BY_TITLE) {
    const prefixed = stripped.toLowerCase()
    if (!prefixed.startsWith(title)) {
      continue
    }
    const inlineContent = stripped
      .slice(title.length)
      .replace(/^\*\*/, '')
      .replace(/^[：:]\s*/, '')
      .trim()
    return { section, inlineContent }
  }
  return null
}

export function parseRequirementDeepeningOutput(rawText: string): RequirementDeepeningParseResult {
  const brief = EMPTY_BRIEF()
  const found = new Set<RequirementDeepeningSection>()
  let current: RequirementDeepeningSection | null = null
  const buffers = new Map<RequirementDeepeningSection, string[]>()

  for (const line of rawText.split(/\r?\n/)) {
    const heading = matchSectionHeading(line)
    if (heading) {
      current = heading.section
      found.add(heading.section)
      if (heading.inlineContent) {
        buffers.set(heading.section, [heading.inlineContent])
      }
      continue
    }
    if (current) {
      const buffer = buffers.get(current) ?? []
      buffer.push(line)
      buffers.set(current, buffer)
    }
  }

  for (const [section, lines] of buffers) {
    brief[section] = lines.join('\n').trim()
  }

  return {
    brief,
    missingSections: (
      Object.keys(REQUIREMENT_DEEPENING_SECTIONS) as RequirementDeepeningSection[]
    ).filter((section) => !found.has(section))
  }
}

export function getRequirementGrowthRatio(original: string, rewritten: string): number {
  const originalLength = original.trim().length
  if (originalLength === 0) {
    return rewritten.trim().length === 0 ? 0 : Number.POSITIVE_INFINITY
  }
  return rewritten.trim().length / originalLength
}

export function exceedsRequirementGrowthLimit(original: string, rewritten: string): boolean {
  return getRequirementGrowthRatio(original, rewritten) > REQUIREMENT_DEEPENING_GROWTH_LIMIT
}

/**
 * Description written back to the ticket: the rewrite is what the agent reads, the
 * original stays attached so a bad rewrite can always be compared and reverted.
 */
export function composeDeepenedRequirementDescription(args: {
  rewrittenPrompt: string
  evidenceGaps?: string
  original: string
}): string {
  const rewritten = args.rewrittenPrompt.trim()
  const gaps = args.evidenceGaps?.trim() ?? ''
  const original = args.original.trim()
  const parts = [rewritten]
  if (gaps && gaps !== '无') {
    parts.push(`### 待取证\n${gaps}`)
  }
  if (original && rewritten !== original) {
    parts.push(`---\n**原始需求（深化前，留档）**\n\n${original}`)
  }
  return parts.join('\n\n')
}

export function hasDeepeningEvidenceGaps(description: string): boolean {
  const parsed = parseRequirementDeepeningOutput(description)
  const gaps = parsed.brief.gaps
  return Boolean(gaps && gaps !== '无')
}
