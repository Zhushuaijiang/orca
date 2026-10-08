#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const DEFAULT_REMOTE = 'root@192.168.1.10'
const DEFAULT_REMOTE_DIR =
  '/opt/workspace/github/hermes-agent-260623/bot_manager/static/downloads/orca'
const DEFAULT_SKILL_PACK_JSON = 'out/dfhis-skill-pack.json'
const DEFAULT_SKILL_PACK_ZIP = 'out/dfhis-skill-pack.zip'

export function parseArgs(argv) {
  const remoteDir = process.env.ORCA_RELEASE_REMOTE_DIR || DEFAULT_REMOTE_DIR
  const args = {
    buildMac: true,
    remote: process.env.ORCA_RELEASE_REMOTE || DEFAULT_REMOTE,
    remoteDir,
    remoteSkillPackDir:
      process.env.ORCA_DFHIS_SKILL_PACK_REMOTE_DIR || path.posix.join(remoteDir, '..', 'dfhis'),
    skillPackJson: process.env.ORCA_DFHIS_SKILL_PACK_JSON || DEFAULT_SKILL_PACK_JSON,
    skillPackZip: process.env.ORCA_DFHIS_SKILL_PACK_ZIP || DEFAULT_SKILL_PACK_ZIP,
    // Desktop releases and the live HIS skill pack have independent lifecycles.
    // Publishing the pack must be an explicit operator decision.
    publishSkillPack: false,
    generateSkillPack: true,
    allowSkillPackShrink: false,
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
      if (!process.env.ORCA_DFHIS_SKILL_PACK_REMOTE_DIR) {
        args.remoteSkillPackDir = path.posix.join(args.remoteDir, '..', 'dfhis')
      }
    } else if (arg === '--remote-skill-pack-dir') {
      args.remoteSkillPackDir = argv[++i]
    } else if (arg === '--skill-pack-json') {
      args.skillPackJson = argv[++i]
    } else if (arg === '--skill-pack-zip') {
      args.skillPackZip = argv[++i]
    } else if (arg === '--publish-skill-pack') {
      args.publishSkillPack = true
    } else if (arg === '--skip-skill-pack') {
      args.publishSkillPack = false
    } else if (arg === '--allow-skill-pack-shrink') {
      args.allowSkillPackShrink = true
    } else if (arg === '--skip-skill-pack-generation') {
      args.generateSkillPack = false
    } else if (arg === '--notes') {
      args.notes = argv[++i]
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  if (args.allowSkillPackShrink && !args.publishSkillPack) {
    throw new Error('--allow-skill-pack-shrink requires --publish-skill-pack')
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
    path: input.publishedPath ?? `releases/${input.version}/${input.filename}`,
    size: info.size,
    sha256: await sha256(input.path)
  }
}

export function skillNamesInManifest(manifest) {
  const names = new Set()
  for (const item of manifest?.files ?? []) {
    const [name, relativePath] = String(item?.path ?? '').split('/', 2)
    if (name && relativePath) {
      names.add(name)
    }
  }
  return [...names].sort()
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
    throw new Error(
      `macOS app version mismatch: ${shortVersion}/${bundleVersion}, expected ${version}`
    )
  }
}

