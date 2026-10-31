import type { PreloadApi } from '../../../../preload/api-types'
import {
  getDefaultSettings,
  getDefaultUIState,
  getWorktreeCardModeProperties
} from '../../../../shared/constants'
import { normalizeWorktreeVisibilityDefaults } from '../../../../shared/external-worktree-visibility'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { osc52ClipboardDefaultOnOverridesPersistedOff } from '../../../../shared/osc52-clipboard-settings'
import type { PersistedUIState } from '../../../../shared/persisted-ui-state-types'
import {
  applyPRBotAuthorOverride,
  normalizePRBotAuthorOverrides
} from '../../../../shared/pr-bot-author-overrides'
import { normalizeTaskProviderSettings } from '../../../../shared/task-providers'
import { readStoredWebRuntimeEnvironment } from '../web-runtime-environment'
import {
  mergeSettings,
  stripRetiredWebChatSettings,
  mergeWebUIState,
  migrateStoredWebSettings,
  needsChatUiChoiceCarry,
  retainOriginalWebChatSetting,
  runtimeChatPermissionSetting
} from './web-preference-normalization'
import { callRuntimeResult } from './web-runtime-calls'
import { requireActiveEnvironmentOrNull, webRuntimeState } from './web-runtime-session'
import { pickRuntimeSyncedSettings } from './web-runtime-synced-settings'
import { zcodePlanSiteOwner, settingsForZcodePlanSiteOwner } from './web-zcode-plan-site'
import { SETTINGS_STORAGE_KEY, UI_STORAGE_KEY, readJson, writeJson } from './web-storage'

export type WebSettingsApi = NonNullable<PreloadApi['settings']>

export function getStoredSettings(): GlobalSettings {
  webRuntimeState.activeEnvironment ??= readStoredWebRuntimeEnvironment()
  const defaults = getDefaultSettings('~')
  const rawStoredSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
  const stored = readJson<Partial<GlobalSettings>>(SETTINGS_STORAGE_KEY, {})
  const migratedStored = migrateStoredWebSettings(stored)
  if (
    rawStoredSettings &&
    (stored.autoRenameBranchFromWork !== migratedStored.autoRenameBranchFromWork ||
      stored.autoRenameBranchFromWorkDefaultedOn !==
        migratedStored.autoRenameBranchFromWorkDefaultedOn ||
      stored.terminalCursorStyle !== migratedStored.terminalCursorStyle ||
      stored.terminalCursorStyleDefaultedToBlock !==
        migratedStored.terminalCursorStyleDefaultedToBlock ||
      // Keep this explicit migration check even though terminalCustomThemes identity currently forces the branch.
      stored.terminalAllowOsc52Clipboard !== migratedStored.terminalAllowOsc52Clipboard ||
      stored.terminalAllowOsc52ClipboardDefaultedOnForAllUsers !==
        migratedStored.terminalAllowOsc52ClipboardDefaultedOnForAllUsers ||
      stored.terminalCustomThemes !== migratedStored.terminalCustomThemes ||
      stored.uiLanguage !== migratedStored.uiLanguage ||
      needsChatUiChoiceCarry(stored) ||
      stored.uiLanguagePortugueseMigrationApplied !== true)
  ) {
    try {
      const parsed = JSON.parse(rawStoredSettings) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        writeJson(SETTINGS_STORAGE_KEY, retainOriginalWebChatSetting(migratedStored, stored))
        if (osc52ClipboardDefaultOnOverridesPersistedOff(stored)) {
          // readLocalWebUIState calls getStoredSettings; raw merge avoids recursive migration writes.
          writeJson(UI_STORAGE_KEY, {
            ...readJson<Partial<PersistedUIState>>(UI_STORAGE_KEY, {}),
            osc52ClipboardDefaultOnNoticePending: true
          })
        }
      }
    } catch {
      // Keep readJson's invalid-JSON fallback non-destructive.
    }
  }
  const settings = mergeSettings(
    {
      ...defaults,
      floatingTerminalEnabled: false,
      rightSidebarOpenByDefault: false,
      activeRuntimeEnvironmentId: null
    },
    migratedStored
  )
  delete settings.zcodePlanSite
  return settings
}

