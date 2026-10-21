import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequirementReviewRecord } from '../../../shared/requirement-review'

const entry = {
  agentType: 'claude',
  state: 'done',
  providerSession: { id: 'original' },
  stateStartedAt: 10,
  turnStartedAt: 5
}
const state = {
  agentStatusByPaneKey: { pane: entry },
  getKnownWorktreeById: () => ({ requirementReviews: reviews })
}
let reviews: Record<string, RequirementReviewRecord> = {}
const launch = vi.fn()
const save = vi.fn()
const success = vi.fn()
let select: (() => void) | undefined
const live = { reviews: {} }
vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (value: typeof state) => unknown) => selector(state), {
    getState: () => state
  })
}))
vi.mock('@/lib/requirement-review-state', () => ({
  useRequirementReviewState: Object.assign(
    (selector: (value: typeof live) => unknown) => selector(live),
    { getState: () => ({ update: vi.fn() }) }
  ),
  saveRequirementReview: (...args: unknown[]) => save(...args)
}))
vi.mock('@/lib/yunxiao-review-handoff-launch', () => ({
  launchSessionRequirementReview: (...args: unknown[]) => launch(...args)
}))
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => success(...args), error: vi.fn() }
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled
  }: {
    children: React.ReactNode
    onSelect?: () => void
    disabled?: boolean
  }) => {
    select = disabled ? undefined : onSelect
    return <button disabled={disabled}>{children}</button>
  }
}))
import { RequirementReviewMenuItems } from './requirement-review-menu-items'

function render() {
  return renderToStaticMarkup(
    <RequirementReviewMenuItems worktreeId="folder:workspace" paneKey="pane" />
  )
}

describe('requirement review menu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reviews = {}
    entry.state = 'done'
    entry.providerSession.id = 'original'
    entry.stateStartedAt = 10
    entry.turnStartedAt = 5
    save.mockResolvedValue(undefined)
    launch.mockResolvedValue(undefined)
  })

  it('starts a review for the exact clicked session', async () => {
    expect(render()).toContain('Discuss requirement (up to 3 rounds)')
    select?.()
    expect(launch).toHaveBeenCalledWith('folder:workspace', 'pane')
  })

  it('restores a final review and only reports confirmation after persistence succeeds', async () => {
    reviews.pane = { round: 3, phase: 'awaiting_confirmation', sessionId: 'original', updatedAt: 1 }
    expect(render()).toContain('Confirm discussion consensus')
    select?.()
    expect(success).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(success).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledWith(
      'folder:workspace',
      'pane',
      expect.objectContaining({ phase: 'confirmed' })
    )
  })

  it('does not confirm a different provider session', () => {
    reviews.pane = {
      round: 3,
      phase: 'awaiting_confirmation',
      sessionId: 'old-session',
      updatedAt: 1
    }
    expect(render()).not.toContain('Confirm discussion consensus')
  })

  it('discards pending consensus after a new turn in the same session', () => {
    reviews.pane = {
      round: 3,
      phase: 'awaiting_confirmation',
      sessionId: 'original',
      reviewedTurnStartedAt: 4,
      updatedAt: 1
    }
    expect(render()).not.toContain('Confirm discussion consensus')
    expect(render()).toContain('Discuss requirement (up to 3 rounds)')
  })

  it('rechecks the turn when a previously opened confirmation item is selected', () => {
    reviews.pane = {
      round: 3,
      phase: 'awaiting_confirmation',
      sessionId: 'original',
      reviewedTurnStartedAt: 5,
      updatedAt: 1
    }
    render()
    entry.turnStartedAt = 6
    select?.()
    expect(save).not.toHaveBeenCalled()
  })

  it('does not confirm while the original agent is working', () => {
    reviews.pane = {
      round: 3,
      phase: 'awaiting_confirmation',
      sessionId: 'original',
      reviewedTurnStartedAt: 5,
      updatedAt: 1
    }
    entry.state = 'working'
    render()
    expect(select).toBeUndefined()
  })

  it('allows a new review after a renderer restart interrupted an active cycle', () => {
    reviews.pane = { round: 2, phase: 'reviewing', sessionId: 'original', updatedAt: 1 }
    expect(render()).toContain('Discuss requirement (up to 3 rounds)')
    expect(select).toBeDefined()
  })

  it('does not report successful confirmation after a rejected save', async () => {
    save.mockRejectedValue(new Error('old host'))
    reviews.pane = { round: 3, phase: 'awaiting_confirmation', sessionId: 'original', updatedAt: 1 }
    render()
    select?.()
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(success).not.toHaveBeenCalled()
  })
})
