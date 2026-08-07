import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

// ── helpers ──────────────────────────────────────────────

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8').trim()
  } catch {
    return ''
  }
}

function parseMajor(value) {
  const match = String(value ?? '').match(/(?:^|[^\d])(\d{2})(?:\D|$)/)
  const major = match ? Number.parseInt(match[1], 10) : Number.isNaN
  return Number.isFinite(major) && major >= 16 && major <= 99 ? major : null
}

function isDirectory(dirPath) {
  try { return statSync(dirPath).isDirectory() } catch { return false }
}

/** Return sorted directory entries (newest version first) under root that match a version-like pattern. */
function versionedDirs(root) {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
}

/** Check that a candidate directory contains a JDK (has bin/javac or bin/javac.exe). */
function isValidJdkHome(candidate) {
  if (!candidate || !isDirectory(candidate)) return false
  const javac = process.platform === 'win32' ? 'javac.exe' : 'javac'
  return existsSync(path.join(candidate, 'bin', javac))
}

/** Check that a candidate directory contains a Gradle installation (has bin/gradle or bin/gradle.bat). */
function isValidGradleHome(candidate) {
  if (!candidate || !isDirectory(candidate)) return false
  const gradle = process.platform === 'win32' ? 'gradle.bat' : 'gradle'
  return existsSync(path.join(candidate, 'bin', gradle))
}

// ── dfhis-environment.json reader ────────────────────────

function readDfhisEnv() {
  const home = homedir()
  const candidates = [
    process.env.ORCA_USER_DATA_PATH && path.join(process.env.ORCA_USER_DATA_PATH, 'dfhis-environment.json'),
    path.join(home, 'AppData', 'Roaming', 'orca-dev', 'dfhis-environment.json'),
    path.join(home, 'AppData', 'Roaming', 'orca', 'dfhis-environment.json'),
    path.join(home, 'AppData', 'Roaming', 'Orca', 'dfhis-environment.json'),
    path.join(home, 'Library', 'Application Support', 'orca-dev', 'dfhis-environment.json'),
    path.join(home, 'Library', 'Application Support', 'orca', 'dfhis-environment.json')
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      return JSON.parse(readFileSync(candidate, 'utf8'))
    } catch { /* skip */ }
  }
  return {}
}

// ── JDK discovery (multi-layer) ──────────────────────────

/**
 * Discover JDK home directory using a multi-layer fallback strategy.
 * Priority: dfhis-environment.json → JAVA_HOME env → PATH lookup → standard location scan.
 * @returns {{ home: string, source: string } | null}
 */
export function discoverJdkHome() {
  const env = readDfhisEnv()

  // 1. Explicit override in dfhis-environment.json
  if (env.jdkHome && isValidJdkHome(env.jdkHome)) {
    return { home: env.jdkHome, source: 'dfhis-environment.json#jdkHome' }
  }

  // 2. JAVA_HOME environment variable
  const envJavaHome = process.env.JAVA_HOME
  if (envJavaHome && isValidJdkHome(envJavaHome)) {
    return { home: envJavaHome, source: 'JAVA_HOME' }
  }

  // 3. Infer from java/javac on PATH
  const pathResult = inferJdkFromPath()
  if (pathResult) return pathResult

  // 4. Scan standard installation locations
  const scanResult = scanForJdk()
  if (scanResult) return scanResult

  return null
}

/** Try to resolve JAVA_HOME from java/javac found on PATH. */
function inferJdkFromPath() {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  let resolvedPath
  try {
    resolvedPath = execFileSync(cmd, ['javac'], { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] }).trim().split(/\r?\n/)[0]
  } catch { return null }
  if (!resolvedPath) return null

  // javac is at <JDK_HOME>/bin/javac — go up two levels
  const binDir = path.dirname(resolvedPath)
  const home = path.dirname(binDir)
  if (isValidJdkHome(home)) {
    return { home, source: 'PATH (javac resolved)' }
  }
  return null
}

