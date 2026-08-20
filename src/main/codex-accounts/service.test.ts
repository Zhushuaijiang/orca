import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createManagedHome,
  createRateLimits,
  createRuntimeHome,
  createSettings,
  createStore,
  registerCodexAccountsTestHomes,
  testState
} from './service-test-harness'
import { createCanonicalHookTrustFixture } from './service-hook-trust-test-fixtures'

vi.mock('electron', () => ({
  app: {
    getPath: () => testState.userDataDir
  }
}))

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os') // eslint-disable-line @typescript-eslint/consistent-type-imports -- vi.importActual requires inline import()
  return {
    ...actual,
    homedir: () => testState.fakeHomeDir
  }
})

function createSettings(overrides: Partial<GlobalSettings> = {}): GlobalSettings {
  const appFontFamily = overrides.appFontFamily ?? 'Geist'
  const agentStatusHooksEnabled = overrides.agentStatusHooksEnabled ?? true
  const tabAutoGenerateTitle = overrides.tabAutoGenerateTitle ?? false
  return {
    workspaceDir: testState.fakeHomeDir,
    nestWorkspaces: false,
    refreshLocalBaseRefOnWorktreeCreate: false,
    localBaseRefSuggestionDismissed: false,
    autoRenameBranchFromWork: false,
    branchPrefix: 'git-username',
    branchPrefixCustom: '',
    theme: 'system',
    uiLanguage: 'system',
    appIcon: overrides.appIcon ?? 'classic',
    editorAutoSave: false,
    editorAutoSaveDelayMs: 1000,
    editorMinimapEnabled: false,
    markdownReviewToolsEnabled: true,
    terminalFontSize: 14,
    terminalFontFamily: 'JetBrains Mono',
    terminalFontWeight: 500,
    terminalLineHeight: 1,
    terminalScrollSensitivity: 1.15,
    terminalFastScrollSensitivity: 5,
    terminalTuiScrollSensitivity: 1,
    terminalGpuAcceleration: 'auto',
    terminalLigatures: 'auto',
    terminalCursorStyle: 'block',
    terminalCursorBlink: false,
    terminalThemeDark: 'orca-dark',
    terminalDividerColorDark: '#000000',
    terminalUseSeparateLightTheme: false,
    terminalThemeLight: 'orca-light',
    terminalDividerColorLight: '#ffffff',
    terminalInactivePaneOpacity: 0.5,
    terminalActivePaneOpacity: 1,
    terminalPaneOpacityTransitionMs: 150,
    terminalDividerThicknessPx: 1,
    terminalRightClickToPaste: false,
    terminalFocusFollowsMouse: false,
    terminalClipboardOnSelect: false,
    terminalAllowOsc52Clipboard: true,
    setupScriptLaunchMode: 'split-vertical',
    terminalScrollbackRows: 5_000,
    localAccountRuntime: 'host',
    localAccountWslDistro: null,
    openLinksInApp: false,
    openLinksInAppPreferencePrompted: false,
    rightSidebarOpenByDefault: true,
    sourceControlViewMode: 'list',
    sourceControlGroupOrder: 'changes-first',
    sourceControlCompareAgainstUpstream: false,
    showTitlebarAppName: true,
    showTasksButton: true,
    floatingTerminalEnabled: false,
    floatingTerminalCwd: '~',
    floatingTerminalTriggerLocation: 'floating-button',
    diffDefaultView: 'inline',
    combinedDiffFileTreeVisibleByDefault: false,
    prBotAuthorOverrides: [],
    notifications: {
      enabled: true,
      agentTaskComplete: true,
      terminalBell: false,
      suppressWhenFocused: true,
      customSoundId: 'system',
      customSoundPath: null,
      customSoundVolume: 100
    },
    promptCacheTimerEnabled: false,
    promptCacheTtlMs: 300_000,
    codexManagedAccounts: [],
    activeCodexManagedAccountId: null,
    claudeManagedAccounts: [],
    activeClaudeManagedAccountId: null,
    terminalScopeHistoryByWorktree: true,
    defaultTuiAgent: null,
    disabledTuiAgents: [],
    pluginSystemEnabled: false,
    disabledPlugins: [],
    pluginConsents: {},
    devPluginPaths: [],
    skipDeleteWorktreeConfirm: false,
    skipCloseTerminalWithRunningProcessConfirm: false,
    skipDeleteAutomationConfirm: false,
    skipDeleteArtifactConfirm: false,
    skipCodexRateLimitResetConfirm: false,
    defaultTaskViewPreset: 'all',
    defaultTaskSource: 'gitlab',
    visibleTaskProviders: ['gitlab', 'yunxiao', 'code-merge'],
    visibleTaskProvidersDefaultedForJira: true,
    visibleTaskProvidersDefaultedForYunxiao: true,
    visibleTaskProvidersDefaultedForCodeMerge: true,
    defaultRepoSelection: null,
    defaultLinearTeamSelection: null,
    opencodeSessionCookie: '',
    opencodeWorkspaceId: '',
    minimaxGroupId: '',
    minimaxUsageModels: 'general',
    geminiCliOAuthEnabled: false,
    agentCmdOverrides: {},
    keepComputerAwakeWhileAgentsRun: false,
    confirmClosePinnedTab: true,
    terminalMacOptionAsAlt: 'false',
    terminalMacOptionAsAltMigrated: true,
    terminalJISYenToBackslash: false,
    experimentalMobile: false,
    mobileAutoRestoreFitMs: null,
    experimentalPet: false,
    experimentalActivity: true,
    experimentalTerminalAttention: false,
    compactWorktreeCards: false,
    terminalWindowsShell: 'powershell.exe',
    terminalWindowsPowerShellImplementation: 'powershell.exe',
    enableGitHubAttribution: true,
    ...overrides,
    diffWordWrap: overrides.diffWordWrap ?? false,
    localWindowsRuntimeDefault: overrides.localWindowsRuntimeDefault ?? { kind: 'windows-host' },
    leftSidebarAppearanceMode: overrides.leftSidebarAppearanceMode ?? 'default',
    appFontFamily,
    agentStatusHooksEnabled,
    tabAutoGenerateTitle
  }
}

