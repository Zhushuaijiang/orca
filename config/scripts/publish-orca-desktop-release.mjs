#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const DEFAULT_REMOTE = 'root@192.168.1.10'
const DEFAULT_REMOTE_DIR =
  '/opt/workspace/github/hermes-agent-260623/bot_manager/static/downloads/orca'

function parseArgs(argv) {
  const args = {
    buildMac: true,
    remote: process.env.ORCA_RELEASE_REMOTE || DEFAULT_REMOTE,
    remoteDir: process.env.ORCA_RELEASE_REMOTE_DIR || DEFAULT_REMOTE_DIR,
    notes: process.env.ORCA_RELEASE_NOTES || ''
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--skip-build' || arg === '--skip-mac-build') {
      args.buildMac = false
    } else if (arg === '--windows-exe') {
      args.windowsExe = argv[++i]
    } else if (arg === '--mac-app') {
      args.macApp = argv[++i]
    } else if (arg === '--remote') {
      args.remote = argv[++i]
    } else if (arg === '--remote-dir') {
      args.remoteDir = argv[++i]
    } else if (arg === '--notes') {
      args.notes = argv[++i]
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit'
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
  return result
}

function runText(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr}`)
  }
  return result.stdout.trim()
}

function sshArgs(args) {
  return ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', ...args]
}

function remoteCommand(args, command) {
  const password = process.env.ORCA_RELEASE_SSH_PASSWORD
  if (password) {
    run('sshpass', ['-e', 'ssh', ...sshArgs([args.remote, command])], {
      env: { ...process.env, SSHPASS: password }
    })
    return
  }
  run('ssh', sshArgs([args.remote, command]))
}

function scpUpload(args, files, remoteTarget) {
  const password = process.env.ORCA_RELEASE_SSH_PASSWORD
  const scpArgs = sshArgs([...files, `${args.remote}:${remoteTarget}`])
  if (password) {
    run('sshpass', ['-e', 'scp', ...scpArgs], {
      env: { ...process.env, SSHPASS: password }
    })
    return
  }
  run('scp', scpArgs)
}

async function newestWindowsExe() {
  const distEntries = await readdir('dist', { withFileTypes: true }).catch(() => [])
  const candidates = []
  for (const entry of distEntries) {
    if (!entry.isDirectory() || !entry.name.startsWith('windows-installer-')) {
      continue
    }
    const candidate = path.join('dist', entry.name, 'orca-windows-setup.exe')
    if (existsSync(candidate)) {
      const info = await stat(candidate)
      candidates.push({ path: candidate, mtimeMs: info.mtimeMs })
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return candidates[0]?.path
}

async function sha256(filePath) {
  const hash = createHash('sha256')
  hash.update(await readFile(filePath))
  return hash.digest('hex')
}

async function artifactInfo(input) {
  const info = await stat(input.path)
  return {
    filename: input.filename,
    download_name: input.downloadName,
    path: `releases/${input.version}/${input.filename}`,
    size: info.size,
    sha256: await sha256(input.path)
  }
}

function verifyMacAppVersion(macApp, version) {
  const plist = path.join(macApp, 'Contents', 'Info.plist')
  const shortVersion = runText('/usr/libexec/PlistBuddy', [
    '-c',
    'Print :CFBundleShortVersionString',
    plist
  ])
  const bundleVersion = runText('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleVersion', plist])
  if (shortVersion !== version || bundleVersion !== version) {
    throw new Error(`macOS app version mismatch: ${shortVersion}/${bundleVersion}, expected ${version}`)
  }
}

function verifyMacEntitlements(macApp) {
  if (process.platform !== 'darwin') {
    return
  }
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', macApp])
  const entitlements = runText('codesign', ['-d', '--entitlements', '-', path.join(macApp, 'Contents/MacOS/Orca')])
  for (const key of [
    'com.apple.security.cs.allow-jit',
    'com.apple.security.cs.allow-unsigned-executable-memory',
    'com.apple.security.cs.allow-dyld-environment-variables'
  ]) {
    if (!entitlements.includes(key)) {
      throw new Error(`macOS app entitlement missing: ${key}`)
    }
  }
}

async function buildMacApp() {
  run('pnpm', ['run', 'build:desktop'])
  run('pnpm', ['run', 'build:computer-macos'])
  run('pnpm', ['run', 'build:notification-status-macos'])
  run('pnpm', ['run', 'ensure:electron-runtime'])
  run('pnpm', [
    'exec',
    'electron-builder',
    '--config',
    'config/electron-builder.config.cjs',
    '--mac',
    'dir',
    '--arm64'
  ])
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
  const version = packageJson.version
  const macApp = args.macApp || 'dist/mac-arm64/Orca.app'
  const windowsExe = args.windowsExe || (await newestWindowsExe())

  if (args.buildMac) {
    await buildMacApp()
  }
  if (!existsSync(macApp)) {
    throw new Error(`macOS app not found: ${macApp}`)
  }
  if (!windowsExe || !existsSync(windowsExe)) {
    throw new Error('Windows installer not found. Pass --windows-exe <path>.')
  }

  verifyMacAppVersion(macApp, version)
  verifyMacEntitlements(macApp)

  const stageDir = path.join('dist', 'orca-desktop-release', version)
  await rm(stageDir, { recursive: true, force: true })
  await mkdir(stageDir, { recursive: true })

  const macZip = path.join(stageDir, 'orca-macos-arm64.zip')
  const windowsOut = path.join(stageDir, 'orca-windows-setup.exe')
  run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', macApp, macZip])
  await copyFile(windowsExe, windowsOut)

  const publishedAt = new Date().toISOString()
  const release = {
    schemaVersion: 1,
    version,
    published_at: publishedAt,
    notes: args.notes,
    downloads: {
      macos: await artifactInfo({
        path: macZip,
        filename: 'orca-macos-arm64.zip',
        downloadName: `orca-macos-arm64-${version}.zip`,
        version
      }),
      windows: await artifactInfo({
        path: windowsOut,
        filename: 'orca-windows-setup.exe',
        downloadName: `orca-windows-setup-${version}.exe`,
        version
      })
    }
  }
  const releaseJson = path.join(stageDir, 'release.json')
  await writeFile(releaseJson, `${JSON.stringify(release, null, 2)}\n`)

  const remoteTemp = `/tmp/orca-desktop-release-${version}-${Date.now()}`
  remoteCommand(args, `mkdir -p ${JSON.stringify(remoteTemp)}`)
  scpUpload(args, [macZip, windowsOut, releaseJson], remoteTemp)

  const publishScript = `
set -euo pipefail
ROOT=${JSON.stringify(args.remoteDir)}
VERSION=${JSON.stringify(version)}
TMP=${JSON.stringify(remoteTemp)}
mkdir -p "$ROOT/releases/$VERSION"
mv "$TMP/orca-macos-arm64.zip" "$ROOT/releases/$VERSION/orca-macos-arm64.zip"
mv "$TMP/orca-windows-setup.exe" "$ROOT/releases/$VERSION/orca-windows-setup.exe"
mv "$TMP/release.json" "$ROOT/releases/$VERSION/release.json"
rmdir "$TMP"
ROOT="$ROOT" VERSION="$VERSION" python3 - <<'PY'
import json
import os
from pathlib import Path

root = Path(os.environ["ROOT"])
version = os.environ["VERSION"]
release_path = root / "releases" / version / "release.json"
release = json.loads(release_path.read_text(encoding="utf-8"))
manifest_path = root / "releases.json"
try:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
except Exception:
    manifest = {"schemaVersion": 1, "releases": []}
existing = [item for item in manifest.get("releases", []) if item.get("version") != version]
manifest["schemaVersion"] = 1
manifest["latest"] = release
manifest["releases"] = [release, *existing]
latest_tmp = root / "latest.json.tmp"
manifest_tmp = root / "releases.json.tmp"
latest_tmp.write_text(json.dumps(release, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")
manifest_tmp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")
latest_tmp.replace(root / "latest.json")
manifest_tmp.replace(manifest_path)
PY
`
  remoteCommand(args, publishScript)
  console.log(`Published Orca desktop release ${version}`)
  console.log(`macOS: /downloads/orca/macos`)
  console.log(`Windows: /downloads/orca/windows`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
