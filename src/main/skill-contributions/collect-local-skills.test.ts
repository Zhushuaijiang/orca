import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectLocalSkills, type SkillHomeRoot } from './collect-local-skills'
import { aggregateSkillFilesSha256 as aggregateFilesSha256ForTest } from './upload-state'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/orca-skill-contrib-collect-test' }
}))

const temporaryDirectories: string[] = []

async function createFixture(): Promise<{
  root: string
  skillsRoot: string
  bundledRoot: string
  roots: SkillHomeRoot[]
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'orca-skill-contrib-collect-'))
  temporaryDirectories.push(root)
  const skillsRoot = path.join(root, 'agents-skills')
  const claudeRoot = path.join(root, 'claude-skills')
  const bundledRoot = path.join(root, 'bundled')
  await mkdir(skillsRoot, { recursive: true })
  await mkdir(claudeRoot, { recursive: true })
  await mkdir(bundledRoot, { recursive: true })
  return {
    root,
    skillsRoot,
    bundledRoot,
    roots: [
      { label: 'agents', directory: skillsRoot },
      { label: 'claude', directory: claudeRoot }
    ]
  }
}

async function writeSkill(root: string, name: string, files: Record<string, string | Buffer>) {
  const directory = path.join(root, name)
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(directory, ...relativePath.split('/'))
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, content)
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe('collectLocalSkills', () => {
  it('skips official skills that match the bundled source hash', async () => {
    const { skillsRoot, bundledRoot, roots } = await createFixture()
    const files = { 'SKILL.md': 'official skill\n', 'scripts/run.sh': '#!/bin/sh\n' }
    await writeSkill(bundledRoot, 'his-workflow-harness', files)
    await writeSkill(skillsRoot, 'his-workflow-harness', files)

    const result = await collectLocalSkills({
      skillHomeRoots: roots,
      bundledSkillPackPath: bundledRoot,
      officialSkillNames: ['his-workflow-harness']
    })

    expect(result.skills).toEqual([])
    expect(result.skipped).toEqual([
      { name: 'his-workflow-harness', reason: 'official-skill-unmodified' }
    ])
  })

  it('collects official skills that were modified locally', async () => {
    const { skillsRoot, bundledRoot, roots } = await createFixture()
    await writeSkill(bundledRoot, 'his-workflow-harness', { 'SKILL.md': 'original\n' })
    await writeSkill(skillsRoot, 'his-workflow-harness', { 'SKILL.md': 'locally improved\n' })

    const result = await collectLocalSkills({
      skillHomeRoots: roots,
      bundledSkillPackPath: bundledRoot,
      officialSkillNames: ['his-workflow-harness']
    })

    expect(result.skills.map((skill) => skill.name)).toEqual(['his-workflow-harness'])
    expect(result.skills[0]?.files).toHaveLength(1)
    expect(result.skills[0]?.files[0]?.path).toBe('SKILL.md')
    expect(result.skills[0]?.files[0]?.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(result.skills[0]?.sourceHomes).toEqual(['agents'])
  })

  it('collects non-official skills and skips hidden and non-skill noise', async () => {
    const { skillsRoot, bundledRoot, roots } = await createFixture()
    await writeSkill(skillsRoot, 'my-custom-skill', {
      'SKILL.md': 'custom\n',
      'references/a.md': 'a\n',
      '.DS_Store': 'noise',
      'node_modules/pkg/index.js': 'noise',
      '__pycache__/x.pyc': 'noise',
      '.git/config': 'noise'
    })
    await writeSkill(skillsRoot, '.hidden-skill', { 'SKILL.md': 'hidden\n' })

    const result = await collectLocalSkills({
      skillHomeRoots: roots,
      bundledSkillPackPath: bundledRoot,
      officialSkillNames: []
    })

    expect(result.skills.map((skill) => skill.name)).toEqual(['my-custom-skill'])
    const paths = result.skills[0]?.files.map((file) => file.path).sort()
    expect(paths).toEqual(['SKILL.md', 'references/a.md'])
  })

  it('dedupes symlinked skill directories across agent homes', async () => {
    const { skillsRoot, bundledRoot, roots, root } = await createFixture()
    await writeSkill(skillsRoot, 'shared-skill', { 'SKILL.md': 'shared\n' })
    await symlink(
      path.join(skillsRoot, 'shared-skill'),
      path.join(root, 'claude-skills', 'shared-skill'),
      'dir'
    )

    const result = await collectLocalSkills({
      skillHomeRoots: roots,
      bundledSkillPackPath: bundledRoot,
      officialSkillNames: []
    })

    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]?.name).toBe('shared-skill')
    expect(result.skills[0]?.sourceHomes).toEqual(['agents', 'claude'])
  })

  it('keeps same-named skills with different content as distinct identities', async () => {
    const { skillsRoot, bundledRoot, roots, root } = await createFixture()
    await writeSkill(skillsRoot, 'dup-skill', { 'SKILL.md': 'agents version\n' })
    await writeSkill(path.join(root, 'claude-skills'), 'dup-skill', {
      'SKILL.md': 'claude version\n'
    })

    const result = await collectLocalSkills({
      skillHomeRoots: roots,
      bundledSkillPackPath: bundledRoot,
      officialSkillNames: []
    })

    expect(result.skills.map((skill) => skill.name)).toEqual(['dup-skill', 'dup-skill-claude'])
  })

  it('skips official skills matching the remote pack digest instead of the bundle', async () => {
    const { skillsRoot, bundledRoot, roots } = await createFixture()
    await writeSkill(bundledRoot, 'his-workflow-harness', { 'SKILL.md': 'repo version\n' })
    await writeSkill(skillsRoot, 'his-workflow-harness', { 'SKILL.md': 'remote newer version\n' })
    const remoteFiles = [
      {
        path: 'SKILL.md',
        sha256: createHash('sha256').update('remote newer version\n').digest('hex')
      }
    ]

    const result = await collectLocalSkills({
      skillHomeRoots: roots,
      bundledSkillPackPath: bundledRoot,
      officialSkillNames: ['his-workflow-harness'],
      remoteOfficialAggregates: new Map([
        ['his-workflow-harness', new Set([aggregateFilesSha256ForTest(remoteFiles)])]
      ])
    })

    expect(result.skills).toEqual([])
    expect(result.skipped).toEqual([
      { name: 'his-workflow-harness', reason: 'official-skill-unmodified' }
    ])
  })

  it('merges identical copies across homes into one contribution', async () => {
    const { skillsRoot, bundledRoot, roots, root } = await createFixture()
    await writeSkill(skillsRoot, 'copy-skill', { 'SKILL.md': 'same\n' })
    await writeSkill(path.join(root, 'claude-skills'), 'copy-skill', { 'SKILL.md': 'same\n' })

    const result = await collectLocalSkills({
      skillHomeRoots: roots,
      bundledSkillPackPath: bundledRoot,
      officialSkillNames: []
    })

    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]?.name).toBe('copy-skill')
    expect(result.skills[0]?.sourceHomes).toEqual(['agents', 'claude'])
  })

  it('skips files over 1MB but keeps the rest of the skill', async () => {
    const { skillsRoot, bundledRoot, roots } = await createFixture()
    await writeSkill(skillsRoot, 'heavy-file-skill', {
      'SKILL.md': 'small\n',
      'big.bin': Buffer.alloc(1024 * 1024 + 1, 1)
    })

    const result = await collectLocalSkills({
      skillHomeRoots: roots,
      bundledSkillPackPath: bundledRoot,
      officialSkillNames: []
    })

    expect(result.skills[0]?.files.map((file) => file.path)).toEqual(['SKILL.md'])
  })

  it('skips files containing secret-looking tokens', async () => {
    const { skillsRoot, bundledRoot, roots } = await createFixture()
    await writeSkill(skillsRoot, 'leaky-skill', {
      'SKILL.md': 'safe\n',
      'references/keys.md': 'vision key: sk-0123456789abcdef0123456789abcdef\n'
    })

    const result = await collectLocalSkills({
      skillHomeRoots: roots,
      bundledSkillPackPath: bundledRoot,
      officialSkillNames: []
    })

    expect(result.skills[0]?.files.map((file) => file.path)).toEqual(['SKILL.md'])
  })

  it('skips a skill whose total size exceeds 5MB', async () => {
    const { skillsRoot, bundledRoot, roots } = await createFixture()
    const files: Record<string, Buffer> = { 'SKILL.md': Buffer.from('index\n') }
    for (let index = 0; index < 6; index += 1) {
      files[`blob-${index}.bin`] = Buffer.alloc(1024 * 1024, index)
    }
    await writeSkill(skillsRoot, 'huge-skill', files)

    const result = await collectLocalSkills({
      skillHomeRoots: roots,
      bundledSkillPackPath: bundledRoot,
      officialSkillNames: []
    })

    expect(result.skills).toEqual([])
    expect(result.skipped).toEqual([{ name: 'huge-skill', reason: 'skill-too-large' }])
  })

  it('returns an empty result when the skills root does not exist', async () => {
    const result = await collectLocalSkills({
      skillHomeRoots: [
        { label: 'agents', directory: path.join(tmpdir(), 'orca-skill-contrib-missing-root') }
      ],
      bundledSkillPackPath: tmpdir(),
      officialSkillNames: []
    })

    expect(result).toEqual({ skills: [], skipped: [] })
  })
})