function createStore(settings: GlobalSettings) {
  let resetLedger: CodexResetCreditAttemptLedger = { version: 1, attempts: [] }
  return {
    getSettings: vi.fn(() => settings),
    updateSettings: vi.fn((updates: Partial<GlobalSettings>) => {
      settings = {
        ...settings,
        ...updates,
        notifications: {
          ...settings.notifications,
          ...updates.notifications
        }
      }
      return settings
    }),
    getCodexResetCreditAttemptLedger: vi.fn(() => structuredClone(resetLedger)),
    replaceCodexResetCreditAttemptLedgerAndFlush: vi.fn((next: CodexResetCreditAttemptLedger) => {
      resetLedger = structuredClone(next)
    })
  }
}

function createRateLimits() {
  return {
    refreshForCodexAccountChange: vi.fn().mockResolvedValue(undefined),
    evictInactiveCodexCache: vi.fn()
  }
}

function createRuntimeHome() {
  return {
    syncForCurrentSelection: vi.fn(),
    clearLastWrittenAuthJson: vi.fn(),
    prepareForRateLimitFetch: vi.fn(() => null)
  }
}

function createManagedHome(rootDir: string, accountId: string, config = '', auth = ''): string {
  const managedHomePath = join(rootDir, 'codex-accounts', accountId, 'home')
  mkdirSync(managedHomePath, { recursive: true })
  writeFileSync(join(managedHomePath, '.orca-managed-home'), `${accountId}\n`, 'utf-8')
  if (config) {
    writeFileSync(join(managedHomePath, 'config.toml'), config, 'utf-8')
  }
  if (auth) {
    writeFileSync(join(managedHomePath, 'auth.json'), auth, 'utf-8')
  }
  return managedHomePath
}

