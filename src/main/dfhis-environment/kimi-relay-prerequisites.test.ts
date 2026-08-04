import { describe, expect, it } from 'vitest'
import {
  buildRelayExecModelToml,
  getKimiInstallCommand,
  hasKimiModelAlias,
  resolveKimiHome
} from './kimi-relay-prerequisites'

describe('kimi relay prerequisites', () => {
  it('resolves kimi home from KIMI_CODE_HOME with homedir fallback', () => {
    expect(resolveKimiHome({ KIMI_CODE_HOME: ' /data/kimi ' }, '/home/u')).toBe('/data/kimi')
    expect(resolveKimiHome({}, '/home/u')).toBe('/home/u/.kimi-code')
  })

  it('detects model aliases in kimi config.toml', () => {
    const text = '[models."deepseek/deepseek-v4-flash"]\nprovider = "deepseek"\n'
    expect(hasKimiModelAlias(text, 'deepseek/deepseek-v4-flash')).toBe(true)
    expect(hasKimiModelAlias(text, 'kimi-code/k3')).toBe(false)
    expect(hasKimiModelAlias('', 'deepseek/deepseek-v4-flash')).toBe(false)
  })

  it('builds the deepseek exec model block with provider and capabilities', () => {
    const block = buildRelayExecModelToml('deepseek/deepseek-v4-flash', 'sk-test')
    expect(block).toContain('[providers.deepseek]')
    expect(block).toContain('api_key = "sk-test"')
    expect(block).toContain('[models."deepseek/deepseek-v4-flash"]')
    expect(block).toContain('max_context_size = 1000000')
    expect(block).toContain('capabilities = ["thinking", "tool_use"]')
  })

  it('refuses to template unknown exec model aliases', () => {
    expect(buildRelayExecModelToml('openai/gpt-5', 'sk-test')).toBeNull()
    expect(buildRelayExecModelToml('deepseek/deepseek-chat', 'sk-test')).toBeNull()
  })

  it('uses the official kimi install command per platform', () => {
    expect(getKimiInstallCommand('win32')).toBe(
      'irm https://code.kimi.com/kimi-code/install.ps1 | iex'
    )
    expect(getKimiInstallCommand('darwin')).toBe(
      'curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash'
    )
    expect(getKimiInstallCommand('linux')).toBe(
      'curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash'
    )
  })
})
