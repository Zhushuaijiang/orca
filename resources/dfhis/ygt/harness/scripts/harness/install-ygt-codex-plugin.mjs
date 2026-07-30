#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

const defaults = {
  source: repoRoot,
  ref: 'master',
  marketplace: 'df-ygt',
  plugin: 'ygt',
};

const options = parseArgs(process.argv.slice(2));

if (options.help || options.h) {
  printHelp();
  process.exit(0);
}

const source = String(options.source ?? defaults.source);
const marketplace = String(options.marketplace ?? defaults.marketplace);
const plugin = String(options.plugin ?? defaults.plugin);
const ref = String(options.ref ?? defaults.ref);
const isGitSource = /^(git@|https?:\/\/|ssh:\/\/)|^[^/\s]+\/[^/\s]+(@[^/\s]+)?$/.test(source);
const fallbackSourceRoot = isGitSource ? repoRoot : resolve(source);
const canInstallFallback = existsSync(resolve(fallbackSourceRoot, 'plugins', plugin, 'skills', plugin));
let installMode = null;
let fallbackTarget = null;

const marketplaceArgs = ['plugin', 'marketplace', 'add', source];
if (isGitSource) {
  marketplaceArgs.push('--ref', ref, '--sparse', '.agents/plugins', '--sparse', 'plugins/ygt');
}

if (canInstallFallback) {
  fallbackTarget = installSkillFallback(plugin, fallbackSourceRoot);
  installMode = 'skill fallback';
}

const marketplaceAdd = runCodex(marketplaceArgs, {
  tolerateAlreadyExists: true,
  bestEffort: canInstallFallback,
});

const pluginAdd = marketplaceAdd.ok
  ? runCodex(['plugin', 'add', `${plugin}@${marketplace}`], {
    tolerateAlreadyExists: true,
    tolerateUnsupported: true,
    bestEffort: canInstallFallback,
  })
  : { ok: false };

if (pluginAdd.ok) {
  if (fallbackTarget) {
    rmSync(fallbackTarget, { recursive: true, force: true });
    console.log(`Removed fallback skill because plugin install succeeded: ${fallbackTarget}`);
  }
  installMode = 'plugin';
}

if (!pluginAdd.ok && !canInstallFallback) {
  fallbackTarget = installSkillFallback(plugin, repoRoot);
  installMode = 'skill fallback';
}

if (!installMode) {
  throw new Error('YGT install failed: no plugin or skill fallback was installed.');
}

console.log(`YGT Codex ${installMode} is installed: ${plugin}@${marketplace}`);
console.log('Start a new Codex session, then use:');
console.log(`  $${plugin} 菜单接口返回不完整，请排查并修复`);
console.log('You can also start a request with:');
console.log(`  /${plugin} 菜单接口返回不完整，请排查并修复`);

function runCodex(args, options = {}) {
  const result = spawnCodex(args);
  const isMissing = result.error?.code === 'ENOENT';
  // codex not installed (ENOENT) is expected for Codex desktop users without the
  // CLI — suppress the raw "spawnSync codex ENOENT" dump so it doesn't read as a crash.
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${(result.error && !isMissing) ? `\n${result.error.message}` : ''}`;
  if (output.trim()) {
    process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
  }
  if (result.status === 0) {
    return { ok: true, output };
  }
  if (options.tolerateAlreadyExists && /already|exists|installed|enabled|duplicate/i.test(output)) {
    return { ok: true, output };
  }
  if (options.tolerateUnsupported && /unrecognized subcommand|unknown command|unsupported/i.test(output)) {
    return { ok: false, unsupported: true, output };
  }
  if (options.bestEffort) {
    const reason = isMissing
      ? 'codex CLI not found on PATH'
      : (result.error?.message ?? result.signal ?? `exit code ${result.status}`);
    console.log(`Skipping optional Codex CLI step (codex ${args.slice(0, 2).join(' ')}): ${reason}`);
    return { ok: false, output };
  }
  const reason = result.error?.message ?? result.signal ?? `exit code ${result.status}`;
  throw new Error(`codex ${args.join(' ')} failed: ${reason}`);
}

function spawnCodex(args) {
  if (process.platform === 'win32') {
    return spawnWindowsCodex(args);
  }
  return spawnSync('codex', args, {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  });
}

function spawnWindowsCodex(args) {
  const candidates = ['codex.cmd', 'codex.exe', 'codex.bat', 'codex'];
  let lastResult = null;
  for (const command of candidates) {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (result.status === 0 || !['ENOENT', 'EINVAL'].includes(result.error?.code)) {
      return result;
    }
    lastResult = result;
  }
  return lastResult;
}

function installSkillFallback(pluginName, sourceRoot) {
  const codexHome = process.env.CODEX_HOME
    ?? (process.platform === 'win32'
      ? resolve(process.env.USERPROFILE ?? '.', '.codex')
      : resolve(process.env.HOME ?? '.', '.codex'));
  const sourceSkillDir = resolve(sourceRoot, 'plugins', pluginName, 'skills', pluginName);
  const targetSkillDir = resolve(codexHome, 'skills', pluginName);

  if (!existsSync(sourceSkillDir)) {
    throw new Error(`Fallback skill source not found: ${sourceSkillDir}`);
  }

  mkdirSync(dirname(targetSkillDir), { recursive: true });
  rmSync(targetSkillDir, { recursive: true, force: true });
  cpSync(sourceSkillDir, targetSkillDir, { recursive: true });

  console.log(`Installed fallback skill: ${targetSkillDir}`);
  return targetSkillDir;
}

/*
 * Keep the fallback installer above the parser intentionally: Windows desktop
 * installs must succeed even when the local Codex CLI lacks plugin subcommands
 * or exposes codex through a launcher that Node cannot spawn directly.
 */

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined && (value === undefined || value.startsWith('--'))) {
      parsed[key] = true;
      continue;
    }
    if (inlineValue === undefined) {
      index += 1;
    }
    parsed[key] = value;
  }
  return parsed;
}

function printHelp() {
  console.log(`Install the YGT Codex plugin.

Usage:
  node scripts/harness/install-ygt-codex-plugin.mjs
  node scripts/harness/install-ygt-codex-plugin.mjs --source git@gitlab.df-mic.com:df-ygt/df-ygt-main.git --ref master

Options:
  --source <path-or-git-url>   Marketplace source. Defaults to this repository.
  --ref <git-ref>             Git ref for remote marketplace sources. Defaults to master.
  --marketplace <name>        Marketplace name. Defaults to df-ygt.
  --plugin <name>             Plugin name. Defaults to ygt.
`);
}
