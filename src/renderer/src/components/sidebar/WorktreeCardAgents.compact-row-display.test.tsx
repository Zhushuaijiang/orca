import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { makePaneKey } from '../../../../shared/stable-pane-id'

const LEAF_A = '11111111-1111-4111-8111-111111111111'

type MockAgentOptions = {
  paneKey?: string
  tabId?: string
  agentType?: string
  rowSource?: DashboardAgentRowData['rowSource']
  state?: string
  startedAt?: number
  prompt?: string
  lastAssistantMessage?: string
  stateStartedAt?: number
  terminalHandle?: string
  orchestration?: {
    parentPaneKey?: string
    parentTerminalHandle?: string
    coordinatorHandle?: string
  }
  lineage?: {
    depth: number
    isFirstSibling: boolean
    isLastSibling: boolean
    childCount: number
  }
}

function mockAgent({
  paneKey = 'tab-1:1',
  tabId = paneKey.split(':')[0],
  agentType,
  rowSource,
  state = 'working',
  startedAt,
  prompt,
  lastAssistantMessage,
  stateStartedAt = 1000,
  terminalHandle,
  orchestration,
  lineage
}: MockAgentOptions = {}): unknown {
  return {
    paneKey,
    tab: { id: tabId },
    agentType,
    rowSource,
    state,
    startedAt,
    entry: {
      prompt,
      lastAssistantMessage,
      state,
      stateStartedAt,
      stateHistory: prompt === undefined ? undefined : [],
      terminalHandle,
      orchestration
    },
    lineage
  }
}

let mockAgents: unknown[] = [mockAgent()]
// The hook records behind mockAgents; the unread (bold) rule reads them.
let mockAgentStatusByPaneKey: Record<string, { stateStartedAt: number }> = {}
let mockFocusedAgentPaneKey: string | null = null
let mockAgentActivityDisplayMode: 'compact' | 'full' | undefined
let mockPromptCacheTimerEnabled = true
let mockPromptCacheTtlMs = 60_000
let mockCacheTimerByKey: Record<string, number | null> = {}
let capturedRowActivations: {
  paneKey: string
  onActivate: (tabId: string, paneKey: string) => void
}[] = []

const activationMocks = vi.hoisted(() => ({
  activateAndRevealWorktree: vi.fn(),
  activateTabAndFocusPane: vi.fn()
}))

// Why: the fork's retained-row activation reads the store imperatively, so the mock needs getState (same shape as WorktreeCardAgents.activation.test.tsx).
const buildMockStoreState = () => ({
  agentActivityDisplayMode: mockAgentActivityDisplayMode,
  acknowledgedAgentsByPaneKey: {},
  cacheTimerByKey: mockCacheTimerByKey,
  dropAgentStatus: vi.fn(),
  dismissRetainedAgent: vi.fn(),
  acknowledgeAgents: vi.fn(),
  agentSendPopoverTargetMode: null,
  agentStatusByPaneKey: mockAgentStatusByPaneKey,
  retainedAgentsByPaneKey: {},
  tabsByWorktree: {},
  terminalLayoutsByTabId: {},
  sendPromptToSidebarAgentTarget: vi.fn(),
  settings: {
    promptCacheTimerEnabled: mockPromptCacheTimerEnabled,
    promptCacheTtlMs: mockPromptCacheTtlMs
  }
})
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector(buildMockStoreState()),
    { getState: () => buildMockStoreState() }
  )
}))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: activationMocks.activateAndRevealWorktree
}))

vi.mock('@/lib/activate-tab-and-focus-pane', () => ({
  activateTabAndFocusPane: activationMocks.activateTabAndFocusPane
}))

vi.mock('./useWorktreeAgentRows', () => ({
  useWorktreeAgentRows: vi.fn(() => mockAgents)
}))

vi.mock('@/hooks/use-now', () => ({
  useNow: vi.fn(() => 2000)
}))

vi.mock('./prompt-cache-countdown-clock', () => ({
  usePromptCacheCountdownNow: vi.fn(() => 10_000)
}))

vi.mock('@/components/dashboard/DashboardAgentRow', () => ({
  default: ({
    agent,
    isFocusedPane,
    sendTargetStatus,
    sendTargetDisabledReason,
    onSendTargetClick,
    childAgentCount,
    childAgentsExpanded,
    onToggleChildAgents,
    onActivate
  }: {
    agent: { paneKey: string }
    isFocusedPane?: boolean
    sendTargetStatus?: 'eligible' | 'disabled' | 'sending'
    sendTargetDisabledReason?: string
    onSendTargetClick?: (paneKey: string) => void
    childAgentCount?: number
    childAgentsExpanded?: boolean
    onToggleChildAgents?: () => void
    onActivate: (tabId: string, paneKey: string) => void
  }) => {
    capturedRowActivations.push({ paneKey: agent.paneKey, onActivate })
    return (
      <div
        data-testid="agent-row"
        data-focused={isFocusedPane ? 'true' : 'false'}
        data-agent-send-target={sendTargetStatus}
        data-disabled-reason={sendTargetDisabledReason}
        data-has-send-handler={typeof onSendTargetClick === 'function' ? 'true' : 'false'}
        data-pane-key={agent.paneKey}
      >
        {agent.paneKey}
        {typeof childAgentCount === 'number' && childAgentCount > 0 ? (
          <button
            type="button"
            aria-label={`${childAgentsExpanded ? 'Hide' : 'Show'} ${childAgentCount} child ${
              childAgentCount === 1 ? 'agent' : 'agents'
            }`}
            aria-expanded={childAgentsExpanded ?? false}
            onClick={onToggleChildAgents}
          >
            +{childAgentCount}
          </button>
        ) : null}
      </div>
    )
  }
}))