export function writeStoredSettings(
  settings: GlobalSettings,
  explicitActiveRuntimeEnvironmentId?: string | null
): void {
  const stored = readJson<Partial<GlobalSettings>>(SETTINGS_STORAGE_KEY, {})
  const durable = retainOriginalWebChatSetting(settings, stored)
  if (explicitActiveRuntimeEnvironmentId !== undefined) {
    durable.activeRuntimeEnvironmentId = explicitActiveRuntimeEnvironmentId
  } else {
    if (Object.hasOwn(stored, 'activeRuntimeEnvironmentId')) {
      durable.activeRuntimeEnvironmentId = stored.activeRuntimeEnvironmentId ?? null
    } else {
      delete durable.activeRuntimeEnvironmentId
    }
  }
  writeJson(SETTINGS_STORAGE_KEY, durable)
}

function settleRuntimeSettings(patch: Partial<GlobalSettings>): GlobalSettings {
  const next = mergeSettings(getStoredSettings(), patch)
  writeStoredSettings(next)
  return next
}

export async function getRuntimeBackedStoredSettings(): Promise<GlobalSettings> {
  const local = getStoredSettings()
  const requestedEnvironment = requireActiveEnvironmentOrNull()
  const requestedSiteOwner = zcodePlanSiteOwner(requestedEnvironment)
  if (!requestedEnvironment) {
    return local
  }
  try {
    const result = await callRuntimeResult<{ settings: Partial<GlobalSettings> }>(
      'settings.get',
      undefined,
      15_000
    )
    const runtimeSettings: Partial<GlobalSettings> = {}
    const currentEnvironment = requireActiveEnvironmentOrNull()
    if (currentEnvironment?.id === requestedEnvironment.id) {
      const visibilityDefaults = normalizeWorktreeVisibilityDefaults(
        result.settings.worktreeVisibilityDefaults
      )
      webRuntimeState.worktreeVisibilityDefaultsRuntimeEnvironmentId = visibilityDefaults
        ? requestedEnvironment.id
        : null
      webRuntimeState.worktreeVisibilityDefaultsRuntimeValue = visibilityDefaults ?? null
    }
    Object.assign(runtimeSettings, pickRuntimeSyncedSettings(result.settings))
    if (zcodePlanSiteOwner(currentEnvironment) === requestedSiteOwner) {
      webRuntimeState.zcodePlanSiteRuntimeOwner = requestedSiteOwner
      const site = result.settings.zcodePlanSite
      webRuntimeState.zcodePlanSiteRuntimeValue =
        site === 'zai' || site === 'bigmodel' ? site : null
    }
    Object.assign(runtimeSettings, runtimeChatPermissionSetting(result.settings))
    // Read-only host capability; a host without a sharing service omits it, which must not keep a stale local grant.
    runtimeSettings.artifactSharingEnabled = result.settings.artifactSharingEnabled === true
    runtimeSettings.agentSkillSharingEnabled = result.settings.agentSkillSharingEnabled === true
    // Why: the paired host owns task-provider availability (e.g. yunxiao), so its
    // provider list and default win over stale web-local values.
    if (
      result.settings.defaultTaskSource !== undefined ||
      result.settings.visibleTaskProviders !== undefined
    ) {
      Object.assign(
        runtimeSettings,
        normalizeTaskProviderSettings({
          defaultTaskSource: result.settings.defaultTaskSource ?? local.defaultTaskSource,
          visibleTaskProviders: result.settings.visibleTaskProviders ?? local.visibleTaskProviders
        })
      )
    }
    return settingsForActiveVisibilityOwner(settleRuntimeSettings(runtimeSettings))
  } catch {
    // Why: unpaired/offline web clients keep a local settings fallback.
    return settingsForActiveVisibilityOwner(getStoredSettings())
  }
}

export function settingsForActiveVisibilityOwner(settings: GlobalSettings): GlobalSettings {
  const environment = requireActiveEnvironmentOrNull()
  const ownedSettings = settingsForZcodePlanSiteOwner(settings, environment)
  if (!environment) {
    return ownedSettings
  }
  if (
    environment.id === webRuntimeState.worktreeVisibilityDefaultsRuntimeEnvironmentId &&
    webRuntimeState.worktreeVisibilityDefaultsRuntimeValue
  ) {
    return {
      ...ownedSettings,
      worktreeVisibilityDefaults: webRuntimeState.worktreeVisibilityDefaultsRuntimeValue
    }
  }
  const { worktreeVisibilityDefaults: _unsupported, ...supportedSettings } = ownedSettings
  return supportedSettings as GlobalSettings
}

