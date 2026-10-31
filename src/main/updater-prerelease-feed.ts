import { net } from 'electron'
import { parse } from 'yaml'
import { compareVersions, isPrereleaseVersion, isValidVersion } from './updater-fallback'
import type { GithubReleaseFeedConfig } from './updater-release-feed-config'
import {
  getGitHubReleaseAssetReadiness,
  requestGitHubReleaseHead,
  type ReleaseReadiness
} from './updater-github-release-head'

export const DEFAULT_RELEASE_FEED: GithubReleaseFeedConfig = {
  mode: 'github',
  atomUrl: 'https://github.com/stablyai/orca/releases.atom',
  downloadBaseUrl: 'https://github.com/stablyai/orca/releases/download',
  latestDownloadUrl: 'https://github.com/stablyai/orca/releases/latest/download'
}
const FETCH_TIMEOUT_MS = 5000
const MAX_MANIFEST_PROBE_CANDIDATES = 6

// Atom includes stable and prerelease tags without channel filtering.
const TAG_HREF_RE = /href="[^"]*\/releases\/tag\/([^"]+)"/g

export function getReleaseDownloadUrl(
  tag: string,
  releaseFeed: GithubReleaseFeedConfig = DEFAULT_RELEASE_FEED
): string {
  return `${releaseFeed.downloadBaseUrl}/${encodeURIComponent(tag)}`
}

function getPlatformManifestName(): string {
  if (process.platform === 'darwin') {
    return 'latest-mac.yml'
  }
  if (process.platform === 'linux') {
    // Match electron-updater getChannelFilePrefix(): non-x64 Linux appends -${arch}.
    return process.arch === 'x64' ? 'latest-linux.yml' : `latest-linux-${process.arch}.yml`
  }
  return 'latest.yml'
}

function getReleaseManifestUrl(tag: string, releaseFeed: GithubReleaseFeedConfig): string {
  return `${getReleaseDownloadUrl(tag, releaseFeed)}/${getPlatformManifestName()}`
}

function getReleaseAssetUrl(
  tag: string,
  assetName: string,
  releaseFeed: GithubReleaseFeedConfig
): string {
  return `${getReleaseDownloadUrl(tag, releaseFeed)}/${encodeURIComponent(assetName)}`
}

export function normalizeTagToVersion(tag: string): string {
  return tag.replace(/^v/i, '')
}

type ReleaseFeedTag = {
  tag: string
  version: string
}

export function isPerfPrereleaseTag(tag: string): boolean {
  const version = normalizeTagToVersion(tag)
  const match = version.match(/^\d+\.\d+\.\d+-([0-9A-Za-z-.]+)(?:\+[0-9A-Za-z-.]+)?$/)
  const identifiers = match?.[1]?.split('.') ?? []
  return (
    identifiers.length === 3 &&
    identifiers[0] === 'rc' &&
    /^\d+$/.test(identifiers[1]) &&
    identifiers[2] === 'perf'
  )
}

async function fetchReleaseFeedTags(
  releaseFeed: GithubReleaseFeedConfig
): Promise<ReleaseFeedTag[] | null> {
  try {
    const res = await net.fetch(releaseFeed.atomUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    if (!res.ok) {
      return null
    }
    const body = await res.text()
    const tags: ReleaseFeedTag[] = []

    for (const match of body.matchAll(TAG_HREF_RE)) {
      const tag = match[1]
      const version = normalizeTagToVersion(tag)
      if (isValidVersion(version)) {
        tags.push({ tag, version })
      }
    }

    tags.sort((left, right) => compareVersions(right.version, left.version))
    return tags
  } catch {
    return null
  }
}

type ManifestAssetEntry = {
  url?: unknown
  path?: unknown
}

function getManifestAssetNames(manifestText: string): string[] {
  const parsed = parse(manifestText) as {
    files?: ManifestAssetEntry[]
    path?: unknown
  } | null

  const names = new Set<string>()
  for (const file of Array.isArray(parsed?.files) ? parsed.files : []) {
    const value = typeof file.url === 'string' ? file.url : file.path
    if (typeof value === 'string' && value.trim()) {
      names.add(value.trim())
    }
  }
  if (typeof parsed?.path === 'string' && parsed.path.trim()) {
    names.add(parsed.path.trim())
  }
  return [...names]
}


async function getReleaseAssetReadiness(
  tag: string,
  assetName: string,
  releaseFeed: GithubReleaseFeedConfig
): Promise<ReleaseReadiness> {
  const isRelativeAsset = !/^https?:\/\//i.test(assetName)
  const assetUrl = isRelativeAsset
    ? getReleaseAssetUrl(tag, assetName.split('/').findLast(Boolean) ?? assetName, releaseFeed)
    : assetName
  // Why: only real GitHub assets get the redirect probe; custom-feed hosts stay on plain HEAD.
  const isGitHubReleaseAsset =
    process.platform === 'win32' &&
    /^https:\/\/github\.com\/stablyai\/orca\/releases\/download\//i.test(assetUrl)
  if (isGitHubReleaseAsset) {
    return getGitHubReleaseAssetReadiness(assetUrl)
  }

  try {
    const res = await net.fetch(assetUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    if (res.status === 404) {
      return 'not-ready'
    }
    return res.ok ? 'ready' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

async function getPlatformManifestReadiness(
  tag: string,
  releaseFeed: GithubReleaseFeedConfig
): Promise<ReleaseReadiness> {
  try {
    // Feed entries may precede manifests or installer assets; do not offer downloads that would 404.
    const manifestUrl = getReleaseManifestUrl(tag, releaseFeed)
    const res = await net.fetch(manifestUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (res.status === 404) {
      return 'not-ready'
    }
    if (!res.ok) {
      return 'unavailable'
    }
    const manifestText = await res.text()
    let assetNames: string[]
    try {
      assetNames = getManifestAssetNames(manifestText)
    } catch {
      return 'not-ready'
    }
    if (assetNames.length === 0) {
      return 'not-ready'
    }
    const assetResults = await Promise.all(
      assetNames.map((assetName) => getReleaseAssetReadiness(tag, assetName, releaseFeed))
    )
    return assetResults.includes('not-ready')
      ? 'not-ready'
      : assetResults.includes('unavailable')
        ? 'unavailable'
        : 'ready'
  } catch {
    return 'unavailable'
  }
}

export async function fetchLatestStableReleaseTag(
  releaseFeed: GithubReleaseFeedConfig = DEFAULT_RELEASE_FEED
): Promise<string | null> {
  try {
    // Resolve only the release-page redirect; installer redirects continue on to signed storage URLs.
    const latestUrl = releaseFeed.downloadBaseUrl.replace(
      /\/releases\/download\/?$/,
      '/releases/latest'
    )
    if (latestUrl === releaseFeed.downloadBaseUrl) {
      return null
    }
    const latestOrigin = new URL(latestUrl).origin
    const tagPrefix = `${new URL(latestUrl).pathname.replace(/\/releases\/latest$/, '')}/releases/tag/`
    const response = await requestGitHubReleaseHead(latestUrl)
    if (!response?.redirectUrl || response.statusCode < 300 || response.statusCode >= 400) {
      return null
    }
    const target = new URL(response.redirectUrl, latestUrl)
    if (target.origin !== latestOrigin || !target.pathname.startsWith(tagPrefix)) {
      return null
    }
    const tag = decodeURIComponent(target.pathname.slice(tagPrefix.length))
    if (!tag || tag.includes('/')) {
      return null
    }
    const version = normalizeTagToVersion(tag)
    if (!isValidVersion(version) || isPrereleaseVersion(version)) {
      return null
    }
    return (await getPlatformManifestReadiness(tag, releaseFeed)) === 'ready' ? tag : null
  } catch {
    return null
  }
}

// Concrete tags keep manifests and downloaded assets on the same release.
type FetchNewerReleaseTagOptions = {
  includePrerelease?: boolean
  releaseFilter?: 'perf'
  releaseFeed?: GithubReleaseFeedConfig
}

export type FetchNewerReleaseTagsResult =
  | { tags: string[]; state: 'ready' }
  | { tags: string[]; state: 'no-newer' }
  | { tags: string[]; state: 'not-ready'; lastGoodTag?: string }
  | { tags: string[]; state: 'unavailable'; unavailableReason: 'feed' | 'manifest' }

export async function fetchNewerReleaseTag(
  currentVersion: string,
  options: FetchNewerReleaseTagOptions = {}
): Promise<string | null> {
  return (await fetchNewerReleaseTags(currentVersion, 1, options))[0] ?? null
}

export async function fetchNewerReleaseTags(
  currentVersion: string,
  maxTags: number,
  options: FetchNewerReleaseTagOptions = {}
): Promise<string[]> {
  return (await fetchNewerReleaseTagsWithReadiness(currentVersion, maxTags, options)).tags
}

export async function fetchNewerReleaseTagsWithReadiness(
  currentVersion: string,
  maxTags: number,
  options: FetchNewerReleaseTagOptions = {}
): Promise<FetchNewerReleaseTagsResult> {
  const includePrerelease = options.includePrerelease ?? true
  if (maxTags <= 0) {
    return { tags: [], state: 'no-newer' }
  }
  const releaseFeed = options.releaseFeed ?? DEFAULT_RELEASE_FEED
  const tags = await fetchReleaseFeedTags(releaseFeed)
  if (!tags) {
    return { tags: [], state: 'unavailable', unavailableReason: 'feed' }
  }

  // Perf builds require explicit opt-in, even when semver considers them newer.
  const candidates =
    options.releaseFilter === 'perf'
      ? tags.filter(({ tag }) => isPerfPrereleaseTag(tag))
      : includePrerelease
        ? tags.filter(({ tag }) => !isPerfPrereleaseTag(tag))
        : tags.filter(({ version }) => !isPrereleaseVersion(version))
  const newestNewerIndex = candidates.findIndex(
    ({ version }) => compareVersions(version, currentVersion) > 0
  )
  if (newestNewerIndex === -1) {
    return { tags: [], state: 'no-newer' }
  }

  // Bound probes when cancelled releases leave multiple entries without manifests.
  const probeCandidates = candidates.slice(
    newestNewerIndex,
    newestNewerIndex + MAX_MANIFEST_PROBE_CANDIDATES
  )
  const manifestResults = await Promise.all(
    probeCandidates.map(async ({ tag, version }) => ({
      tag,
      version,
      readiness: await getPlatformManifestReadiness(tag, releaseFeed)
    }))
  )

  const primaryIndex = manifestResults.findIndex(
    ({ readiness, version }) =>
      readiness === 'ready' && compareVersions(version, currentVersion) > 0
  )
  if (primaryIndex === -1) {
    if (manifestResults[0]?.readiness === 'unavailable') {
      return { tags: [], state: 'unavailable', unavailableReason: 'manifest' }
    }
    const lastGoodTag = manifestResults.find(({ readiness }) => readiness === 'ready')?.tag
    return lastGoodTag
      ? { tags: [], state: 'not-ready', lastGoodTag }
      : { tags: [], state: 'not-ready' }
  }

  if (primaryIndex > 0) {
    if (manifestResults[0]?.readiness === 'unavailable') {
      return { tags: [], state: 'unavailable', unavailableReason: 'manifest' }
    }
    return { tags: [], state: 'not-ready', lastGoodTag: manifestResults[primaryIndex].tag }
  }

  return {
    tags: manifestResults
      .slice(primaryIndex)
      .filter(({ readiness }) => readiness === 'ready')
      .slice(0, maxTags)
      .map(({ tag }) => tag),
    state: 'ready'
  }
}
