import { isTuiAgent } from './tui-agent-config'
import type { TuiAgent } from './tui-agent'
import {
  isAuxiliaryTaskId,
  type AuxiliaryModelSettings,
  type AuxiliaryModelRoute,
  type AuxiliaryTaskRoutes,
  type AuxiliaryTaskId
} from './auxiliary-model-types'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hostChoices(value: unknown): Record<string, string> | undefined {
  if (!record(value)) {
    return undefined
  }
  const entries = Object.entries(value).filter(
    ([key, choice]) =>
      key !== '__proto__' &&
      key !== 'constructor' &&
      key !== 'prototype' &&
      typeof choice === 'string' &&
      choice.trim().length > 0
  )
  const choices: Record<string, string> = {}
  for (const [key, choice] of entries) {
    if (typeof choice === 'string') {
      choices[key] = choice.trim()
    }
  }
  return Object.keys(choices).length ? choices : undefined
}

export function normalizeAuxiliaryModelRoute(value: unknown): AuxiliaryModelRoute | undefined {
  if (!record(value)) {
    return undefined
  }
  const route: AuxiliaryModelRoute = {}
  if (typeof value.agentId === 'string' && isTuiAgent(value.agentId)) {
    route.agentId = value.agentId
  }
  const models = hostChoices(value.modelsByHost)
  const thinking = hostChoices(value.thinkingByHost)
  if (models) {
    route.modelsByHost = models
  }
  if (thinking) {
    route.thinkingByHost = thinking
  }
  if (typeof value.fallbackToDefault === 'boolean') {
    route.fallbackToDefault = value.fallbackToDefault
  }
  return Object.keys(route).length ? route : undefined
}

function taskRoutes(value: unknown): AuxiliaryTaskRoutes | undefined {
  if (!record(value)) {
    return undefined
  }
  const routes: AuxiliaryTaskRoutes = {}
  for (const [key, choice] of Object.entries(value)) {
    if (!isAuxiliaryTaskId(key)) {
      continue
    }
    const route = normalizeAuxiliaryModelRoute(choice)
    if (route) {
      routes[key] = route
    }
  }
  return Object.keys(routes).length ? routes : undefined
}

export function normalizeAuxiliaryModelSettings(value: unknown): AuxiliaryModelSettings {
  if (!record(value)) {
    return {}
  }
  const settings: AuxiliaryModelSettings = {}
  const defaults = normalizeAuxiliaryModelRoute(value.defaults)
  const tasks = taskRoutes(value.tasks)
  if (defaults) {
    settings.defaults = defaults
  }
  if (tasks) {
    settings.tasks = tasks
  }
  if (record(value.byPrimaryAgent)) {
    const profiles: Partial<Record<TuiAgent, AuxiliaryTaskRoutes>> = {}
    for (const [agent, profile] of Object.entries(value.byPrimaryAgent)) {
      if (!isTuiAgent(agent)) {
        continue
      }
      const routes = taskRoutes(profile)
      if (routes) {
        profiles[agent] = routes
      }
    }
    if (Object.keys(profiles).length) {
      settings.byPrimaryAgent = profiles
    }
  }
  return settings
}

export function resolveAuxiliaryModelRoute(
  settings: AuxiliaryModelSettings | undefined,
  task: AuxiliaryTaskId,
  primaryAgent?: TuiAgent | null
): AuxiliaryModelRoute | undefined {
  const normalized = normalizeAuxiliaryModelSettings(settings)
  const specific = primaryAgent ? normalized.byPrimaryAgent?.[primaryAgent]?.[task] : undefined
  const global = normalized.tasks?.[task]
  const taskRoute = mergeRoute(global, specific)
  if (!taskRoute) {
    return normalized.defaults
  }
  // A different agent must never inherit another agent's model names.
  const base = normalized.defaults
  return mergeRoute(base, taskRoute)
}

function mergeRoute(
  base: AuxiliaryModelRoute | undefined,
  override: AuxiliaryModelRoute | undefined
): AuxiliaryModelRoute | undefined {
  if (!override) {
    return base
  }
  if (override.agentId && override.agentId !== base?.agentId) {
    return override
  }
  return {
    ...base,
    ...override,
    modelsByHost: { ...base?.modelsByHost, ...override.modelsByHost },
    thinkingByHost: { ...base?.thinkingByHost, ...override.thinkingByHost }
  }
}