export async function syncRuntimeBackedSettings(
  updates: Partial<GlobalSettings>
): Promise<GlobalSettings> {
  const requestedEnvironment = requireActiveEnvironmentOrNull()
  if (requestedEnvironment) {
    const runtimeUpdates: Partial<GlobalSettings> = {}
    const visibilityDefaults = normalizeWorktreeVisibilityDefaults(
      updates.worktreeVisibilityDefaults
    )
    if (visibilityDefaults) {
      runtimeUpdates.worktreeVisibilityDefaults = visibilityDefaults
    }
    Object.assign(runtimeUpdates, pickRuntimeSyncedSettings(updates))
    Object.assign(runtimeUpdates, runtimeChatPermissionSetting(updates, false))
    if (Object.keys(runtimeUpdates).length > 0) {
      try {
        const result = await callRuntimeResult<{ settings: Partial<GlobalSettings> }>(
          'settings.update',
          runtimeUpdates,
          15_000
        )
        const runtimeSettings = stripRetiredWebChatSettings(result.settings)
        delete runtimeSettings.agentDefaultSurface
        delete runtimeSettings.nativeChatProviders
        delete runtimeSettings.activeRuntimeEnvironmentId
        const updatedVisibilityDefaults = normalizeWorktreeVisibilityDefaults(
          runtimeSettings.worktreeVisibilityDefaults
        )
        if (
          requireActiveEnvironmentOrNull()?.id === requestedEnvironment.id &&
          updatedVisibilityDefaults
        ) {
          webRuntimeState.worktreeVisibilityDefaultsRuntimeEnvironmentId = requestedEnvironment.id
          webRuntimeState.worktreeVisibilityDefaultsRuntimeValue = updatedVisibilityDefaults
        }
        delete runtimeSettings.worktreeVisibilityDefaults
        return settleRuntimeSettings(runtimeSettings)
      } catch (error) {
        if (visibilityDefaults) {
          throw error
        }
        // Why: unpaired/offline web clients still need local settings persistence.
        return getStoredSettings()
      }
    }
  }
  return getStoredSettings()
}

export async function updateRuntimePRBotAuthorOverride(args: {
  author: string
  isBot: boolean
}): Promise<GlobalSettings> {
  if (requireActiveEnvironmentOrNull()) {
    // Why: don't report a successful mark the authoritative runtime failed to persist and will later overwrite.
    const result = await callRuntimeResult<{ settings: Partial<GlobalSettings> }>(
      'settings.updatePRBotAuthorOverride',
      args,
      15_000
    )
    return settleRuntimeSettings({
      prBotAuthorOverrides: normalizePRBotAuthorOverrides(result.settings.prBotAuthorOverrides)
    })
  }
  const local = getStoredSettings()
  const next = mergeSettings(local, {
    prBotAuthorOverrides: applyPRBotAuthorOverride(
      local.prBotAuthorOverrides,
      args.author,
      args.isBot
    )
  })
  writeStoredSettings(next)
  return next
}

export function readLocalWebUIState(): PersistedUIState {
  const defaults = getDefaultUIState()
  // Settings migration arms OSC 52’s UI notice; reading UI first would later overwrite that arm after its one-shot stamp.
  const storedSettings = getStoredSettings()
  const stored = readJson<Partial<PersistedUIState>>(UI_STORAGE_KEY, {})
  const base = {
    ...defaults,
    // Why: mirror the main-process missing-property seed from legacy card layout mode when runtime ui.get is unavailable.
    worktreeCardProperties: getWorktreeCardModeProperties(
      storedSettings.compactWorktreeCards ? 'Compact' : 'Default'
    )
  }
  if (typeof stored.rightSidebarOpen === 'boolean') {
    return mergeWebUIState(base, stored)
  }
  return mergeWebUIState(base, {
    ...stored,
    // Why: web fallback lacks main-process normalization; migrate the retired setting only when local UI preference is absent.
    rightSidebarOpen: storedSettings.rightSidebarOpenByDefault
  })
}
