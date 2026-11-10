export type TaskProvider = 'github' | 'gitlab' | 'linear' | 'jira' | 'yunxiao' | 'code-merge'

export const TASK_PROVIDERS: readonly TaskProvider[] = [
  'github',
  'gitlab',
  'linear',
  'jira',
  'yunxiao',
  'code-merge'
]

export const DEFAULT_TASK_SOURCE: TaskProvider = 'gitlab'

export const DEFAULT_VISIBLE_TASK_PROVIDERS: readonly TaskProvider[] = [
  'gitlab',
  'yunxiao',
  'code-merge'
]

export const TASK_SOURCE_PICKER_PROVIDERS: readonly TaskProvider[] = TASK_PROVIDERS

const TASK_PROVIDER_SET = new Set<TaskProvider>(TASK_PROVIDERS)
const TASK_SOURCE_PICKER_PROVIDER_SET = new Set<TaskProvider>(TASK_SOURCE_PICKER_PROVIDERS)

export function isTaskProvider(value: unknown): value is TaskProvider {
  return TASK_PROVIDER_SET.has(value as TaskProvider)
}

export function isTaskSourcePickerProvider(value: unknown): value is TaskProvider {
  return TASK_SOURCE_PICKER_PROVIDER_SET.has(value as TaskProvider)
}

export function normalizeTaskProviderSettings(value: {
  visibleTaskProviders: unknown
  defaultTaskSource: unknown
}): { visibleTaskProviders: TaskProvider[]; defaultTaskSource: TaskProvider } {
  const visibleTaskProviders = normalizeVisibleTaskProviders(value.visibleTaskProviders)
  const defaultTaskSource = isTaskProvider(value.defaultTaskSource)
    ? value.defaultTaskSource
    : resolveVisibleTaskProvider(DEFAULT_TASK_SOURCE, visibleTaskProviders)

  if (visibleTaskProviders.includes(defaultTaskSource)) {
    return { visibleTaskProviders, defaultTaskSource }
  }

  // Repair older/drifted profiles whose saved default disappeared from the visible list.
  return {
    defaultTaskSource,
    visibleTaskProviders: TASK_SOURCE_PICKER_PROVIDERS.filter(
      (provider) => provider === defaultTaskSource || visibleTaskProviders.includes(provider)
    )
  }
}

export function normalizeVisibleTaskProviders(value: unknown): TaskProvider[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_VISIBLE_TASK_PROVIDERS]
  }

  const normalized: TaskProvider[] = []
  for (const provider of value) {
    if (!TASK_SOURCE_PICKER_PROVIDER_SET.has(provider as TaskProvider)) {
      continue
    }
    if (!normalized.includes(provider as TaskProvider)) {
      normalized.push(provider as TaskProvider)
    }
  }

  // Keep a selectable source after hydration or manual settings edits; defaults keep fork providers.
  return normalized.length > 0 ? normalized : [...DEFAULT_VISIBLE_TASK_PROVIDERS]
}

export type TaskProviderAvailability = {
  gitlabInstalled: boolean
  linearConnected: boolean
}

export function filterAvailableTaskProviders(
  visibleProviders: readonly TaskProvider[],
  availability: TaskProviderAvailability
): TaskProvider[] {
  const available = visibleProviders.filter(
    (provider) =>
      isTaskSourcePickerProvider(provider) && isTaskProviderAvailable(provider, availability)
  )

  return available.length > 0 ? available : [DEFAULT_TASK_SOURCE]
}

export function restoreAvailableDefaultTaskProvider(
  visibleProviders: readonly TaskProvider[],
  availability: TaskProviderAvailability,
  preferredProvider: unknown
): TaskProvider[] {
  const available = filterAvailableTaskProviders(visibleProviders, availability)

  // Retain access to a saved default even when other providers become available.
  if (
    isTaskProvider(preferredProvider) &&
    isTaskSourcePickerProvider(preferredProvider) &&
    isTaskProviderAvailable(preferredProvider, availability) &&
    !available.includes(preferredProvider)
  ) {
    return TASK_SOURCE_PICKER_PROVIDERS.filter(
      (provider) => provider === preferredProvider || available.includes(provider)
    )
  }

  return available
}

function isTaskProviderAvailable(
  provider: TaskProvider,
  availability: TaskProviderAvailability
): boolean {
  if (provider === 'github') {
    return true
  }
  if (provider === 'gitlab') {
    return true
  }
  // Disconnected Jira must remain visible as its own first-time setup entry point.
  if (provider === 'jira') {
    return true
  }
  if (provider === 'yunxiao') {
    return true
  }
  if (provider === 'code-merge') {
    return true
  }
  return availability.linearConnected
}

export function resolveVisibleTaskProvider(
  preferred: TaskProvider | null | undefined,
  visibleProviders: readonly TaskProvider[]
): TaskProvider {
  const pickerProviders = visibleProviders.filter(isTaskSourcePickerProvider)
  if (preferred && isTaskSourcePickerProvider(preferred) && pickerProviders.includes(preferred)) {
    return preferred
  }
  return pickerProviders[0] ?? DEFAULT_TASK_SOURCE
}
