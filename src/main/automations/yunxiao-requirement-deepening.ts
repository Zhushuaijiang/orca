import type { TuiAgent } from '../../shared/tui-agent'
import {
  buildRequirementDeepeningPrompt,
  composeDeepenedRequirementDescription,
  exceedsRequirementGrowthLimit,
  isDeepenedRequirementDescription,
  parseRequirementDeepeningOutput
} from '../../shared/requirement-deepening'

export type RequirementDeepeningOutcome = 'deepened' | 'skipped' | 'failed'

export type RequirementDeepeningDeps = {
  readDescription: (workItemId: string) => Promise<string | null>
  generate: (prompt: string, worktreePath: string, primaryAgent: TuiAgent) => Promise<string | null>
  writeDescription: (workItemId: string, description: string) => Promise<void>
}

let dispatchDeps: RequirementDeepeningDeps | null = null

/** Runtime wiring for every todo pool dispatch; null keeps the raw ticket text. */
export function setRequirementDeepeningDeps(deps: RequirementDeepeningDeps | null): void {
  dispatchDeps = deps
}

export function getRequirementDeepeningDeps(): RequirementDeepeningDeps | null {
  return dispatchDeps
}

export type RequirementDeepeningTarget = {
  workItemId: string
  title: string
  worktreePath: string
  primaryAgent: TuiAgent
}

/** Deepen one claimed ticket before its agent starts; never throws, never blocks dispatch. */
export async function deepenRequirementBeforeDispatch(
  target: RequirementDeepeningTarget,
  deps: RequirementDeepeningDeps
): Promise<RequirementDeepeningOutcome> {
  try {
    const original = (await deps.readDescription(target.workItemId))?.trim() ?? ''
    if (!original || isDeepenedRequirementDescription(original)) {
      return 'skipped'
    }
    const raw = await deps.generate(
      buildRequirementDeepeningPrompt({ title: target.title, body: original }),
      target.worktreePath,
      target.primaryAgent
    )
    const { brief } = parseRequirementDeepeningOutput(raw ?? '')
    const rewritten = brief.rewritten.trim()
    // Why: the compiler's contract is deeper, not bigger, so inflated rewrites are rejected.
    if (!rewritten || exceedsRequirementGrowthLimit(original, rewritten)) {
      return 'failed'
    }
    await deps.writeDescription(
      target.workItemId,
      composeDeepenedRequirementDescription({
        rewrittenPrompt: rewritten,
        evidenceGaps: brief.gaps,
        original
      })
    )
    return 'deepened'
  } catch {
    return 'failed'
  }
}

export async function deepenClaimedRequirements(
  targets: readonly RequirementDeepeningTarget[],
  deps: RequirementDeepeningDeps
): Promise<RequirementDeepeningOutcome[]> {
  const outcomes: RequirementDeepeningOutcome[] = []
  for (const target of targets) {
    outcomes.push(await deepenRequirementBeforeDispatch(target, deps))
  }
  return outcomes
}
