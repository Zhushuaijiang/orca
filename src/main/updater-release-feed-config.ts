import { readFileSync } from 'node:fs'

export type GithubReleaseFeedConfig = {
  mode: 'github'
  atomUrl: string
  downloadBaseUrl: string
  latestDownloadUrl: string
}

export type DisabledReleaseFeedConfig = {
  mode: 'disabled'
}

export type ReleaseFeedConfig = GithubReleaseFeedConfig | DisabledReleaseFeedConfig

const DEFAULT_GITHUB_FEED: GithubReleaseFeedConfig = {
  mode: 'github',
  atomUrl: 'https://github.com/stablyai/orca/releases.atom',
  downloadBaseUrl: 'https://github.com/stablyai/orca/releases/download',
  latestDownloadUrl: 'https://github.com/stablyai/orca/releases/latest/download'
}

type PackagedReleaseFeedConfig = {
  mode?: unknown
  atomUrl?: unknown
  downloadBaseUrl?: unknown
  latestDownloadUrl?: unknown
}

function readPackagedReleaseFeedConfig(
  packageJsonPath: string | undefined
): PackagedReleaseFeedConfig {
  if (!packageJsonPath) {
    return {}
  }
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      orca?: { releaseFeed?: PackagedReleaseFeedConfig }
    }
    return parsed.orca?.releaseFeed ?? {}
  } catch {
    return {}
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function resolveReleaseFeedConfig(
  packageJsonPath?: string,
  env: NodeJS.ProcessEnv = process.env
): ReleaseFeedConfig {
  const packaged = readPackagedReleaseFeedConfig(packageJsonPath)
  const mode = optionalString(env.ORCA_RELEASE_FEED_MODE) ?? optionalString(packaged.mode)
  if (mode === 'disabled') {
    return { mode: 'disabled' }
  }

  return {
    mode: 'github',
    atomUrl:
      optionalString(env.ORCA_RELEASE_ATOM_URL) ??
      optionalString(packaged.atomUrl) ??
      DEFAULT_GITHUB_FEED.atomUrl,
    downloadBaseUrl:
      optionalString(env.ORCA_RELEASE_DOWNLOAD_BASE_URL) ??
      optionalString(packaged.downloadBaseUrl) ??
      DEFAULT_GITHUB_FEED.downloadBaseUrl,
    latestDownloadUrl:
      optionalString(env.ORCA_RELEASE_LATEST_DOWNLOAD_URL) ??
      optionalString(packaged.latestDownloadUrl) ??
      DEFAULT_GITHUB_FEED.latestDownloadUrl
  }
}
