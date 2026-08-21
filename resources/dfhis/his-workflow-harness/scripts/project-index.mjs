#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)
const scriptDirectory = import.meta.dirname

function parseArgs(argv) {
  const [command, ...rest] = argv
  const options = {}
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index]
    if (!key.startsWith('--')) {
      throw new Error(`Unexpected argument: ${key}`)
    }
    const value = rest[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${key}`)
    }
    options[key.slice(2)] = value
    index += 1
  }
  return { command, options }
}

async function run(script, args) {
  const { stdout } = await execFile(
    process.execPath,
    [path.join(scriptDirectory, script), ...args],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    }
  )
  return JSON.parse(stdout)
}

function optionArgs(options, names) {
  return names.flatMap((name) => (options[name] ? [`--${name}`, options[name]] : []))
}

function mergeRankedHits(directHits, routedHits, limit) {
  const scores = new Map()
  for (const [weight, hits] of [
    [1, directHits],
    [1.25, routedHits]
  ]) {
    for (const [index, hit] of hits.entries()) {
      const key = hit.absolutePath ?? `${hit.repository}:${hit.file}`
      const current = scores.get(key) ?? { hit, score: 0 }
      current.score += weight / (index + 1)
      scores.set(key, current)
    }
  }
  return [...scores.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.hit)
}

async function build(options) {
  const manifest = options.manifest ?? process.env.ORCA_PROJECT_INDEX_MANIFEST
  const codeOutput = options['code-output'] ?? process.env.ORCA_PROJECT_CODE_GRAPH_PATH
  const knowledgeOutput =
    options['knowledge-output'] ?? process.env.ORCA_PROJECT_KNOWLEDGE_INDEX_PATH
  if (!manifest || !codeOutput || !knowledgeOutput) {
    throw new Error('build requires manifest, code-output, and knowledge-output paths')
  }
  const common = ['--manifest', manifest, ...optionArgs(options, ['project'])]
  const [code, knowledge] = await Promise.all([
    run('project-code-graph.mjs', ['build', ...common, '--output', codeOutput]),
    run('project-knowledge-index.mjs', ['build', ...common, '--output', knowledgeOutput])
  ])
  return { ok: code.ok && knowledge.ok, command: 'build', code, knowledge }
}

async function search(options) {
  const query = options.query
  const codeIndex = options['code-index'] ?? process.env.ORCA_PROJECT_CODE_GRAPH_PATH
  const knowledgeIndex = options['knowledge-index'] ?? process.env.ORCA_PROJECT_KNOWLEDGE_INDEX_PATH
  if (!query || !codeIndex || !knowledgeIndex) {
    throw new Error('search requires query, code-index, and knowledge-index paths')
  }
  const requestedLimit = Number.parseInt(options.limit ?? '5', 10)
  const knowledgeLimit = String(
    Math.min(Number.isFinite(requestedLimit) ? Math.max(requestedLimit, 1) : 5, 3)
  )
  const common = ['--query', query, ...optionArgs(options, ['project']), '--limit', knowledgeLimit]
  const knowledge = await run('project-knowledge-index.mjs', [
    'search',
    ...common,
    '--index',
    knowledgeIndex
  ])
  const repositoryScores = new Map()
  for (const [hitIndex, hit] of knowledge.hits.slice(0, 3).entries()) {
    for (const repository of hit.repositories ?? []) {
      repositoryScores.set(repository, (repositoryScores.get(repository) ?? 0) + 1 / (hitIndex + 1))
    }
  }
  const routedRepositories = [...repositoryScores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([repository]) => repository)
  const routedSymbols = knowledge.hits
    .slice(0, 3)
    .flatMap((hit) => hit.symbols ?? [])
    .filter((symbol) =>
      /^(?:[A-Za-z_$][\w$]*(?:Controller|Service|ServiceImpl|Repository|Mapper|Api|DTO|Req|Vo)|[A-Z][\w$]*\.[A-Za-z_$][\w$]*(?:\([^)]*\))?)$/.test(
        symbol
      )
    )
    .filter((term, index, all) => all.indexOf(term) === index)
    .slice(0, 6)
  const routedFiles = knowledge.hits
    .slice(0, 3)
    .flatMap((hit) => hit.files ?? [])
    .map((file) => path.basename(file))
    .filter((term, index, all) => all.indexOf(term) === index)
    .slice(0, 6)
  const routingTerms = [...routedRepositories, ...routedSymbols, ...routedFiles]
  const expandedQuery = [query, ...routedSymbols, ...routedFiles].join(' ')
  const codeLimit = String(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 5, 5))
  const codeCommon = [
    ...optionArgs(options, ['project']),
    '--limit',
    codeLimit,
    '--index',
    codeIndex
  ]
  const [directCode, routedCode, fullText] = await Promise.all([
    run('project-code-graph.mjs', ['search', '--query', query, ...codeCommon]),
    routedRepositories.length > 0
      ? run('project-code-graph.mjs', [
          'search',
          '--query',
          expandedQuery,
          '--repositories',
          routedRepositories.join(','),
          ...codeCommon
        ])
      : Promise.resolve({ hits: [] }),
    routedRepositories.length > 0
      ? run('project-code-graph.mjs', [
          'fulltext',
          '--query',
          expandedQuery,
          '--repositories',
          routedRepositories.join(','),
          ...codeCommon
        ])
      : Promise.resolve({ hits: [] })
  ])
  const mergedCodeHits = mergeRankedHits(
    directCode.hits,
    routedCode.hits,
    Number.isFinite(requestedLimit) ? requestedLimit : 5
  )
  const suggestedRepositories = mergedCodeHits
    .flatMap((hit) => (hit.repository ? [hit.repository] : []))
    .filter((repo, index, all) => all.indexOf(repo) === index)
    .slice(0, 12)
  const knowledgeHits = knowledge.hits.map((hit) => ({
    projectId: hit.projectId,
    kind: hit.kind,
    id: hit.id,
    title: hit.title,
    path: hit.path,
    score: hit.score,
    repositories: hit.repositories,
    symbols: hit.symbols.slice(0, 6),
    tables: hit.tables.slice(0, 6),
    files: hit.files.slice(0, 6)
  }))
  const codeHits = mergedCodeHits.map((hit) => ({
    projectId: hit.projectId,
    repository: hit.repository,
    path: hit.absolutePath,
    language: hit.language,
    score: Number(hit.score.toFixed(3)),
    symbols: hit.symbols.slice(0, 6),
    routes: hit.routes.slice(0, 4),
    imports: hit.imports.slice(0, 4),
    references: hit.references.slice(0, 6)
  }))
  const fullTextHits = fullText.hits.map((hit) => ({
    projectId: hit.projectId,
    repository: hit.repository,
    path: hit.absolutePath,
    line: hit.line,
    snippet: hit.snippet,
    matchedTerms: hit.matchedTerms
  }))
  return {
    ok: true,
    command: 'search',
    query,
    project: options.project ?? null,
    routingTerms,
    suggestedRepositories,
    knowledgeHits,
    codeHits,
    fullTextHits
  }
}

async function selftest() {
  const [code, knowledge] = await Promise.all([
    run('project-code-graph.mjs', ['selftest']),
    run('project-knowledge-index.mjs', ['selftest'])
  ])
  return { ok: code.ok && knowledge.ok, command: 'selftest', code, knowledge }
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2))
  const result =
    command === 'build'
      ? await build(options)
      : command === 'search'
        ? await search(options)
        : command === 'selftest'
          ? await selftest()
          : null
  if (!result) {
    throw new Error('Usage: project-index.mjs build|search|selftest [options]')
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