vi.mock('./focused-agent-row-highlight', () => ({
  useFocusedAgentPaneKey: vi.fn(() => mockFocusedAgentPaneKey)
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

describe('WorktreeCardAgents compact row display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAgents = [mockAgent()]
    mockAgentStatusByPaneKey = {}
    mockFocusedAgentPaneKey = null
    mockAgentActivityDisplayMode = undefined
    mockPromptCacheTimerEnabled = true
    mockPromptCacheTtlMs = 60_000
    mockCacheTimerByKey = {}
    capturedRowActivations = []
  })

  it('emphasizes unvisited non-focused compact agent row text', async () => {
    mockAgentActivityDisplayMode = 'compact'
    mockAgentStatusByPaneKey = { 'tab-1:1': { stateStartedAt: 1000 } }
    mockAgents = [
      mockAgent({
        agentType: 'codex',
        startedAt: 1000,
        prompt: 'Run tests',
        lastAssistantMessage: 'Inspecting changes'
      })
    ]
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    const markup = renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)

    expect(markup).toContain('<span class="font-semibold text-foreground">Run tests</span>')
    expect(markup).toContain('<span class="text-muted-foreground/65"> - Inspecting changes</span>')
    expect(markup).not.toContain('data-focused-agent-pane="true"')
    expect(markup).not.toContain('<span class="text-foreground">Run tests</span>')
  })

  it('keeps focused compact agent row text legible', async () => {
    mockAgentActivityDisplayMode = 'compact'
    mockAgentStatusByPaneKey = { 'tab-1:1': { stateStartedAt: 1000 } }
    mockFocusedAgentPaneKey = 'tab-1:1'
    mockAgents = [
      mockAgent({
        agentType: 'codex',
        startedAt: 1000,
        prompt: 'Focused prompt',
        lastAssistantMessage: 'Reading output'
      })
    ]
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    const markup = renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)

    expect(markup).toContain('data-focused-agent-pane="true"')
    expect(markup).toContain('<span class="font-semibold text-foreground">Focused prompt</span>')
    expect(markup).toContain('<span class="text-foreground/70"> - Reading output</span>')
    expect(markup).not.toContain('<span class="text-muted-foreground/90">Focused prompt</span>')
  })

  it('shows a matching pane prompt-cache timer before the compact row age', async () => {
    mockAgentActivityDisplayMode = 'compact'
    const paneKey = makePaneKey('tab-1', LEAF_A)
    mockAgents = [
      mockAgent({
        paneKey,
        tabId: 'tab-1',
        agentType: 'claude',
        startedAt: 1000,
        prompt: 'Resume Claude'
      })
    ]
    mockCacheTimerByKey = { [paneKey]: 10_000 }
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    const markup = renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)
    const timerIndex = markup.indexOf('Prompt cache expires in 1:00')
    const ageIndex = markup.indexOf('>now</span>')

    expect(timerIndex).toBeGreaterThanOrEqual(0)
    expect(ageIndex).toBeGreaterThanOrEqual(0)
    expect(timerIndex).toBeLessThan(ageIndex)
  })

  it('does not show a prompt-cache timer on a nonmatching compact row', async () => {
    mockAgentActivityDisplayMode = 'compact'
    const paneKey = makePaneKey('tab-1', LEAF_A)
    const otherPaneKey = makePaneKey('tab-1', '22222222-2222-4222-8222-222222222222')
    mockAgents = [
      mockAgent({
        paneKey,
        tabId: 'tab-1',
        agentType: 'claude',
        startedAt: 1000,
        prompt: 'No timer here'
      })
    ]
    mockCacheTimerByKey = { [otherPaneKey]: 10_000 }
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    const markup = renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)

    expect(markup).toContain('No timer here')
    expect(markup).not.toContain('Prompt cache expires')
  })

  it('does not show a prompt-cache timer when the feature is disabled', async () => {
    mockAgentActivityDisplayMode = 'compact'
    mockPromptCacheTimerEnabled = false
    const paneKey = makePaneKey('tab-1', LEAF_A)
    mockAgents = [
      mockAgent({
        paneKey,
        tabId: 'tab-1',
        agentType: 'claude',
        startedAt: 1000,
        prompt: 'Disabled timer'
      })
    ]
    mockCacheTimerByKey = { [paneKey]: 10_000 }
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')

    const markup = renderToStaticMarkup(<WorktreeCardAgents worktreeId="wt-1" />)

    expect(markup).toContain('Disabled timer')
    expect(markup).not.toContain('Prompt cache expires')
  })

  it('keeps hidden retained compact rows from rendering prompt-cache timers', async () => {
    const paneKey = makePaneKey('tab-1', LEAF_A)
    mockCacheTimerByKey = { [paneKey]: 10_000 }
    const { CompactAgentRow } = await import('./worktree-card-compact-agents')

    const markup = renderToStaticMarkup(
      <CompactAgentRow
        agent={
          mockAgent({
            paneKey,
            tabId: 'tab-1',
            agentType: 'claude',
            startedAt: 1000,
            prompt: 'Collapsed child'
          }) as DashboardAgentRowData
        }
        now={2000}
        onActivate={vi.fn()}
        cacheTimerActive={false}
      />
    )

    expect(markup).toContain('Collapsed child')
    expect(markup).not.toContain('Prompt cache expires')
  })
})
