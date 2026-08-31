import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

import { WorktreeVaultSessionRestoreMenuItems } from './WorktreeVaultSessionRestoreMenuItems'

function session(sessionId: string): AiVaultSession {
  return {
    id: `local:kimi:${sessionId}`,
    executionHostId: 'local',
    agent: 'kimi',
    sessionId,
    title: 'Generic automation title',
    cwd: '/repo/orca',
    branch: null,
    model: null,
    filePath: `/logs/${sessionId}.jsonl`,
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-08-31T00:00:00.000Z',
    messageCount: 1,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: `kimi --session '${sessionId}'`,
    subagent: null
  }
}

describe('WorktreeVaultSessionRestoreMenuItems', () => {
  it('shows provider session ids for workspace-scoped restore candidates', () => {
    const markup = renderToStaticMarkup(
      <WorktreeVaultSessionRestoreMenuItems
        canRestoreSession
        isDeleting={false}
        onRestoreSession={() => {}}
        onRestoreSpecificSession={() => {}}
        sessions={[session('session-workspace-1'), session('session-workspace-2')]}
      />
    )

    expect(markup).toContain('font-mono text-sm">session-workspace-1</span>')
    expect(markup).toContain('font-mono text-sm">session-workspace-2</span>')
  })
})
