#!/usr/bin/env node

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { searchIndex as searchCode } from './project-code-graph.mjs'
import { searchIndex as searchKnowledge } from './project-knowledge-index.mjs'

function parseArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith('--')) {
      throw new Error(`Unexpected argument: ${key}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${key}`)
    }
    options[key.slice(2)] = value
    index += 1
  }
  return options
}

function routedRepositories(hits, limit = 5) {
  const scores = new Map()
  for (const [index, hit] of hits.entries()) {
    for (const repository of hit.repositories ?? []) {
      scores.set(repository, (scores.get(repository) ?? 0) + 1 / (index + 1))
    }
  }
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([repository]) => repository)
}

function recall(expected, actual) {
  if (expected.length === 0) {
    return null
  }
  const actualSet = new Set(actual)
  return expected.filter((value) => actualSet.has(value)).length / expected.length
}

function fileMatches(expectedFile, actualFile) {
  const normalizedExpected = expectedFile.replaceAll('\\', '/').toLowerCase()
  const normalizedActual = actualFile.replaceAll('\\', '/').toLowerCase()
  return (
    normalizedActual.endsWith(normalizedExpected) ||
    path.basename(normalizedActual) === path.basename(normalizedExpected)
  )
}

function average(values) {
  const usable = values.filter((value) => value !== null)
  return usable.length > 0 ? usable.reduce((total, value) => total + value, 0) / usable.length : 0
}

function mergeRankedHits(directHits, routedHits, limit = 5) {
  const scores = new Map()
  for (const [weight, hits] of [
    [1, directHits],
    [1.25, routedHits]
  ]) {
    for (const [index, hit] of hits.entries()) {
      const key = `${hit.repository}:${hit.file}`
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

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const codePath = options['code-index'] ?? process.env.ORCA_PROJECT_CODE_GRAPH_PATH
  const knowledgePath = options['knowledge-index'] ?? process.env.ORCA_PROJECT_KNOWLEDGE_INDEX_PATH
  if (!codePath || !knowledgePath) {
    throw new Error('evaluation requires --code-index and --knowledge-index')
  }
  const [codeIndex, knowledgeIndex] = await Promise.all([
    fs.readFile(path.resolve(codePath), 'utf8').then((value) => JSON.parse(value)),
    fs.readFile(path.resolve(knowledgePath), 'utf8').then((value) => JSON.parse(value))
  ])
  const knownRepositories = new Set(codeIndex.repositories.map((repo) => repo.name))
  const allHistories = knowledgeIndex.documents.filter(
    (document) =>
      document.kind === 'history' &&
      (!options.project || document.projectId === options.project) &&
      document.repositories.some((repository) => knownRepositories.has(repository))
  )
  const requestedSample = Number.parseInt(options.sample ?? String(allHistories.length), 10)
  const sampleSize = Number.isFinite(requestedSample)
    ? Math.min(Math.max(requestedSample, 1), allHistories.length)
    : allHistories.length
  const histories =
    sampleSize === allHistories.length
      ? allHistories
      : Array.from(
          { length: sampleSize },
          (_, index) => allHistories[Math.floor((index * allHistories.length) / sampleSize)]
        )
  const cases = []
  for (const document of histories) {
    const expectedRepositories = document.repositories.filter((repository) =>
      knownRepositories.has(repository)
    )
    const query = document.title.replace(document.id ?? '', '').trim()
    const baselineHits = searchCode(codeIndex, {
      query,
      project: document.projectId,
      limit: '5'
    })
    const knowledgeHits = searchKnowledge(
      knowledgeIndex,
      query,
      document.projectId,
      3,
      document.key
    )
    const routedForMetric = routedRepositories(knowledgeHits)
    const routed = routedRepositories(knowledgeHits, 12)
    const routedForMetricKnown = routedForMetric.filter((repository) =>
      knownRepositories.has(repository)
    )
    const routedKnown = routed.filter((repository) => knownRepositories.has(repository))
    const routedSymbols = knowledgeHits
      .flatMap((hit) => hit.symbols ?? [])
      .filter((symbol) =>
        /^(?:[A-Za-z_$][\w$]*(?:Controller|Service|ServiceImpl|Repository|Mapper|Api|DTO|Req|Vo)|[A-Z][\w$]*\.[A-Za-z_$][\w$]*(?:\([^)]*\))?)$/.test(
          symbol
        )
      )
      .filter((term, index, all) => all.indexOf(term) === index)
      .slice(0, 6)
    const routedFiles = knowledgeHits
      .flatMap((hit) => hit.files ?? [])
      .map((file) => path.basename(file))
      .filter((term, index, all) => all.indexOf(term) === index)
      .slice(0, 6)
    const routedGraphHits = searchCode(codeIndex, {
      query: [query, ...routedSymbols, ...routedFiles].join(' '),
      project: document.projectId,
      repositories: routedKnown.join(','),
      limit: '5'
    })
    const graphHits = mergeRankedHits(baselineHits, routedGraphHits)
    const baselineRepositories = [...new Set(baselineHits.map((hit) => hit.repository))]
    const graphRepositories = [...new Set(graphHits.map((hit) => hit.repository))]
    const expectedFiles = document.files ?? []
    cases.push({
      id: document.id,
      projectId: document.projectId,
      expectedRepositories,
      expectedFileCount: expectedFiles.length,
      baselineRepositoryRecall: recall(expectedRepositories, baselineRepositories),
      graphRepositoryRecall: recall(expectedRepositories, graphRepositories),
      knowledgeRouteRecall: recall(expectedRepositories, routedForMetricKnown),
      baselineFileHit:
        expectedFiles.length === 0
          ? null
          : expectedFiles.some((expected) =>
              baselineHits.some((hit) => fileMatches(expected, hit.file))
            ),
      graphFileHit:
        expectedFiles.length === 0
          ? null
          : expectedFiles.some((expected) =>
              graphHits.some((hit) => fileMatches(expected, hit.file))
            )
    })
  }
  const fileCases = cases.filter((entry) => entry.expectedFileCount > 0)
  const summary = {
    evaluatedAt: new Date().toISOString(),
    cases: cases.length,
    fileGroundTruthCases: fileCases.length,
    baseline: {
      repositoryRecallAt5: Number(
        average(cases.map((entry) => entry.baselineRepositoryRecall)).toFixed(4)
      ),
      fileHitAt5: Number(
        average(fileCases.map((entry) => (entry.baselineFileHit ? 1 : 0))).toFixed(4)
      )
    },
    phase2: {
      knowledgeRepositoryRecallAt5: Number(
        average(cases.map((entry) => entry.knowledgeRouteRecall)).toFixed(4)
      ),
      graphRepositoryRecallAt5: Number(
        average(cases.map((entry) => entry.graphRepositoryRecall)).toFixed(4)
      ),
      fileHitAt5: Number(average(fileCases.map((entry) => (entry.graphFileHit ? 1 : 0))).toFixed(4))
    }
  }
  const result = { ok: true, command: 'evaluate', summary, cases }
  if (options.output) {
    const output = path.resolve(options.output)
    await fs.mkdir(path.dirname(output), { recursive: true })
    await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`)
  }
  process.stdout.write(`${JSON.stringify({ ok: true, command: 'evaluate', summary }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
