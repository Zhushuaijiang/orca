import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const projectDir = resolve(import.meta.dirname, '../..')

describe('DFHIS release pipeline contract', () => {
  it('publishes desktop artifacts and the generated skill pack as one verified delivery', () => {
    const source = readFileSync(
      join(projectDir, 'config/scripts/publish-orca-desktop-release.mjs'),
      'utf8'
    )

    expect(source).toContain("run('pnpm', ['run', 'generate:dfhis-skill-pack'])")
    expect(source).toContain('release.dfhis_skill_pack = {')
    expect(source).toContain('sha256sum "$TMP/orca-macos-arm64.zip"')
    expect(source).toContain('sha256sum "$TMP/orca-windows-setup.exe"')
    expect(source).toContain('sha256sum "$TMP/dfhis-skill-pack.json"')
    expect(source).toContain('sha256sum "$TMP/dfhis-skill-pack.zip"')
    expect(source).toContain('mv -f "$SKILL_JSON_TMP" "$SKILL_ROOT/dfhis-skill-pack.json"')
    expect(source).toContain('mv -f "$SKILL_ZIP_TMP" "$SKILL_ROOT/dfhis-skill-pack.zip"')
    expect(source).toContain('sha256sum "$SKILL_ROOT/dfhis-skill-pack.json"')
    expect(source).toContain('sha256sum "$SKILL_ROOT/dfhis-skill-pack.zip"')
  })

  it('installs and launches the Windows artifact before signing publication', () => {
    const workflow = parse(
      readFileSync(join(projectDir, '.github/workflows/windows-signing-rehearsal.yml'), 'utf8')
    )
    const steps = workflow.jobs.rehearse.steps
    const names = steps.map((step) => step.name)
    const buildIndex = names.indexOf('Build unsigned Windows installer artifact')
    const runtimeIndex = names.indexOf('Install and launch Windows artifact')
    const uploadIndex = names.indexOf('Upload unsigned Windows installer artifact')

    expect(runtimeIndex).toBe(buildIndex + 1)
    expect(uploadIndex).toBe(runtimeIndex + 1)
    expect(steps[runtimeIndex].run).toContain('verify-windows-installer-runtime.ps1')
    expect(steps[runtimeIndex].run).toContain("-EvidencePath 'windows-runtime-evidence.txt'")
    const signedRuntime = steps.find(
      (step) => step.name === 'Install and launch signed Windows artifact'
    )
    expect(signedRuntime.run).toContain("-EvidencePath 'windows-signed-runtime-evidence.txt'")
    const evidenceUpload = steps.find(
      (step) => step.name === 'Upload rehearsal evidence and installer'
    )
    expect(evidenceUpload.with.path).toContain('windows-runtime-evidence.txt')
    expect(evidenceUpload.with.path).toContain('windows-signed-runtime-evidence.txt')
  })
})
