// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createGlobalSettingsFixture } from '../../../../shared/global-settings-test-fixture'
import { getCommitMessageAgentSpec } from '../../../../shared/commit-message-agent-spec'
import { AuxiliaryModelsPane } from './AuxiliaryModelsPane'
import { AuxiliaryModelRouteFields } from './AuxiliaryModelRouteFields'
import { AuxiliaryTaskRunner } from './AuxiliaryTaskRunner'
import { useAppStore } from '../../store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'

vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({})
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  getActiveRuntimeTarget: () => ({ kind: 'local' }),
  callRuntimeRpc: vi.fn()
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('auxiliary settings', () => {
  it('saves host-scoped changes and keeps existing primary-agent profiles', async () => {
    const settings = createGlobalSettingsFixture({
      defaultTuiAgent: 'claude',
      auxiliaryModels: {
        byPrimaryAgent: {
          codex: { review: { agentId: 'claude', modelsByHost: { 'ssh:one': 'private' } } }
        }
      }
    })
    useAppStore.setState({
      settings,
      activeRepoId: null,
      activeWorktreeId: null,
      settingsSearchQuery: ''
    })
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const { container } = render(
      <AuxiliaryModelsPane settings={settings} updateSettings={updateSettings} />
    )
    const change = container.querySelector('#auxiliary-commitMessage button:last-child')
    if (!change) {
      throw new Error('Missing task edit button')
    }
    fireEvent.click(change)
    const input = container.querySelector('#auxiliary-commitMessage-custom-model')
    if (!input) {
      throw new Error('Missing commit model field')
    }
    fireEvent.change(input, { target: { value: 'haiku' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        auxiliaryModels: {
          tasks: { commitMessage: { agentId: 'claude', modelsByHost: { local: 'haiku' } } },
          byPrimaryAgent: settings.auxiliaryModels?.byPrimaryAgent
        }
      })
    )
  })
  it('reports a failed settings write and retains the draft', async () => {
    const settings = createGlobalSettingsFixture({ defaultTuiAgent: 'claude' })
    useAppStore.setState({
      settings,
      activeRepoId: null,
      activeWorktreeId: null,
      settingsSearchQuery: ''
    })
    const { container } = render(
      <AuxiliaryModelsPane
        settings={settings}
        updateSettings={async () => {
          throw new Error('Settings write failed')
        }}
      />
    )
    const change = container.querySelector('#auxiliary-commitMessage button:last-child')
    if (!change) {
      throw new Error('Missing task edit button')
    }
    fireEvent.click(change)
    const input = container.querySelector('#auxiliary-commitMessage-custom-model')
    if (!input) {
      throw new Error('Missing commit model field')
    }
    fireEvent.change(input, { target: { value: 'haiku' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Settings write failed')
    expect(input).toHaveValue('haiku')
  })
  it('does not display an inherited foreign-agent model after switching agents', () => {
    const settings = createGlobalSettingsFixture({ defaultTuiAgent: 'claude' })
    const { container } = render(
      <AuxiliaryModelRouteFields
        id="route"
        settings={settings}
        hostKey="local"
        route={{ agentId: 'codex' }}
        inherited={{ agentId: 'claude', modelsByHost: { local: 'opus' } }}
        guarded={false}
        workflow={false}
        onChange={vi.fn()}
      />
    )
    expect(container.querySelector('#route-custom-model')).toHaveAttribute(
      'placeholder',
      getCommitMessageAgentSpec('codex')?.defaultModelId
    )
  })
  it('executes the draft routing on the selected workspace', async () => {
    const settings = createGlobalSettingsFixture({
      defaultTuiAgent: 'claude',
      auxiliaryModels: {
        tasks: { decomposition: { agentId: 'claude', modelsByHost: { local: 'haiku' } } }
      }
    })
    useAppStore.setState({ settings, activeWorktreeId: 'repo::/workspace' })
    vi.mocked(callRuntimeRpc).mockResolvedValue({ success: true, rawOutput: 'Plan output' })
    render(<AuxiliaryTaskRunner settings={settings} hostKey="local" />)
    fireEvent.change(screen.getByLabelText('Task input'), {
      target: { value: 'Plan the migration' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run task' }))
    await waitFor(() =>
      expect(callRuntimeRpc).toHaveBeenCalledWith(
        { kind: 'local' },
        'auxiliary.generate',
        expect.objectContaining({
          task: 'decomposition',
          worktree: 'id:repo::/workspace',
          resolvedParams: expect.objectContaining({ agentId: 'claude', model: 'haiku' })
        }),
        { timeoutMs: 180_000, expectedEnvironmentPairingRevision: undefined }
      )
    )
    expect(await screen.findByText('Plan output')).toBeVisible()
  })
})
