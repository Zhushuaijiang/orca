import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'

export async function verifyDfhisMacArchive(archive, evidencePath, version, commit) {
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))
  const size = (await stat(archive)).size
  const sha256 = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex')
  if (
    evidence.schemaVersion !== 1 ||
    evidence.platform !== 'darwin-arm64' ||
    evidence.version !== version ||
    evidence.commit !== commit ||
    evidence.size !== size ||
    evidence.sha256 !== sha256 ||
    evidence.entitlementsVerified !== true ||
    evidence.runtimeVerified !== true
  ) {
    throw new Error('macOS archive does not match the verified release version, commit, or bytes.')
  }
  return evidence
}