async function createCanonicalHookTrustFixture(): Promise<{
  config: string
  orcaKeys: string[]
  userKey: string
}> {
  const { MANAGED_HOOK_TIMEOUT_SECONDS } = await import('../agent-hooks/installer-utils')
  const { getCodexManagedHookInstallMaterial } = await import('../codex/hook-service')
  const { computeTrustKey, computeTrustedHash, escapeTomlString, normalizeHookTrustKeyForLookup } =
    await import('../codex/config-toml-trust')
  const { getCodexHookTrustSignature } = await import('../codex/codex-hook-identity')
  const { writeCodexTrustGrantLedgerHome } = await import('../codex/codex-trust-grant-ledger')
  const sourceHomePath = join(testState.fakeHomeDir, '.codex')
  const sourcePath = join(sourceHomePath, 'hooks.json')
  const material = getCodexManagedHookInstallMaterial()
  const expectedHashEntry = {
    sourcePath,
    eventLabel: 'stop' as const,
    groupIndex: 0,
    handlerIndex: 0,
    command: material.command,
    timeoutSec: MANAGED_HOOK_TIMEOUT_SECONDS
  }
  const ledgerHashEntry = {
    ...expectedHashEntry,
    eventLabel: 'session_start' as const,
    groupIndex: 1
  }
  const userEntry = {
    ...expectedHashEntry,
    groupIndex: 2,
    command: 'user-authored-hook'
  }
  const expectedHashKey = computeTrustKey(expectedHashEntry)
  const ledgerHashKey = computeTrustKey(ledgerHashEntry)
  const userKey = computeTrustKey(userEntry)
  const ledgerTrustedHash = 'sha256:codex-granted-orca-hook'
  writeCodexTrustGrantLedgerHome(sourceHomePath, {
    binary: null,
    entries: {
      [normalizeHookTrustKeyForLookup(ledgerHashKey)]: {
        signature: getCodexHookTrustSignature(ledgerHashEntry),
        trustedHash: ledgerTrustedHash
      }
    }
  })
  const block = (key: string, trustedHash: string): string =>
    `[hooks.state."${escapeTomlString(key)}"]\ntrusted_hash = "${trustedHash}"\nenabled = true`
  return {
    config: [
      'approval_policy = "never"',
      block(expectedHashKey, computeTrustedHash(expectedHashEntry)),
      block(ledgerHashKey, ledgerTrustedHash),
      block(userKey, computeTrustedHash(userEntry))
    ].join('\n\n'),
    orcaKeys: [expectedHashKey, ledgerHashKey],
    userKey
  }
}

