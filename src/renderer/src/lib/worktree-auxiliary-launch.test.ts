import { afterEach, describe, expect, it, vi } from 'vitest'

const call = vi.fn()
const ownerSettings = vi.fn()
const state = { settings: { activeRuntimeEnvironmentId: 'focused-other-host' } }
vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))
vi.mock('./worktree-runtime-owner', () => ({
  getSettingsForWorktreeRuntimeOwner: (...args: unknown[]) => ownerSettings(...args)
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: (...args: unknown[]) => call(...args),
  getActiveRuntimeTarget: (settings: { activeRuntimeEnvironmentId: string }) => ({
    kind: 'environment',
    environmentId: settings.activeRuntimeEnvironmentId
  })
}))

import { resolveWorktreeAuxiliaryLaunch } from './worktree-auxiliary-launch'

afterEach(() => vi.clearAllMocks())

describe('workspace auxiliary launch route', () => {
  it('resolves the review model on the workspace owner instead of the focused host', async () => {
    ownerSettings.mockReturnValue({ activeRuntimeEnvironmentId: 'workspace-owner' })
    call.mockResolvedValue({ agentId: 'codex', modelId: 'owner-review-model', hostKey: 'local' })
    const result = await resolveWorktreeAuxiliaryLaunch({
      worktreeId: 'folder:one',
      task: 'review',
      primaryAgent: 'kimi',
      agentOverride: 'codex'
    })
    expect(ownerSettings).toHaveBeenCalledWith(state, 'folder:one')
    expect(call).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'workspace-owner' },
      'auxiliary.resolveLaunch',
      { worktree: 'id:folder:one', task: 'review', primaryAgent: 'kimi', agentOverride: 'codex' }
    )
    expect(result.modelId).toBe('owner-review-model')
  })
})
