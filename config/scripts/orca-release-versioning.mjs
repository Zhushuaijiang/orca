import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.status !== 0) {
    throw new Error(output || `${command} exited with ${result.status}`)
  }
  return output.trim()
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z][a-z0-9]*)(?:\.(\d+))?)?$/i.exec(version)
  if (!match) {
    return null
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    tag: match[4] === undefined ? null : match[4].toLowerCase(),
    num: match[5] === undefined ? null : Number(match[5]),
    version
  }
}

function compareCore(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch
}

function coreKey(version) {
  return `${version.major}.${version.minor}.${version.patch}`
}

function compareVersion(a, b) {
  const core = compareCore(a, b)
  if (core !== 0) {
    return core
  }
  if (a.tag === b.tag) {
    return (a.num ?? -1) - (b.num ?? -1)
  }
  if (a.tag === null) {
    return 1
  }
  if (b.tag === null) {
    return -1
  }
  return a.tag < b.tag ? -1 : 1
}

function nextTaggedVersion(versions, tag) {
  const parsed = versions.map(parseVersion).filter(Boolean)
  if (parsed.length === 0) {
    throw new Error('No valid release version found.')
  }
  const latestCore = parsed.toSorted(compareCore).at(-1)
  const sameCore = parsed.filter(
    (version) => compareCore(version, latestCore) === 0 && version.tag === tag
  )
  const maxNum = Math.max(-1, ...sameCore.map((version) => version.num ?? -1))
  return `${coreKey(latestCore)}-${tag}.${maxNum + 1}`
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export async function prepareNextReleaseVersion(repoRoot, remoteLatestVersion, options = {}) {
  const packagePath = path.join(repoRoot, 'package.json')
  const mappingPath = path.join(repoRoot, 'resources', 'skills', 'release-mapping.json')
  const packageJson = await readJson(packagePath)
  const mapping = await readJson(mappingPath)
  const currentVersion = packageJson.version
  if (
    !options.force &&
    remoteLatestVersion &&
    versionGreaterThan(currentVersion, remoteLatestVersion)
  ) {
    return {
      currentVersion,
      nextVersion: currentVersion,
      changed: false,
      output: `Current version ${currentVersion} is newer than server latest ${remoteLatestVersion}.`
    }
  }
  const mappingVersions = (mapping.releases ?? []).map((release) => release.appVersion)
  const currentParsed = parseVersion(currentVersion)
  const tag = currentParsed?.tag ?? 'rc'
  const nextVersion = nextTaggedVersion(
    [currentVersion, remoteLatestVersion, ...mappingVersions].filter(Boolean),
    tag
  )
  if (nextVersion === currentVersion) {
    return { currentVersion, nextVersion, changed: false, output: 'Version is already current.' }
  }
  if (mapping.releases.some((release) => release.appVersion === nextVersion)) {
    throw new Error(`Release mapping already contains ${nextVersion}.`)
  }

  const lastRelease = mapping.releases.at(-1)
  if (!lastRelease?.skills) {
    throw new Error('Release mapping has no previous skills row to copy.')
  }
  packageJson.version = nextVersion
  mapping.releases.push({ appVersion: nextVersion, skills: lastRelease.skills })
  await writeJson(packagePath, packageJson)
  await writeJson(mappingPath, mapping)
  return {
    currentVersion,
    nextVersion,
    changed: true,
    output: `Bumped Orca desktop release version: ${currentVersion} -> ${nextVersion}`
  }
}

export function commitAndPushReleaseVersion(repoRoot, version) {
  run('git', ['add', 'package.json', 'resources/skills/release-mapping.json'], repoRoot)
  const staged = run('git', ['diff', '--cached', '--name-only'], repoRoot)
  if (!staged) {
    return 'No version changes to commit.'
  }
  run('git', ['commit', '-m', `chore: bump Orca desktop release to ${version}`], repoRoot)
  const branch = run('git', ['branch', '--show-current'], repoRoot)
  if (!branch) {
    throw new Error('Cannot push version bump from detached HEAD.')
  }
  run('git', ['push', 'origin', branch], repoRoot)
  return `Committed and pushed ${version} on ${branch}.`
}

export function versionGreaterThan(version, otherVersion) {
  const parsed = parseVersion(version)
  const other = parseVersion(otherVersion)
  if (!parsed || !other) {
    return false
  }
  return compareVersion(parsed, other) > 0
}
