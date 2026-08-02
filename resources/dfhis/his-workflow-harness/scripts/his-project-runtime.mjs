import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8').trim()
  } catch {
    return ''
  }
}

function parseMajor(value) {
  const match = String(value ?? '').match(/(?:^|[^\d])(\d{2})(?:\D|$)/)
  const major = match ? Number.parseInt(match[1], 10) : Number.NaN
  return Number.isFinite(major) && major >= 16 && major <= 99 ? major : null
}

function packageJsonAt(repo) {
  try {
    return JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

function packageManager(repo, packageJson) {
  const declared = /^(pnpm|yarn|npm)@/.exec(String(packageJson?.packageManager ?? ''))?.[1]
  if (declared) {return { name: declared, source: 'package-json' }}
  if (existsSync(path.join(repo, 'pnpm-lock.yaml'))) {return { name: 'pnpm', source: 'lockfile' }}
  if (existsSync(path.join(repo, 'yarn.lock'))) {return { name: 'yarn', source: 'lockfile' }}
  if (existsSync(path.join(repo, 'package-lock.json'))) {return { name: 'npm', source: 'lockfile' }}
  return { name: 'unknown', source: 'unknown' }
}

function projectFamily(repo, packageJson) {
  const identity = `${repo} ${packageJson?.name ?? ''}`.toLowerCase()
  if (/df[-_/\\]ygt|ygt[-_/\\]|医共体/.test(identity)) {return 'ygt'}
  if (/df[-_/\\](?:web|his|mic|bff|agg)|dfhis|云his/.test(identity)) {return 'his'}
  return 'unknown'
}

function nodeMajor(repo, packageJson, family) {
  const toolVersions = readText(path.join(repo, '.tool-versions'))
  const toolNode = toolVersions.match(/^nodejs\s+([^\s]+)$/m)?.[1]
  const explicit =
    parseMajor(readText(path.join(repo, '.nvmrc'))) ??
    parseMajor(readText(path.join(repo, '.node-version'))) ??
    parseMajor(toolNode) ??
    parseMajor(packageJson?.engines?.node)
  if (explicit) {return { major: explicit, source: 'repository' }}
  if (family === 'ygt') {return { major: 22, source: 'project-family' }}
  if (family === 'his') {return { major: 18, source: 'project-family' }}
  return { major: null, source: 'unknown' }
}

function findManagedNodeBin(major, home = homedir()) {
  if (!major || process.platform === 'win32') {return null}
  const layouts = [
    [path.join(home, '.nvm', 'versions', 'node'), 'bin'],
    [path.join(home, '.fnm', 'node-versions'), path.join('installation', 'bin')],
    [path.join(home, '.local', 'share', 'fnm', 'node-versions'), path.join('installation', 'bin')]
  ]
  for (const [root, suffix] of layouts) {
    if (!existsSync(root)) {continue}
    const versions = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && parseMajor(entry.name) === major)
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
    for (const version of versions) {
      const bin = path.join(root, version, suffix)
      if (existsSync(path.join(bin, 'node'))) {return bin}
    }
  }
  return null
}

export function resolveProjectRuntime(repo) {
  const root = path.resolve(repo)
  const packageJson = packageJsonAt(root)
  const family = projectFamily(root, packageJson)
  const node = nodeMajor(root, packageJson, family)
  return {
    family,
    nodeMajor: node.major,
    nodeSource: node.source,
    packageManager: packageManager(root, packageJson),
    nodeBinPath: findManagedNodeBin(node.major),
    hasPackageJson: Boolean(packageJson),
    hasMaven: existsSync(path.join(root, 'pom.xml')),
    hasGradle: existsSync(path.join(root, 'gradlew')) || existsSync(path.join(root, 'build.gradle'))
  }
}

export function detectVerifyCommands(repo, runtime) {
  if (runtime.hasPackageJson) {
    const packageJson = packageJsonAt(repo)
    const manager = runtime.packageManager.name === 'unknown' ? 'npm' : runtime.packageManager.name
    const commands = []
    if (packageJson?.scripts?.build) {
      commands.push([manager, manager === 'npm' ? 'run' : 'run', 'build'])
    }
    if (packageJson?.scripts?.test && !/no test specified/i.test(packageJson.scripts.test)) {
      commands.push([manager, manager === 'npm' ? 'test' : 'test'])
    }
    const e2eScript = [
      'e2e',
      'test:e2e',
      'e2e:screenshot',
      'test:e2e:screenshot',
      'screenshot',
      'test:screenshot',
      'visual',
      'test:visual',
      'playwright',
      'test:playwright',
      'cypress:run',
      'cy:run'
    ]
      .find((scriptName) => packageJson?.scripts?.[scriptName])
    if (e2eScript) {
      commands.push([manager, manager === 'npm' ? 'run' : 'run', e2eScript])
    }
    return commands
  }
  if (existsSync(path.join(repo, 'gradlew'))) {return [['./gradlew', 'test']]}
  if (runtime.hasMaven) {return [['mvn', 'test']]}
  return []
}
