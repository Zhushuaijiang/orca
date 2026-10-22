import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function parseVersionSegment(raw: string): number[] {
  return raw
    .replace(/^v/i, '')
    .split('.')
    .map((segment) => Number.parseInt(segment, 10))
    .map((segment) => (Number.isFinite(segment) ? segment : 0))
}

function compareVersionDesc(left: string, right: string): number {
  const leftParts = parseVersionSegment(left)
  const rightParts = parseVersionSegment(right)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const delta = (rightParts[index] ?? 0) - (leftParts[index] ?? 0)
    if (delta !== 0) {
      return delta
    }
  }

  return right.localeCompare(left)
}

// Why bounded and cycle-guarded: an nvm alias may point at another alias
// (`default` -> `lts/*` -> `lts/krypton` -> a version), and a hand-edited pair
// can point at each other. nvm's own resolver tracks seen aliases; mirror that
// rather than trusting the files to be acyclic. Termination comes from the hop
// bound; the seen-set is what turns a cycle into "no preference" instead of
// silently resolving whichever alias the walk happened to stop on.
const NVM_ALIAS_CHAIN_LIMIT = 10

/** Resolves `alias/default` to an installed version directory name, or null. */
function resolveNvmDefaultVersion(nvmVersionsDir: string, installed: string[]): string | null {
  const aliasDir = join(nvmVersionsDir, '..', '..', 'alias')
  let token = readNvmAlias(join(aliasDir, 'default'))
  const seen = new Set<string>()
  for (let hop = 0; token && hop < NVM_ALIAS_CHAIN_LIMIT; hop += 1) {
    if (seen.has(token)) {
      return null
    }
    seen.add(token)
    const next = readNvmAlias(join(aliasDir, token))
    if (!next) {
      break
    }
    token = next
  }
  if (!token) {
    return null
  }
  // Why: `system` selects the OS node, so nvm owns nothing to prefer here.
  // `node`/`stable` mean newest, which is the ordering we already produce.
  if (token === 'system' || token === 'node' || token === 'stable') {
    return null
  }
  return matchNvmVersion(token, installed)
}

function readNvmAlias(aliasPath: string): string | null {
  // Why this is a cheap check and not the actual containment: join() normalizes
  // `..` away before we ever see it, so this only rejects the literal spelling.
  // The real guarantee is downstream — matchNvmVersion can only ever return an
  // entry of readdirSync(versions/node), so no token can put a foreign path on
  // PATH regardless of what the alias file says.
  if (aliasPath.includes('..')) {
    return null
  }
  try {
    if (!statSync(aliasPath).isFile()) {
      return null
    }
    const value = readFileSync(aliasPath, 'utf8').trim()
    return value.length > 0 ? value : null
  } catch {
    return null
  }
}

/** `24` matches the highest installed `v24.x.y`; `v24.18.0` matches exactly. */
function matchNvmVersion(token: string, installed: string[]): string | null {
  // Why a full shape check: parseVersionSegment coerces every unparseable
  // segment to 0 (parseInt stops at the first non-digit), so an unresolvable
  // token prefix-matched `v0.12.x` — or any stray non-version directory —
  // instead of matching nothing. Anchoring only the first character was not
  // enough: `0x18`, `00` and `0abc` all still parsed to [0]. nvm writes such a
  // token to the alias file even while warning it does not exist, then answers
  // N/A for it, and so must we — which leaves newest-first ordering untouched.
  // Leading zeros are rejected for the same reason: nvm calls `00` and `024`
  // N/A, while parseInt happily reads them as 0 and 24.
  // (A length check cannot catch any of this: ''.split('.') is [''].)
  if (!/^v?(0|[1-9]\d*)(\.(0|[1-9]\d*))*$/.test(token)) {
    return null
  }
  const wanted = parseVersionSegment(token)
  const matches = installed.filter((entry) => {
    const parts = parseVersionSegment(entry)
    return wanted.every((segment, index) => parts[index] === segment)
  })
  return matches.sort(compareVersionDesc)[0] ?? null
}

export function getNvmVersionDirectories(homePath: string): string[] {
  const nvmVersionsDir = join(homePath, '.nvm', 'versions', 'node')
  if (!existsSync(nvmVersionsDir)) {
    return []
  }

  let installed: string[]
  try {
    installed = readdirSync(nvmVersionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(compareVersionDesc)
  } catch {
    return []
  }

  // Why default-first rather than newest-first: this ordering decides which node
  // a CLI runs under whenever the login-shell probe does not land. Newest is
  // usually the version the user just installed and has put nothing into, so it
  // hid every globally installed CLI and mismatched native module ABIs
  // (stablyai/orca#10932). The rest stay behind it as fallbacks, so a CLI
  // installed outside the default version is still reachable.
  const preferred = resolveNvmDefaultVersion(nvmVersionsDir, installed)
  const ordered = preferred
    ? [preferred, ...installed.filter((entry) => entry !== preferred)]
    : installed
  return ordered.map((entry) => join(nvmVersionsDir, entry, 'bin'))
}