describe('CodexAccountService config sync', () => {
  registerCodexAccountsTestHomes()

  it('syncs the canonical ~/.codex/config.toml into managed homes on startup', async () => {
    const canonicalConfigPath = join(testState.fakeHomeDir, '.codex', 'config.toml')
    const canonicalConfig = 'approval_policy = "never"\nsandbox_mode = "danger-full-access"\n'
    writeFileSync(canonicalConfigPath, canonicalConfig, 'utf-8')
    const managedHomePath = createManagedHome(
      testState.userDataDir,
      'account-1',
      'approval_policy = "on-request"\n',
      '{"account":"managed"}\n'
    )
    const settings = createSettings({
      codexManagedAccounts: [
        {
          id: 'account-1',
          email: 'user@example.com',
          managedHomePath,
          providerAccountId: null,
          workspaceLabel: null,
          workspaceAccountId: null,
          createdAt: 1,
          updatedAt: 1,
          lastAuthenticatedAt: 1
        }
      ],
      activeCodexManagedAccountId: 'account-1'
    })
    const store = createStore(settings)
    const rateLimits = createRateLimits()
    const runtimeHome = createRuntimeHome()

    const { CodexAccountService } = await import('./service')
    new CodexAccountService(store as never, rateLimits as never, runtimeHome as never)

    expect(readFileSync(join(managedHomePath, 'config.toml'), 'utf-8')).toBe(canonicalConfig)
    expect(readFileSync(join(managedHomePath, 'auth.json'), 'utf-8')).toBe(
      '{"account":"managed"}\n'
    )
  })

  it('does not seed source-home hook trust into a self-contained account home', async () => {
    const fixture = await createCanonicalHookTrustFixture()
    const canonicalConfigPath = join(testState.fakeHomeDir, '.codex', 'config.toml')
    writeFileSync(canonicalConfigPath, fixture.config, 'utf-8')
    const managedHomePath = createManagedHome(
      testState.userDataDir,
      'account-1',
      'approval_policy = "on-request"\n'
    )
    const settings = createSettings({
      codexManagedAccounts: [
        {
          id: 'account-1',
          email: 'user@example.com',
          managedHomePath,
          providerAccountId: null,
          workspaceLabel: null,
          workspaceAccountId: null,
          createdAt: 1,
          updatedAt: 1,
          lastAuthenticatedAt: 1
        }
      ]
    })
    const store = createStore(settings)
    const rateLimits = createRateLimits()
    const runtimeHome = createRuntimeHome()
    const { readHookTrustEntries } = await import('../codex/config-toml-trust')
    const { readCodexTrustGrantLedgerHome } = await import('../codex/codex-trust-grant-ledger')

    const { CodexAccountService } = await import('./service')
    const service = new CodexAccountService(
      store as never,
      rateLimits as never,
      runtimeHome as never
    )
    const expectSanitizedManagedConfig = (): void => {
      const entries = readHookTrustEntries(join(managedHomePath, 'config.toml'))
      for (const key of fixture.orcaKeys) {
        expect(entries.has(key)).toBe(false)
      }
      // The launch-time hook mirror remaps user trust to this home's hooks.json.
      expect(entries.has(fixture.userKey)).toBe(false)
    }

    expectSanitizedManagedConfig()
    expect(readFileSync(canonicalConfigPath, 'utf-8')).toBe(fixture.config)
    expect(readCodexTrustGrantLedgerHome(join(testState.fakeHomeDir, '.codex'))).not.toBeNull()

    writeFileSync(join(managedHomePath, 'config.toml'), 'approval_policy = "untrusted"\n', 'utf-8')
    await service.selectAccount('account-1')

    expectSanitizedManagedConfig()
  })

  it('rewrites relative path config values when syncing into managed homes', async () => {
    const canonicalConfigPath = join(testState.fakeHomeDir, '.codex', 'config.toml')
    writeFileSync(
      canonicalConfigPath,
      'model_instructions_file = "instructions.md"\nsandbox_mode = "danger-full-access"\n',
      'utf-8'
    )
    const managedHomePath = createManagedHome(
      testState.userDataDir,
      'account-1',
      'approval_policy = "on-request"\n',
      '{"account":"managed"}\n'
    )
    const settings = createSettings({
      codexManagedAccounts: [
        {
          id: 'account-1',
          email: 'user@example.com',
          managedHomePath,
          providerAccountId: null,
          workspaceLabel: null,
          workspaceAccountId: null,
          createdAt: 1,
          updatedAt: 1,
          lastAuthenticatedAt: 1
        }
      ],
      activeCodexManagedAccountId: 'account-1'
    })
    const store = createStore(settings)
    const rateLimits = createRateLimits()
    const runtimeHome = createRuntimeHome()

    const { CodexAccountService } = await import('./service')
    new CodexAccountService(store as never, rateLimits as never, runtimeHome as never)

    const managedConfig = readFileSync(join(managedHomePath, 'config.toml'), 'utf-8')
    expect(managedConfig).toContain(
      `model_instructions_file = '${join(testState.fakeHomeDir, '.codex', 'instructions.md')}'`
    )
    expect(managedConfig).toContain('sandbox_mode = "danger-full-access"')
  })

  it('does not rewrite a managed config the previous mirror pass already settled', async () => {
    const canonicalConfigPath = join(testState.fakeHomeDir, '.codex', 'config.toml')
    const { escapeTomlString } = await import('../codex/config-toml-trust')
    const userHookKey = `${join(testState.fakeHomeDir, '.codex', 'user-hooks.json')}:stop:0:0`
    const canonicalConfig = [
      'approval_policy = "never"',
      'sandbox_mode = "danger-full-access"',
      `[hooks.state."${escapeTomlString(userHookKey)}"]`,
      'trusted_hash = "sha256:user-owned"',
      ''
    ].join('\n')
    writeFileSync(canonicalConfigPath, canonicalConfig, 'utf-8')
    const managedHomePath = createManagedHome(
      testState.userDataDir,
      'account-1',
      canonicalConfig,
      '{"account":"managed"}\n'
    )
    const managedConfigPath = join(managedHomePath, 'config.toml')
    const settings = createSettings({
      codexManagedAccounts: [
        {
          id: 'account-1',
          email: 'user@example.com',
          managedHomePath,
          providerAccountId: null,
          workspaceLabel: null,
          workspaceAccountId: null,
          createdAt: 1,
          updatedAt: 1,
          lastAuthenticatedAt: 1
        }
      ],
      activeCodexManagedAccountId: 'account-1'
    })
    const store = createStore(settings)
    const rateLimits = createRateLimits()
    const runtimeHome = createRuntimeHome()

    const { CodexAccountService } = await import('./service')
    new CodexAccountService(store as never, rateLimits as never, runtimeHome as never)

    // The first pass remaps the user hook-trust entry into this home; once that
    // has settled, a later pass must leave the file completely untouched.
    const settledConfig = readFileSync(managedConfigPath, 'utf-8')
    const oldDate = new Date('2024-01-01T00:00:00.000Z')
    utimesSync(managedConfigPath, oldDate, oldDate)

    new CodexAccountService(store as never, rateLimits as never, runtimeHome as never)

    expect(readFileSync(managedConfigPath, 'utf-8')).toBe(settledConfig)
    expect(statSync(managedConfigPath).mtimeMs).toBeLessThan(Date.now() - 60_000)
  })

  it('does not sync configs when ~/.codex/config.toml is missing', async () => {
    const firstManagedHomePath = createManagedHome(
      testState.userDataDir,
      'account-1',
      'sandbox_mode = "danger-full-access"\n',
      '{"account":"one"}\n'
    )
    const secondManagedHomePath = createManagedHome(
      testState.userDataDir,
      'account-2',
      'sandbox_mode = "workspace-write"\n',
      '{"account":"two"}\n'
    )
    const settings = createSettings({
      codexManagedAccounts: [
        {
          id: 'account-1',
          email: 'one@example.com',
          managedHomePath: firstManagedHomePath,
          providerAccountId: null,
          workspaceLabel: null,
          workspaceAccountId: null,
          createdAt: 1,
          updatedAt: 1,
          lastAuthenticatedAt: 1
        },
        {
          id: 'account-2',
          email: 'two@example.com',
          managedHomePath: secondManagedHomePath,
          providerAccountId: null,
          workspaceLabel: null,
          workspaceAccountId: null,
          createdAt: 2,
          updatedAt: 2,
          lastAuthenticatedAt: 2
        }
      ]
    })
    const store = createStore(settings)
    const rateLimits = createRateLimits()
    const runtimeHome = createRuntimeHome()

    const { CodexAccountService } = await import('./service')
    new CodexAccountService(store as never, rateLimits as never, runtimeHome as never)

    expect(readFileSync(join(firstManagedHomePath, 'config.toml'), 'utf-8')).toBe(
      'sandbox_mode = "danger-full-access"\n'
    )
    expect(readFileSync(join(secondManagedHomePath, 'config.toml'), 'utf-8')).toBe(
      'sandbox_mode = "workspace-write"\n'
    )
  })

  it('re-syncs config when selecting an account', async () => {
    const canonicalConfigPath = join(testState.fakeHomeDir, '.codex', 'config.toml')
    writeFileSync(canonicalConfigPath, 'sandbox_mode = "danger-full-access"\n', 'utf-8')
    const managedHomePath = createManagedHome(
      testState.userDataDir,
      'account-1',
      'approval_policy = "on-request"\n'
    )
    const settings = createSettings({
      codexManagedAccounts: [
        {
          id: 'account-1',
          email: 'user@example.com',
          managedHomePath,
          providerAccountId: null,
          workspaceLabel: null,
          workspaceAccountId: null,
          createdAt: 1,
          updatedAt: 1,
          lastAuthenticatedAt: 1
        }
      ]
    })
    const store = createStore(settings)
    const rateLimits = createRateLimits()
    const runtimeHome = createRuntimeHome()

    const { CodexAccountService } = await import('./service')
    const service = new CodexAccountService(
      store as never,
      rateLimits as never,
      runtimeHome as never
    )

    writeFileSync(join(managedHomePath, 'config.toml'), 'approval_policy = "untrusted"\n', 'utf-8')

    await service.selectAccount('account-1')

    // Selecting merges canonical settings into the account's own home rather
    // than overwriting it, so its local approval_policy survives the re-sync.
    expect(readFileSync(join(managedHomePath, 'config.toml'), 'utf-8')).toBe(
      'sandbox_mode = "danger-full-access"\napproval_policy = "untrusted"\n'
    )
    expect(rateLimits.refreshForCodexAccountChange).toHaveBeenCalledTimes(1)
    expect(runtimeHome.syncForCurrentSelection).toHaveBeenCalledTimes(1)
  })

  it('does not throw on startup when the canonical config path is unreadable', async () => {
    mkdirSync(join(testState.fakeHomeDir, '.codex', 'config.toml'), { recursive: true })
    const managedHomePath = createManagedHome(
      testState.userDataDir,
      'account-1',
      'approval_policy = "on-request"\n'
    )
    const settings = createSettings({
      codexManagedAccounts: [
        {
          id: 'account-1',
          email: 'user@example.com',
          managedHomePath,
          providerAccountId: null,
          workspaceLabel: null,
          workspaceAccountId: null,
          createdAt: 1,
          updatedAt: 1,
          lastAuthenticatedAt: 1
        }
      ]
    })
    const store = createStore(settings)
    const rateLimits = createRateLimits()
    const runtimeHome = createRuntimeHome()

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { CodexAccountService } = await import('./service')

    expect(
      () => new CodexAccountService(store as never, rateLimits as never, runtimeHome as never)
    ).not.toThrow()
    expect(readFileSync(join(managedHomePath, 'config.toml'), 'utf-8')).toBe(
      'approval_policy = "on-request"\n'
    )
    expect(warnSpy).toHaveBeenCalled()
  })
})
