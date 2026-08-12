import { describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../shared/types'

const { state } = vi.hoisted(() => ({
  state: {
    projectHostSetups: [],
    settings: {
      defaultTuiAgent: 'codex',
      disabledTuiAgents: []
    }
  }
}))

vi.mock('@/store', () => ({
  useAppStore: { getState: () => state }
}))

vi.mock('@/lib/agent-catalog', () => ({
  getAgentCatalog: () => [{ id: 'codex' }]
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

import { buildTodoPoolAutomationInput } from './yunxiao-todo-pool-automation'

const repo: Repo = {
  id: 'yunxiao-repo',
  path: '/workspace/yunxiao',
  displayName: 'yunxiao',
  badgeColor: '#000',
  addedAt: 1
}

describe('Yunxiao todo pool automation', () => {
  it('creates a fresh workspace for every claimed work item', () => {
    const input = buildTodoPoolAutomationInput({ repo })

    expect(input).toMatchObject({
      projectId: repo.id,
      workspaceMode: 'new_per_run',
      workspaceId: null,
      reuseSession: false
    })
  })
})
