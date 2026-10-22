import type { GlobalSettings } from '../../../shared/global-settings-types'
import {
  DEFAULT_TASK_SOURCE,
  DEFAULT_VISIBLE_TASK_PROVIDERS,
  normalizeTaskProviderSettings,
  TASK_PROVIDERS
} from '../../../shared/task-providers'

export type PreparedLoadedTaskProviderSettings = {
  taskProviderSettings: Pick<GlobalSettings, 'defaultTaskSource' | 'visibleTaskProviders'>
  needsSave: boolean
}

function isOldDefaultTaskProviderSettings(
  settings: Partial<GlobalSettings> | undefined
): boolean {
  const visibleTaskProviders = settings?.visibleTaskProviders
  return (
    settings?.defaultTaskSource === 'github' &&
    Array.isArray(visibleTaskProviders) &&
    visibleTaskProviders.length === TASK_PROVIDERS.length &&
    TASK_PROVIDERS.every((provider, index) => visibleTaskProviders[index] === provider)
  )
}

function getTaskProviderSettingsForMigration(settings: Partial<GlobalSettings> | undefined): {
  visibleTaskProviders: unknown
  defaultTaskSource: unknown
} {
  if (isOldDefaultTaskProviderSettings(settings)) {
    return {
      visibleTaskProviders: DEFAULT_VISIBLE_TASK_PROVIDERS,
      defaultTaskSource: DEFAULT_TASK_SOURCE
    }
  }
  return {
    visibleTaskProviders: settings?.visibleTaskProviders,
    defaultTaskSource: settings?.defaultTaskSource
  }
}

/** Fork migration chain (jira -> yunxiao -> code-merge) plus the old upstream-default reset. */
export function prepareLoadedTaskProviderSettings(
  settings: Partial<GlobalSettings> | undefined
): PreparedLoadedTaskProviderSettings {
  // Why the old-default reset: the fork default is gitlab/yunxiao/code-merge; a stored
  // all-providers list with the github default is the upstream default, not an opt-in.
  const rawTaskProviderSettings = normalizeTaskProviderSettings(
    getTaskProviderSettingsForMigration(settings)
  )
  // Why no Jira append: fork defaults keep github/linear/jira opt-in (dfhis).
  const visibleTaskProvidersDefaultedForJira =
    settings?.visibleTaskProvidersDefaultedForJira === true
  const jiraMigratedVisibleTaskProviders = rawTaskProviderSettings.visibleTaskProviders
  const visibleTaskProvidersDefaultedForYunxiao =
    settings?.visibleTaskProvidersDefaultedForYunxiao === true
  const yunxiaoMigratedVisibleTaskProviders = visibleTaskProvidersDefaultedForYunxiao
    ? jiraMigratedVisibleTaskProviders
    : jiraMigratedVisibleTaskProviders.includes('yunxiao')
      ? jiraMigratedVisibleTaskProviders
      : [...jiraMigratedVisibleTaskProviders, 'yunxiao' as const]
  const visibleTaskProvidersDefaultedForCodeMerge =
    settings?.visibleTaskProvidersDefaultedForCodeMerge === true
  const migratedVisibleTaskProviders = visibleTaskProvidersDefaultedForCodeMerge
    ? yunxiaoMigratedVisibleTaskProviders
    : yunxiaoMigratedVisibleTaskProviders.includes('code-merge')
      ? yunxiaoMigratedVisibleTaskProviders
      : [...yunxiaoMigratedVisibleTaskProviders, 'code-merge' as const]
  const taskProviderSettings = normalizeTaskProviderSettings({
    visibleTaskProviders: migratedVisibleTaskProviders,
    defaultTaskSource: rawTaskProviderSettings.defaultTaskSource
  })
  return {
    taskProviderSettings,
    needsSave:
      !visibleTaskProvidersDefaultedForJira ||
      !visibleTaskProvidersDefaultedForYunxiao ||
      !visibleTaskProvidersDefaultedForCodeMerge
  }
}