/** Scan platform-specific standard locations for a JDK installation. */
function scanForJdk() {
  const home = homedir()
  const roots = []

  if (process.platform === 'win32') {
    roots.push(path.join(home, '.jdks'))
    roots.push('C:\\Program Files\\Java')
    roots.push('C:\\Program Files (x86)\\Java')
    // JetBrains IDEA bundled JBRs (standard install)
    const jetbrainsRoot = 'C:\\Program Files\\JetBrains'
    if (existsSync(jetbrainsRoot)) {
      for (const ide of readdirSync(jetbrainsRoot, { withFileTypes: true })) {
        if (ide.isDirectory()) {
          roots.push(path.join(jetbrainsRoot, ide.name, 'jbr'))
          roots.push(path.join(jetbrainsRoot, ide.name, 'jre'))
        }
      }
    }
    roots.push('C:\\Program Files\\Eclipse Adoptium')
    roots.push('C:\\Program Files\\Microsoft')
    roots.push('C:\\Program Files\\BellSoft')
    roots.push(path.join(home, 'scoop', 'apps'))
    // SDKMAN on Windows (via WSL or native)
    roots.push(path.join(home, '.sdkman', 'candidates', 'java'))
    // Common custom IDE/tool install locations on non-system drives
    for (const drive of ['D', 'E', 'F']) {
      roots.push(`${drive}:\\WorkingApplication\\IDEA`)
      roots.push(`${drive}:\\WorkingApplication`)
      roots.push(`${drive}:\\DevTools`)
      roots.push(`${drive}:\\Java`)
      roots.push(`${drive}:\\JDK`)
    }
  } else if (process.platform === 'darwin') {
    roots.push('/Library/Java/JavaVirtualMachines')
    roots.push(path.join(home, 'Library', 'Java', 'JavaVirtualMachines'))
    roots.push('/opt/homebrew/opt')
    roots.push('/usr/local/opt')
    roots.push(path.join(home, '.sdkman', 'candidates', 'java'))
    roots.push(path.join(home, '.jabba', 'jdk'))
    roots.push(path.join(home, '.jdks'))
  } else {
    // Linux
    roots.push('/usr/lib/jvm')
    roots.push('/usr/local/java')
    roots.push('/opt/java')
    roots.push(path.join(home, '.sdkman', 'candidates', 'java'))
    roots.push(path.join(home, '.jabba', 'jdk'))
    roots.push(path.join(home, '.jdks'))
  }

  for (const root of roots) {
    if (!existsSync(root)) continue

    // Root itself might be a valid JDK home (e.g. JetBrains jbr)
    if (isValidJdkHome(root)) {
      return { home: root, source: `scan:${root}` }
    }

    // Scan child directories
    for (const name of versionedDirs(root)) {
      const candidate = path.join(root, name)
      if (isValidJdkHome(candidate)) {
        return { home: candidate, source: `scan:${root}` }
      }
      // macOS: .jdk/Contents/Home
      const macHome = path.join(candidate, 'Contents', 'Home')
      if (isValidJdkHome(macHome)) {
        return { home: macHome, source: `scan:${root}` }
      }
      // Homebrew symlinks: openjdk@17/libexec/openjdk.jdk/Contents/Home
      const brewHome = path.join(candidate, 'libexec', 'openjdk.jdk', 'Contents', 'Home')
      if (isValidJdkHome(brewHome)) {
        return { home: brewHome, source: `scan:${root}` }
      }
      // Scoop: current/openjdk17 → openjdk17 is the home
      // Already covered by direct check above
    }
  }

  return null
}

// ── Gradle discovery (multi-layer) ───────────────────────

/**
 * Discover Gradle home directory using a multi-layer fallback strategy.
 * Priority: dfhis-environment.json → GRADLE_HOME env → PATH lookup → standard location scan.
 * @returns {{ home: string, source: string } | null}
 */
export function discoverGradleHome() {
  const env = readDfhisEnv()

  // 1. Explicit override
  if (env.gradleHome && isValidGradleHome(env.gradleHome)) {
    return { home: env.gradleHome, source: 'dfhis-environment.json#gradleHome' }
  }

  // 2. GRADLE_HOME environment variable
  const envGradleHome = process.env.GRADLE_HOME
  if (envGradleHome && isValidGradleHome(envGradleHome)) {
    return { home: envGradleHome, source: 'GRADLE_HOME' }
  }

  // 3. Infer from gradle on PATH
  const pathResult = inferGradleFromPath()
  if (pathResult) return pathResult

  // 4. Scan standard locations
  const scanResult = scanForGradle()
  if (scanResult) return scanResult

  return null
}