function verifyMacEntitlements(macApp) {
  if (process.platform !== 'darwin') {
    return
  }
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', macApp])
  const entitlements = runText('codesign', [
    '-d',
    '--entitlements',
    '-',
    path.join(macApp, 'Contents/MacOS/Orca')
  ])
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

  if (args.publishSkillPack && args.generateSkillPack) {
    run('pnpm', ['run', 'generate:dfhis-skill-pack'])
  }

  if (args.buildMac) {
    await buildMacApp()
  }
  if (!existsSync(macApp)) {
    throw new Error(`macOS app not found: ${macApp}`)
  }
  if (!windowsExe || !existsSync(windowsExe)) {
    throw new Error('Windows installer not found. Pass --windows-exe <path>.')
  }
  if (
    args.publishSkillPack &&
    (!existsSync(args.skillPackJson) || !existsSync(args.skillPackZip))
  ) {
    throw new Error('DFHIS skill pack JSON/ZIP is missing. Generate it or pass explicit paths.')
  }

  verifyMacAppVersion(macApp, version)
  verifyMacEntitlements(macApp)

  const stageDir = path.join('dist', 'orca-desktop-release', version)
  let windowsSource = windowsExe
  let temporaryWindowsSource = null
  const resolvedStageDir = path.resolve(stageDir)
  const resolvedWindowsExe = path.resolve(windowsExe)
  if (resolvedWindowsExe.startsWith(`${resolvedStageDir}${path.sep}`)) {
    temporaryWindowsSource = path.join(
      tmpdir(),
      `orca-windows-setup-source-${version}-${process.pid}-${Date.now()}.exe`
    )
    await copyFile(windowsExe, temporaryWindowsSource)
    windowsSource = temporaryWindowsSource
  }
  await rm(stageDir, { recursive: true, force: true })
  await mkdir(stageDir, { recursive: true })

  const macZip = path.join(stageDir, 'orca-macos-arm64.zip')
  const windowsOut = path.join(stageDir, 'orca-windows-setup.exe')
  const skillPackJsonOut = path.join(stageDir, 'dfhis-skill-pack.json')
  const skillPackZipOut = path.join(stageDir, 'dfhis-skill-pack.zip')
  run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', macApp, macZip])
  await copyFile(windowsSource, windowsOut)
  if (args.publishSkillPack) {
    await copyFile(args.skillPackJson, skillPackJsonOut)
    await copyFile(args.skillPackZip, skillPackZipOut)
  }
  if (temporaryWindowsSource) {
    await rm(temporaryWindowsSource, { force: true })
  }

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
  let skillPackSkillCount = 0
  if (args.publishSkillPack) {
    const manifest = JSON.parse(await readFile(skillPackJsonOut, 'utf8'))
    skillPackSkillCount = skillNamesInManifest(manifest).length
    if (skillPackSkillCount === 0) {
      throw new Error('DFHIS skill pack contains no valid top-level skills')
    }
    release.dfhis_skill_pack = {
      version: manifest.version ?? publishedAt,
      skill_count: skillPackSkillCount,
      manifest: await artifactInfo({
        path: skillPackJsonOut,
        filename: 'dfhis-skill-pack.json',
        downloadName: `dfhis-skill-pack-${version}.json`,
        publishedPath: '/static/downloads/dfhis/dfhis-skill-pack.json',
        version
      }),
      zip: await artifactInfo({
        path: skillPackZipOut,
        filename: 'dfhis-skill-pack.zip',
        downloadName: `dfhis-skill-pack-${version}.zip`,
        publishedPath: '/static/downloads/dfhis/dfhis-skill-pack.zip',
        version
      })
    }
  }
  const releaseJson = path.join(stageDir, 'release.json')
  await writeFile(releaseJson, `${JSON.stringify(release, null, 2)}\n`)

  const remoteTemp = `/tmp/orca-desktop-release-${version}-${Date.now()}`
  remoteCommand(args, `mkdir -p ${JSON.stringify(remoteTemp)}`)
  const uploadFiles = [macZip, windowsOut, releaseJson]
  if (args.publishSkillPack) {
    uploadFiles.push(skillPackJsonOut, skillPackZipOut)
  }
  scpUpload(args, uploadFiles, remoteTemp)

  const expectedMacSha = release.downloads.macos.sha256
  const expectedWindowsSha = release.downloads.windows.sha256
  const expectedSkillJsonSha = release.dfhis_skill_pack?.manifest.sha256 ?? ''
  const expectedSkillZipSha = release.dfhis_skill_pack?.zip.sha256 ?? ''

  const publishScript = `
set -euo pipefail
ROOT=${JSON.stringify(args.remoteDir)}
SKILL_ROOT=${JSON.stringify(args.remoteSkillPackDir)}
VERSION=${JSON.stringify(version)}
TMP=${JSON.stringify(remoteTemp)}
test "$(sha256sum "$TMP/orca-macos-arm64.zip" | awk '{print $1}')" = ${JSON.stringify(expectedMacSha)}
test "$(sha256sum "$TMP/orca-windows-setup.exe" | awk '{print $1}')" = ${JSON.stringify(expectedWindowsSha)}
${
  args.publishSkillPack
    ? `test "$(sha256sum "$TMP/dfhis-skill-pack.json" | awk '{print $1}')" = ${JSON.stringify(expectedSkillJsonSha)}
test "$(sha256sum "$TMP/dfhis-skill-pack.zip" | awk '{print $1}')" = ${JSON.stringify(expectedSkillZipSha)}
NEW_SKILL_COUNT=${JSON.stringify(String(skillPackSkillCount))}
ALLOW_SKILL_PACK_SHRINK=${args.allowSkillPackShrink ? '1' : '0'}
if test -f "$SKILL_ROOT/dfhis-skill-pack.json"; then
  CURRENT_SKILL_COUNT=$(SKILL_MANIFEST="$SKILL_ROOT/dfhis-skill-pack.json" python3 - <<'PY'
import json
import os
from pathlib import Path

manifest = json.loads(Path(os.environ["SKILL_MANIFEST"]).read_text(encoding="utf-8"))
names = {
    str(item.get("path") or "").split("/", 1)[0]
    for item in manifest.get("files", [])
    if "/" in str(item.get("path") or "")
}
print(len(names))
PY
)
  if test "$NEW_SKILL_COUNT" -lt "$CURRENT_SKILL_COUNT" && test "$ALLOW_SKILL_PACK_SHRINK" != 1; then
    echo "Refusing to shrink live DFHIS skill pack from $CURRENT_SKILL_COUNT to $NEW_SKILL_COUNT skills. Re-run with --allow-skill-pack-shrink only after explicit review." >&2
    exit 1
  fi
  BACKUP_DIR="$SKILL_ROOT/backups/$(date +%Y%m%d-%H%M%S)-before-orca-$VERSION-$$"
  mkdir -p "$BACKUP_DIR"
  cp -p "$SKILL_ROOT/dfhis-skill-pack.json" "$BACKUP_DIR/"
  if test -f "$SKILL_ROOT/dfhis-skill-pack.zip"; then
    cp -p "$SKILL_ROOT/dfhis-skill-pack.zip" "$BACKUP_DIR/"
  fi
  (cd "$BACKUP_DIR" && sha256sum dfhis-skill-pack.* > SHA256SUMS)
fi`
    : ''
}
mkdir -p "$ROOT/releases/$VERSION"
mv "$TMP/orca-macos-arm64.zip" "$ROOT/releases/$VERSION/orca-macos-arm64.zip"
mv "$TMP/orca-windows-setup.exe" "$ROOT/releases/$VERSION/orca-windows-setup.exe"
mv "$TMP/release.json" "$ROOT/releases/$VERSION/release.json"
${
  args.publishSkillPack
    ? `mkdir -p "$SKILL_ROOT"
SKILL_JSON_TMP="$SKILL_ROOT/.dfhis-skill-pack-$VERSION-$$.json.tmp"
SKILL_ZIP_TMP="$SKILL_ROOT/.dfhis-skill-pack-$VERSION-$$.zip.tmp"
mv -f "$TMP/dfhis-skill-pack.json" "$SKILL_JSON_TMP"
mv -f "$TMP/dfhis-skill-pack.zip" "$SKILL_ZIP_TMP"
mv -f "$SKILL_JSON_TMP" "$SKILL_ROOT/dfhis-skill-pack.json"
mv -f "$SKILL_ZIP_TMP" "$SKILL_ROOT/dfhis-skill-pack.zip"
test "$(sha256sum "$SKILL_ROOT/dfhis-skill-pack.json" | awk '{print $1}')" = ${JSON.stringify(expectedSkillJsonSha)}
test "$(sha256sum "$SKILL_ROOT/dfhis-skill-pack.zip" | awk '{print $1}')" = ${JSON.stringify(expectedSkillZipSha)}
PUBLISHED_SKILL_COUNT=$(SKILL_MANIFEST="$SKILL_ROOT/dfhis-skill-pack.json" python3 - <<'PY'
import json
import os
from pathlib import Path

manifest = json.loads(Path(os.environ["SKILL_MANIFEST"]).read_text(encoding="utf-8"))
names = {
    str(item.get("path") or "").split("/", 1)[0]
    for item in manifest.get("files", [])
    if "/" in str(item.get("path") or "")
}
print(len(names))
PY
)
test "$PUBLISHED_SKILL_COUNT" = "$NEW_SKILL_COUNT"`
    : ''
}
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
  if (args.publishSkillPack) {
    console.log('DFHIS skills: /static/downloads/dfhis/dfhis-skill-pack.json')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
