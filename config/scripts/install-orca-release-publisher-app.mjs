#!/usr/bin/env node
import { cp, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { platform } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const appPath = path.join(repoRoot, 'dist', 'tools', 'Orca Release Publisher.app')
const contentsPath = path.join(appPath, 'Contents')
const macosPath = path.join(contentsPath, 'MacOS')
const resourcesPath = path.join(contentsPath, 'Resources')
const bundledAppPath = path.join(resourcesPath, 'app')
const electronPackageRoot = path.dirname(require.resolve('electron/package.json'))
const electronAppPath = path.join(electronPackageRoot, 'dist', 'Electron.app')
const publisherScriptPath = path.join(repoRoot, 'config', 'scripts', 'orca-release-publisher.mjs')

if (platform() !== 'darwin') {
  throw new Error('The double-clickable .app launcher can only be created on macOS.')
}

if (!existsSync(electronAppPath)) {
  throw new Error('Electron.app not found. Run pnpm install before creating the app launcher.')
}

function setPlistValue(key, type, value) {
  const result = spawnSync(
    '/usr/libexec/PlistBuddy',
    ['-c', `Set :${key} ${value}`, path.join(contentsPath, 'Info.plist')],
    { encoding: 'utf8' }
  )
  if (result.status === 0) {
    return
  }
  const addResult = spawnSync(
    '/usr/libexec/PlistBuddy',
    ['-c', `Add :${key} ${type} ${value}`, path.join(contentsPath, 'Info.plist')],
    { encoding: 'utf8' }
  )
  if (addResult.status !== 0) {
    throw new Error(addResult.stderr || addResult.stdout || `Failed to write Info.plist key ${key}`)
  }
}

const launcherPackage = {
  name: 'orca-release-publisher',
  productName: 'Orca Release Publisher',
  version: '1.0.0',
  type: 'module',
  main: 'main.mjs'
}

const launcherMain = `import process from 'node:process'

process.env.ORCA_RELEASE_PUBLISHER_ELECTRON = '1'
process.env.ORCA_RELEASE_REPO_ROOT = ${JSON.stringify(repoRoot)}
process.chdir(${JSON.stringify(repoRoot)})

await import(${JSON.stringify(pathToFileURL(publisherScriptPath).href)})
`

await rm(appPath, { force: true, recursive: true })
await mkdir(path.dirname(appPath), { recursive: true })
await cp(electronAppPath, appPath, {
  preserveTimestamps: true,
  recursive: true,
  verbatimSymlinks: true
})
await rename(path.join(macosPath, 'Electron'), path.join(macosPath, 'Orca Release Publisher'))
await mkdir(bundledAppPath, { recursive: true })
await writeFile(
  path.join(bundledAppPath, 'package.json'),
  `${JSON.stringify(launcherPackage, null, 2)}\n`
)
await writeFile(path.join(bundledAppPath, 'main.mjs'), launcherMain)

setPlistValue('CFBundleIdentifier', 'string', 'com.stablyai.orca.release-publisher')
setPlistValue('CFBundleExecutable', 'string', '"Orca Release Publisher"')
setPlistValue('CFBundleName', 'string', '"Orca Release Publisher"')
setPlistValue('CFBundleDisplayName', 'string', '"Orca Release Publisher"')
setPlistValue('CFBundleShortVersionString', 'string', '1.0.0')
setPlistValue('CFBundleVersion', 'string', '1')

// Why: renaming the executable and rewriting Info.plist break the copied
// Electron.app seal; without a fresh ad-hoc signature Finder reports the app
// as damaged and refuses to open it.
const signResult = spawnSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
  encoding: 'utf8'
})
if (signResult.status !== 0) {
  throw new Error(signResult.stderr || 'codesign failed')
}
spawnSync('xattr', ['-dr', 'com.apple.quarantine', appPath], { encoding: 'utf8' })

console.log(appPath)
