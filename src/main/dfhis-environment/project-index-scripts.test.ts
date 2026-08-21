import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)
const scriptsRoot = path.join(
  process.cwd(),
  'resources',
  'dfhis',
  'his-workflow-harness',
  'scripts'
)
const projectIndexScript = path.join(scriptsRoot, 'project-index.mjs')
const codeGraphScript = path.join(scriptsRoot, 'project-code-graph.mjs')
const temporaryDirectories: string[] = []

async function git(repo: string, args: string[]): Promise<void> {
  await execFile('git', ['-C', repo, ...args])
}

async function createRepository(root: string, name: string, file: string, source: string) {
  const repo = path.join(root, name)
  await mkdir(path.dirname(path.join(repo, file)), { recursive: true })
  await writeFile(path.join(repo, file), source)
  await git(repo, ['init', '-q'])
  await git(repo, ['config', 'user.name', 'Orca Test'])
  await git(repo, ['config', 'user.email', 'orca-test@example.invalid'])
  await git(repo, ['add', '.'])
  await git(repo, ['commit', '-qm', 'fixture'])
  return repo
}

type ScriptResult = {
  code: {
    repositories: number
    rebuiltRepositories: number
    symbols: number
  }
  repositories: number
  reusedRepositories: number
  rebuiltRepositories: number
  hits: Record<string, unknown>[]
  fullTextHits: Record<string, unknown>[]
}

async function runJson(script: string, args: string[]): Promise<ScriptResult> {
  const { stdout } = await execFile(process.execPath, [script, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  })
  return JSON.parse(stdout) as ScriptResult
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('multi-project index scripts', () => {
  it('indexes relative manifest roots and reuses unchanged repositories', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'orca-project-index-'))
    temporaryDirectories.push(root)
    await createRepository(
      path.join(root, 'code', 'his'),
      'df-his-orders',
      'src/OrderService.java',
      'class OrderService { public void saveOrder() {} }\n'
    )
    await createRepository(
      path.join(root, 'code', 'ygt'),
      'df-ygt-patient',
      'src/PatientController.java',
      '@RestController class PatientController { @GetMapping("/patients") public void listPatients() {} }\n'
    )
    const manifestPath = path.join(root, 'manifest.json')
    const codeOutput = path.join(root, 'index', 'code.json')
    const knowledgeOutput = path.join(root, 'index', 'knowledge.json')
    await mkdir(path.join(root, 'knowledge'), { recursive: true })
    await writeFile(
      path.join(root, 'knowledge', 'patient.md'),
      '# 患者查询\n`df-ygt-patient` `PatientController`\n'
    )
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        projects: [
          { id: 'his', aliases: ['HIS'], codeRoots: ['./code/his'], knowledgeRoots: [] },
          {
            id: 'ygt',
            aliases: ['医共体'],
            codeRoots: ['./code/ygt'],
            knowledgeRoots: ['./knowledge']
          }
        ]
      })
    )

    const first = await runJson(projectIndexScript, [
      'build',
      '--manifest',
      manifestPath,
      '--code-output',
      codeOutput,
      '--knowledge-output',
      knowledgeOutput
    ])
    expect(first.code).toMatchObject({ repositories: 2, rebuiltRepositories: 2 })
    expect(first.code.symbols).toBeGreaterThanOrEqual(4)

    const second = await runJson(codeGraphScript, [
      'build',
      '--manifest',
      manifestPath,
      '--output',
      codeOutput
    ])
    expect(second).toMatchObject({ repositories: 2, reusedRepositories: 2, rebuiltRepositories: 0 })

    const search = await runJson(codeGraphScript, [
      'search',
      '--index',
      codeOutput,
      '--project',
      'ygt',
      '--query',
      'PatientController /patients',
      '--limit',
      '1'
    ])
    expect(search.hits[0]).toMatchObject({
      projectId: 'ygt',
      repository: 'df-ygt-patient',
      file: 'src/PatientController.java'
    })
    const unifiedSearch = await runJson(projectIndexScript, [
      'search',
      '--code-index',
      codeOutput,
      '--knowledge-index',
      knowledgeOutput,
      '--project',
      'ygt',
      '--query',
      '患者查询',
      '--limit',
      '2'
    ])
    expect(unifiedSearch.fullTextHits[0]).toMatchObject({
      projectId: 'ygt',
      repository: 'df-ygt-patient'
    })
    expect(JSON.parse(await readFile(manifestPath, 'utf8')).projects[0].codeRoots[0]).toBe(
      './code/his'
    )
  })
})