/** Try to resolve GRADLE_HOME from gradle found on PATH. */
function inferGradleFromPath() {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  let resolvedPath
  try {
    resolvedPath = execFileSync(cmd, ['gradle'], { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] }).trim().split(/\r?\n/)[0]
  } catch { return null }
  if (!resolvedPath) return null

  // gradle is at <GRADLE_HOME>/bin/gradle — go up two levels
  const binDir = path.dirname(resolvedPath)
  const home = path.dirname(binDir)
  if (isValidGradleHome(home)) {
    return { home, source: 'PATH (gradle resolved)' }
  }
  return null
}

/** Scan platform-specific locations for a Gradle installation. */
function scanForGradle() {
  const home = homedir()
  const roots = []

  // Gradle wrapper distributions cache (all platforms)
  roots.push(path.join(home, '.gradle', 'wrappers', 'dists'))

  if (process.platform === 'win32') {
    roots.push('C:\\Program Files\\Gradle')
    roots.push(path.join(home, 'scoop', 'apps'))
    // Common custom IDE/tool install locations on non-system drives
    for (const drive of ['D', 'E', 'F']) {
      roots.push(`${drive}:\\WorkingApplication\\IDEA`)
      roots.push(`${drive}:\\WorkingApplication`)
      roots.push(`${drive}:\\DevTools`)
      roots.push(`${drive}:\\Gradle`)
    }
  } else if (process.platform === 'darwin') {
    roots.push('/opt/homebrew/opt')
    roots.push('/usr/local/opt')
    roots.push('/usr/local/Cellar')
    roots.push('/opt/gradle')
  } else {
    roots.push('/opt/gradle')
    roots.push('/usr/share/gradle')
  }

  // SDKMAN (all platforms)
  roots.push(path.join(home, '.sdkman', 'candidates', 'gradle'))

  for (const root of roots) {
    if (!existsSync(root)) continue

    if (isValidGradleHome(root)) {
      return { home: root, source: `scan:${root}` }
    }

    for (const name of versionedDirs(root)) {
      const candidate = path.join(root, name)
      if (isValidGradleHome(candidate)) {
        return { home: candidate, source: `scan:${root}` }
      }
      // Gradle wrapper dists: gradle-X.Y-bin/<hash>/gradle-X.Y
      if (isDirectory(candidate)) {
        for (const sub of versionedDirs(candidate)) {
          const nested = path.join(candidate, sub)
          if (isValidGradleHome(nested)) {
            return { home: nested, source: `scan:${root}` }
          }
        }
      }
      // Homebrew: gradle/libexec
      const brewHome = path.join(candidate, 'libexec')
      if (isValidGradleHome(brewHome)) {
        return { home: brewHome, source: `scan:${root}` }
      }
    }
  }

  return null
}

// ── project metadata ─────────────────────────────────────

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

// ── main entry points ────────────────────────────────────

export function resolveProjectRuntime(repo) {
  const root = path.resolve(repo)
  const packageJson = packageJsonAt(root)
  const family = projectFamily(root, packageJson)
  const node = nodeMajor(root, packageJson, family)

  const jdk = discoverJdkHome()
  const gradle = discoverGradleHome()

  return {
    family,
    nodeMajor: node.major,
    nodeSource: node.source,
    packageManager: packageManager(root, packageJson),
    nodeBinPath: findManagedNodeBin(node.major),
    hasPackageJson: Boolean(packageJson),
    hasMaven: existsSync(path.join(root, 'pom.xml')),
    hasGradle: existsSync(path.join(root, 'gradlew')) || existsSync(path.join(root, 'build.gradle')),
    jdkHome: jdk?.home ?? '',
    jdkSource: jdk?.source ?? '',
    gradleHome: gradle?.home ?? '',
    gradleSource: gradle?.source ?? ''
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
  if (runtime.hasGradle && runtime.gradleHome) {
    const gradleBin = path.join(runtime.gradleHome, 'bin', process.platform === 'win32' ? 'gradle.bat' : 'gradle')
    return [[gradleBin, 'compileJava']]
  }
  if (runtime.hasMaven) {return [['mvn', 'test']]}
  return []
}
