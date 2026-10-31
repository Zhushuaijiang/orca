import { net } from 'electron'

const FETCH_TIMEOUT_MS = 5000

export type ReleaseReadiness = 'ready' | 'not-ready' | 'unavailable'

type ReleaseHeadResponse = { statusCode: number; redirectUrl?: string }

export function requestGitHubReleaseHead(
  assetUrl: string
): Promise<ReleaseHeadResponse | null> {
  return new Promise((resolve) => {
    const request = net.request({ method: 'HEAD', url: assetUrl, redirect: 'manual' })
    let settled = false
    const settle = (response: ReleaseHeadResponse | null): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      resolve(response)
    }
    const timeout = setTimeout(() => {
      try {
        request.abort()
      } catch {
        // The request may already have been cancelled by Electron.
      }
      settle(null)
    }, FETCH_TIMEOUT_MS)

    request.on('redirect', (statusCode, _method, redirectUrl) => {
      // GitHub's redirect proves existence without fetching the signed storage URL.
      settle({ statusCode, redirectUrl })
    })
    request.on('response', (response) => settle({ statusCode: response.statusCode }))
    request.on('error', () => settle(null))
    try {
      request.end()
    } catch {
      settle(null)
    }
  })
}

export async function getGitHubReleaseAssetReadiness(
  assetUrl: string
): Promise<ReleaseReadiness> {
  const response = await requestGitHubReleaseHead(assetUrl)
  if (!response) {
    return 'unavailable'
  }
  const ready =
    response.redirectUrl !== undefined
      ? response.statusCode >= 300 && response.statusCode < 400
      : response.statusCode >= 200 && response.statusCode < 300
  return response.statusCode === 404 ? 'not-ready' : ready ? 'ready' : 'unavailable'
}
