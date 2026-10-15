import { z } from 'zod'
import type { AuxiliaryGenerationResult } from './auxiliary-model-types'

export type RequirementDiscussionTask = 'research' | 'architecture' | 'review' | 'decomposition'
type DiscussionAnswer = Extract<AuxiliaryGenerationResult, { success: true }>

const Decision = z.object({
  status: z.enum(['ready_to_build', 'needs_clarification', 'blocked']),
  summary: z.string().trim().min(1),
  plan: z.array(z.string().trim().min(1)).min(1).max(50),
  acceptanceCriteria: z.array(z.string().trim().min(1)).min(1).max(50),
  blockingQuestions: z.array(z.string().trim().min(1)).max(20)
})

const DECISION_FORMAT = `仅返回 JSON：{"status":"ready_to_build|needs_clarification|blocked","summary":"结论及分歧处理依据","plan":["实施步骤"],"acceptanceCriteria":["可验证的验收条件"],"blockingQuestions":["未解决的业务决策或证据缺口"]}。只有需求范围明确、证据充足且不存在阻塞问题时才能 ready_to_build。`
const CONTEXT_LIMIT = 128_000
const ANSWER_LIMIT = 64_000

function parseDecision(text: string) {
  const json = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const decision = Decision.parse(JSON.parse(json))
  return decision.blockingQuestions.length && decision.status === 'ready_to_build'
    ? { ...decision, status: 'needs_clarification' as const }
    : decision
}

export async function discussRequirement(args: {
  context: string
  generate: (task: RequirementDiscussionTask, prompt: string) => Promise<AuxiliaryGenerationResult>
}) {
  if (!args.context.trim() || args.context.length > CONTEXT_LIMIT) {
    throw new Error(
      'Provide a non-empty requirement evidence summary of at most 128,000 characters.'
    )
  }
  const stages: { task: RequirementDiscussionTask; answer: DiscussionAnswer }[] = []
  const generate = async (task: RequirementDiscussionTask, instruction: string) => {
    const answer = await args.generate(
      task,
      `${instruction}\n\n需求及当前代码证据：\n${args.context}`
    )
    if (!answer.success) {
      throw new Error(`${task}: ${answer.error}`)
    }
    if (!answer.rawOutput.trim() || answer.rawOutput.length > ANSWER_LIMIT) {
      throw new Error(`${task}: Return a non-empty discussion answer of at most 64,000 characters.`)
    }
    return answer
  }

  const independent = await Promise.allSettled([
    generate(
      'research',
      '独立分析业务意图、需求范围、事实依据、边界场景和缺失信息。只讨论，不修改代码。'
    ),
    generate(
      'architecture',
      '独立分析现有实现与复用路径、架构方案、兼容性和实施风险。只讨论，不修改代码。'
    )
  ])
  const tasks = ['research', 'architecture'] as const
  for (const [index, result] of independent.entries()) {
    if (result.status === 'rejected') {
      throw result.reason instanceof Error ? result.reason : new Error(String(result.reason))
    }
    stages.push({ task: tasks[index], answer: result.value })
  }
  const discussion = stages
    .map(({ task, answer }) => `${task} 意见：\n${answer.rawOutput}`)
    .join('\n\n')
  const review = await generate(
    'review',
    `交叉审查以下独立意见，结合原始证据指出冲突并给出解决依据。禁止通过投票或猜测替用户决定业务取舍。只审核和指导，不修改代码。\n${DECISION_FORMAT}\n\n${discussion}`
  )
  const reviewDecision = parseDecision(review.rawOutput)
  stages.push({ task: 'review', answer: review })
  const synthesis = await generate(
    'decomposition',
    `汇总讨论并制定供原实现 agent 使用的计划和验收标准。保留审核中未解决的阻塞问题，不扩大需求范围，不执行实现。\n${DECISION_FORMAT}\n\n${discussion}\n\n交叉审核：\n${review.rawOutput}`
  )
  const decision = parseDecision(synthesis.rawOutput)
  stages.push({ task: 'decomposition', answer: synthesis })
  return {
    ...decision,
    status:
      reviewDecision.status === 'blocked' || decision.status === 'blocked'
        ? 'blocked'
        : reviewDecision.status === 'needs_clarification' ||
            decision.status === 'needs_clarification'
          ? 'needs_clarification'
          : 'ready_to_build',
    blockingQuestions: [
      ...new Set([...reviewDecision.blockingQuestions, ...decision.blockingQuestions])
    ],
    stages
  }
}
