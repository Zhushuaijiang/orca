export function preserveMacDownload(previousRelease) {
  const mac = previousRelease?.downloads?.macos
  const version = mac?.version ?? previousRelease?.version
  if (
    !mac ||
    typeof version !== 'string' ||
    typeof mac.path !== 'string' ||
    !mac.path.startsWith('releases/') ||
    mac.path.split('/').includes('..') ||
    typeof mac.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(mac.sha256) ||
    !Number.isSafeInteger(mac.size) ||
    mac.size <= 0
  ) {
    throw new Error('Windows-only publication requires an existing valid macOS download.')
  }
  return { ...mac, version }
}
