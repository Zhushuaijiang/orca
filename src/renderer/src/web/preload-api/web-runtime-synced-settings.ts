import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { normalizePRBotAuthorOverrides } from '../../../../shared/pr-bot-author-overrides'

/** The subset of settings the paired runtime owns; only well-typed values cross the wire. */
export function pickRuntimeSyncedSettings(
  source: Partial<GlobalSettings>
): Partial<GlobalSettings> {
  const settings: Partial<GlobalSettings> = {}
  if (typeof source.experimentalNewWorktreeCardStyle === 'boolean') {
    settings.experimentalNewWorktreeCardStyle = source.experimentalNewWorktreeCardStyle
  }
  if (typeof source.compactWorktreeCards === 'boolean') {
    settings.compactWorktreeCards = source.compactWorktreeCards
  }
  if (typeof source.minimaxGroupId === 'string') {
    settings.minimaxGroupId = source.minimaxGroupId
  }
  if (typeof source.minimaxUsageModels === 'string') {
    settings.minimaxUsageModels = source.minimaxUsageModels
  }
  if (source.minimaxEndpoint === 'overseas' || source.minimaxEndpoint === 'cn') {
    settings.minimaxEndpoint = source.minimaxEndpoint
  }
  if (Array.isArray(source.prBotAuthorOverrides)) {
    settings.prBotAuthorOverrides = normalizePRBotAuthorOverrides(source.prBotAuthorOverrides)
  }
  return settings
}
