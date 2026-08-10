import type { DfHisEnvironmentConfig } from '../dfhis-environment/config'
import { withoutProxyEnv } from './direct-fetch'

// Why: the team server lives on the office LAN; off-LAN clients fall back to the public domain.
export const EXTERNAL_SKILL_SERVER_ORIGIN = 'https://bot-direct.zhushuaijiang.cn'

const PROBE_TIMEOUT_MS = 4_000
const ORIGIN_CACHE_TTL_MS = 10 * 60_000

let cached: { origin: string; resolvedAt: number } | null = null
let inflight: Promise<string> | null = null

export function resetSkillContributionServerOriginCache(): void {
  cached = null
  inflight = null
}

export function skillPackUrlForOrigin(config: DfHisEnvironmentConfig, origin: string): string {
  return `${origin}${new URL(config.dfhisSkillPackUrl).pathname}`
}

async function probePrimaryOrigin(primaryOrigin: string): Promise<boolean> {
  return withoutProxyEnv(async () => {
    try {
      // Why: any HTTP response — even an error status — proves the LAN server is reachable.
      await fetch(`${primaryOrigin}/`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
      return true
    } catch {
      return false
    }
  })
}

export async function resolveSkillContributionServerOrigin(
  config: DfHisEnvironmentConfig
): Promise<string> {
  const override = process.env.SKILL_CONTRIB_SERVER_ORIGIN?.trim()
  if (override) {
    return override.replace(/\/+$/, '')
  }
  const primaryOrigin = new URL(config.dfhisSkillPackUrl).origin
  if (primaryOrigin === EXTERNAL_SKILL_SERVER_ORIGIN) {
    return primaryOrigin
  }
  if (cached && Date.now() - cached.resolvedAt < ORIGIN_CACHE_TTL_MS) {
    return cached.origin
  }
  inflight ??= (async () => {
    const origin = (await probePrimaryOrigin(primaryOrigin))
      ? primaryOrigin
      : EXTERNAL_SKILL_SERVER_ORIGIN
    cached = { origin, resolvedAt: Date.now() }
    return origin
  })().finally(() => {
    inflight = null
  })
  return inflight
}
