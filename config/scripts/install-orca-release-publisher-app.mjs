#!/usr/bin/env node
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { platform } from 'node:os'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const appPath = path.join(repoRoot, 'dist', 'tools', 'Orca Release Publisher.app')
const contentsPath = path.join(appPath, 'Contents')
const macosPath = path.join(contentsPath, 'MacOS')
const launcherPath = path.join(macosPath, 'Orca Release Publisher')
const electronBinary = path.join(repoRoot, 'node_modules', '.bin', 'electron')

if (platform() !== 'darwin') {
  throw new Error('The double-clickable .app launcher can only be created on macOS.')
}

if (!existsSync(electronBinary)) {
  throw new Error('Electron binary not found. Run pnpm install before creating the app launcher.')
}

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>Orca Release Publisher</string>
  <key>CFBundleIdentifier</key>
  <string>com.stablyai.orca.release-publisher</string>
  <key>CFBundleName</key>
  <string>Orca Release Publisher</string>
  <key>CFBundleDisplayName</key>
  <string>Orca Release Publisher</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`

const launcher = `#!/bin/sh
export ORCA_RELEASE_PUBLISHER_ELECTRON=1
export ORCA_RELEASE_REPO_ROOT=${JSON.stringify(repoRoot)}
cd ${JSON.stringify(repoRoot)} || exit 1
exec ${JSON.stringify(electronBinary)} ${JSON.stringify(
  path.join(repoRoot, 'config', 'scripts', 'orca-release-publisher.mjs')
)}
`

await mkdir(macosPath, { recursive: true })
await writeFile(path.join(contentsPath, 'Info.plist'), plist)
await writeFile(launcherPath, launcher)
await chmod(launcherPath, 0o755)

console.log(appPath)
