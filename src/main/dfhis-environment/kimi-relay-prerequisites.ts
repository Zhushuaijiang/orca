import { existsSync } from 'node:fs'
import { appendFile, copyFile, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import type { DfHisEnvironmentPrerequisiteResult } from '../../shared/dfhis-environment-types'
import type { DfHisEnvironmentConfig } from './config'
import { runDfHisCommand } from './cli-prerequisites'

const KIMI_INSTALL_TIMEOUT_MS = 10 * 60 * 1000
const DEEPSEEK_EXEC_ALIAS = 'deepseek/deepseek-v4-flash'

export function resolveKimiHome(env: NodeJS.ProcessEnv, home: string): string {
  return env.KIMI_CODE_HOME?.trim() || path.join(home, '.kimi-code')
}

export function hasKimiModelAlias(configTomlText: string, alias: string): boolean {
  return configTomlText.includes(`[models."${alias}"]`)
}

export function buildRelayExecModelToml(alias: string, apiKey: string): string | null {
  if (alias !== DEEPSEEK_EXEC_ALIAS) {
    return null
  }
  return `
[providers.deepseek]
type = "openai"
base_url = "https://api.deepseek.com/v1"
api_key = "${apiKey}"

[models."${DEEPSEEK_EXEC_ALIAS}"]
provider = "deepseek"
model = "deepseek-v4-flash"
max_context_size = 1000000
max_output_size = 384000
capabilities = ["thinking", "tool_use"]
`
}

export function getKimiInstallCommand(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32'
    ? 'irm https://code.kimi.com/kimi-code/install.ps1 | iex'
    : 'curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash'
}

async function findKimiBinary(kimiHome: string): Promise<string | null> {
  const candidates =
    process.platform === 'win32'
      ? [path.join(kimiHome, 'bin', 'kimi.exe'), path.join(kimiHome, 'bin', 'kimi.cmd')]
      : [path.join(kimiHome, 'bin', 'kimi')]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  const probe = await runDfHisCommand('kimi', ['--version'], 4000)
  return probe.ok ? 'kimi' : null
}

export async function checkKimiCliPrerequisite(): Promise<DfHisEnvironmentPrerequisiteResult> {
  const kimiHome = resolveKimiHome(process.env, homedir())
  const binary = await findKimiBinary(kimiHome)
  if (!binary) {
    return {
      id: 'kimi-cli',
      label: 'Kimi Code CLI',
      status: 'missing',
      summary: 'kimi is not installed',
      detail:
        'Model relay workers launch through kimi; install it, then run /login once for Kimi K3.',
      command: getKimiInstallCommand(),
      fixable: true
    }
  }
  const version = await runDfHisCommand(binary, ['--version'], 4000)
  return {
    id: 'kimi-cli',
    label: 'Kimi Code CLI',
    status: 'ok',
    summary: 'kimi is available',
    detail: version.stdout.trim() || binary,
    fixable: false
  }
}

export async function checkRelayExecModelPrerequisite(
  config: DfHisEnvironmentConfig
): Promise<DfHisEnvironmentPrerequisiteResult> {
  const kimiHome = resolveKimiHome(process.env, homedir())
  const configPath = path.join(kimiHome, 'config.toml')
  const text = existsSync(configPath) ? await readFile(configPath, 'utf8') : ''
  if (hasKimiModelAlias(text, config.relayExecModel)) {
    return {
      id: 'relay-exec-model',
      label: 'Relay exec model',
      status: 'ok',
      summary: `Exec model available: kimi:${config.relayExecModel}`,
      fixable: false
    }
  }
  if (config.relayExecApiKey && config.relayExecModel === DEEPSEEK_EXEC_ALIAS) {
    return {
      id: 'relay-exec-model',
      label: 'Relay exec model',
      status: 'missing',
      summary: 'Exec model alias is not in kimi config yet',
      detail: 'Save & install will append the deepseek provider/model block to kimi config.toml.',
      fixable: true
    }
  }
  return {
    id: 'relay-exec-model',
    label: 'Relay exec model',
    status: 'ok',
    summary: `Not configured; relay falls back to single-model k3`,
    detail: `To enable cheaper exec stages, add ${config.relayExecModel} in kimi (/provider), or save an exec model API key here and Save & install.`,
    fixable: false
  }
}

async function installKimiCli(): Promise<string> {
  if (await findKimiBinary(resolveKimiHome(process.env, homedir()))) {
    return 'Kimi Code CLI already available.'
  }
  const install =
    process.platform === 'win32'
      ? await runDfHisCommand(
          'powershell',
          ['-NoProfile', '-Command', 'irm https://code.kimi.com/kimi-code/install.ps1 | iex'],
          KIMI_INSTALL_TIMEOUT_MS
        )
      : await runDfHisCommand(
          'bash',
          ['-c', 'curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash'],
          KIMI_INSTALL_TIMEOUT_MS
        )
  if (!install.ok) {
    return `Kimi Code CLI auto-install failed: ${install.stderr.trim() || install.errorMessage || 'unknown error'}. Run ${getKimiInstallCommand()} manually.`
  }
  if (!(await findKimiBinary(resolveKimiHome(process.env, homedir())))) {
    return 'Kimi Code CLI auto-install failed: installer completed but kimi is still not on PATH.'
  }
  return 'Kimi Code CLI installed. Run /login inside kimi once to activate Kimi K3.'
}

async function installRelayExecModel(config: DfHisEnvironmentConfig): Promise<string> {
  const kimiHome = resolveKimiHome(process.env, homedir())
  const configPath = path.join(kimiHome, 'config.toml')
  const text = existsSync(configPath) ? await readFile(configPath, 'utf8') : ''
  if (hasKimiModelAlias(text, config.relayExecModel)) {
    return `Relay exec model already configured: kimi:${config.relayExecModel}.`
  }
  if (!config.relayExecApiKey) {
    return `Relay exec model not configured; relay falls back to single-model k3. Add ${config.relayExecModel} in kimi (/provider) or save an exec model API key to enable one-click setup.`
  }
  const block = buildRelayExecModelToml(config.relayExecModel, config.relayExecApiKey)
  if (!block) {
    return `Relay exec model auto-install skipped: ${config.relayExecModel} is not a known template. Add it in kimi (/provider) manually.`
  }
  if (existsSync(configPath)) {
    await copyFile(configPath, `${configPath}.bak-relay`)
    await appendFile(configPath, block, 'utf8')
  } else {
    await writeFile(configPath, block, { encoding: 'utf8', mode: 0o600 })
  }
  const after = await readFile(configPath, 'utf8')
  if (!hasKimiModelAlias(after, config.relayExecModel)) {
    return 'Relay exec model auto-install failed: alias still missing after writing kimi config.toml.'
  }
  return `Relay exec model installed into kimi config.toml: kimi:${config.relayExecModel}.`
}

export async function ensureKimiRelayInstalled(config: DfHisEnvironmentConfig): Promise<string[]> {
  return [await installKimiCli(), await installRelayExecModel(config)]
}
