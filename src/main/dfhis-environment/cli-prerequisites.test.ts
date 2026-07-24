import { describe, expect, it } from 'vitest'
import { getDfHisCliInstallCommand } from './cli-prerequisites'

describe('dfhis cli prerequisites', () => {
  it('uses silent winget commands on Windows', () => {
    expect(getDfHisCliInstallCommand('git', 'win32')).toBe(
      'winget install --silent --accept-source-agreements --accept-package-agreements -e --id Git.Git'
    )
    expect(getDfHisCliInstallCommand('python', 'win32')).toBe(
      'winget install --silent --accept-source-agreements --accept-package-agreements -e --id Python.Python.3.12'
    )
    expect(getDfHisCliInstallCommand('glab', 'win32')).toBe(
      'winget install --silent --accept-source-agreements --accept-package-agreements -e --id GLab.GLab'
    )
  })

  it('uses Homebrew commands on macOS', () => {
    expect(getDfHisCliInstallCommand('git', 'darwin')).toBe('brew install git')
    expect(getDfHisCliInstallCommand('python', 'darwin')).toBe('brew install python')
    expect(getDfHisCliInstallCommand('glab', 'darwin')).toBe('brew install glab')
  })

  it('keeps Linux command guidance explicit for tools that need distribution setup', () => {
    expect(getDfHisCliInstallCommand('git', 'linux')).toBe('sudo apt-get install -y git')
    expect(getDfHisCliInstallCommand('python', 'linux')).toBe('sudo apt-get install -y python3')
    expect(getDfHisCliInstallCommand('glab', 'linux')).toContain('docs.gitlab.com/cli')
  })
})
