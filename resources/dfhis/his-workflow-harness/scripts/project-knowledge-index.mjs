#!/usr/bin/env node

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const INDEX_VERSION = 2
const MANIFEST_VERSION = 1
const DEFAULT_LIMIT = 5
const MAX_SEARCH_TEXT = 24_000
const IGNORED_DIRECTORIES = new Set(['.git', '.ygt-runs', 'dist', 'node_modules', 'target'])

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

function unique(values, limit = 100) {
  return [...new Set(values.filter(Boolean))].slice(0, limit)
}

function resolvePaths(values, base) {
  return (Array.isArray(values) ? values : []).map((value) => path.resolve(base, value))
}

async function loadManifest(manifestPath) {
  const absolutePath = path.resolve(manifestPath)
  const raw = JSON.parse(await fs.readFile(absolutePath, 'utf8'))
  if (raw.version !== MANIFEST_VERSION || !Array.isArray(raw.projects)) {
    throw new Error(`Unsupported project index manifest: ${absolutePath}`)
  }
  const base = path.dirname(absolutePath)
  return {
    path: absolutePath,
    projects: raw.projects.map((project) => ({
      id: project.id,
      label: project.label ?? project.id,
      aliases: unique([project.id, ...(Array.isArray(project.aliases) ? project.aliases : [])]),
      knowledgeRoots: resolvePaths(project.knowledgeRoots, base),
      historyRoots: resolvePaths(project.historyRoots, base),
      historyPriority: Number.isFinite(project.historyPriority) ? project.historyPriority : 0,
      repositoryPatterns: (Array.isArray(project.repositoryPatterns)
        ? project.repositoryPatterns
        : []
      ).map((pattern) => new RegExp(pattern, 'i'))
    }))
  }
}

async function markdownFiles(root) {
  const files = []
  async function walk(directory) {
    let entries
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (entry.isSymbolicLink() || IGNORED_DIRECTORIES.has(entry.name)) {
        continue
      }
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        files.push(fullPath)
      }
    }
  }
  await walk(root)
  return files
}

function compactMarkdown(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/^```[^\n]*|```$/g, ' '))
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_>#|~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractMetadata(markdown) {
  const codeSpans = unique([...markdown.matchAll(/`([^`\n]{2,180})`/g)].map((match) => match[1]))
  const repositories = unique(
    [...markdown.matchAll(/\bdf-[a-z0-9-]+\b/gi)].map((match) => match[0]),
    120
  )
  const symbols = unique(
    codeSpans.filter(
      (value) =>
        value.length <= 140 &&
        !value.includes('/') &&
        /[A-Za-z_$][\w$]*(?:Controller|Service|ServiceImpl|Repository|Mapper|Api|DTO|Req|Vo|\.\w+)/.test(
          value
        )
    ),
    100
  )
  const tables = unique(
    codeSpans.filter((value) => /^[a-z][a-z0-9]*(?:_[a-z0-9]+){1,8}$/i.test(value)),
    80
  )
  const files = unique(
    [
      ...codeSpans,
      ...[
        ...markdown.matchAll(
          /(?:^|[\s(`'"])([A-Za-z0-9_@.-]+(?:\/[A-Za-z0-9_@(). -]+)+\.(?:java|kt|js|jsx|ts|tsx|vue|py|go|rs|cs|sql))(?:$|[\s)`'",])/g
        )
      ].map((match) => match[1])
    ].filter((value) =>
      /(?:^|\/)[^/]+\.(?:java|kt|js|jsx|ts|tsx|vue|py|go|rs|cs|sql)$/i.test(value)
    ),
    100
  )
  return { repositories, symbols, tables, files }
}

function parseDocument(project, root, file, markdown, kind, id = null) {
  const relativePath = path.relative(root, file)
  const title =
    markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? path.basename(file, path.extname(file))
  const metadata = extractMetadata(markdown)
  const text = compactMarkdown(markdown).slice(0, MAX_SEARCH_TEXT)
  return {
    key: `${project.id}/${kind}/${id ?? relativePath}`,
    projectId: project.id,
    kind,
    id,
    title,
    path: file,
    relativePath,
    repositories: metadata.repositories,
    symbols: metadata.symbols,
    tables: metadata.tables,
    files: metadata.files,
    searchText: `${project.label} ${project.aliases.join(' ')} ${title} ${metadata.repositories.join(' ')} ${metadata.symbols.join(' ')} ${metadata.tables.join(' ')} ${metadata.files.join(' ')} ${text}`
  }
}

async function listHistoryRequirementDirectories(root) {
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isDirectory() && /^(?:DFHIS|YGT|ORIGIN)-\d+$/i.test(entry.name))
    .map((entry) => path.join(root, entry.name))
    .sort()
}

async function historyDocument(project, root, requirementDir) {
  const id = path.basename(requirementDir)
  const candidateNames = ['PRD_AND_CODE_ANALYSIS.md', 'requirement.md', 'README.md']
  let file = null
  let markdown = ''
  for (const name of candidateNames) {
    const candidate = path.join(requirementDir, name)
    try {
      markdown = await fs.readFile(candidate, 'utf8')
      file = candidate
      break
    } catch {}
  }
  if (!file) {
    return null
  }
  let codeEntries = []
  try {
    codeEntries = await fs.readdir(path.join(requirementDir, 'code'), { withFileTypes: true })
  } catch {}
  const deliveryRepositories = codeEntries
    .filter((entry) => entry.isDirectory() && /^df-[a-z0-9-]+$/i.test(entry.name))
    .map((entry) => entry.name)
  const routeText = `${id} ${deliveryRepositories.join(' ')} ${markdown.slice(0, 12_000)}`
  if (
    project.repositoryPatterns.length > 0 &&
    !project.repositoryPatterns.some((pattern) => pattern.test(routeText))
  ) {
    return null
  }
  const document = parseDocument(project, root, file, markdown, 'history', id)
  document.repositories = unique([...deliveryRepositories, ...document.repositories])
  document.searchText = `${document.searchText} ${document.repositories.join(' ')}`
  return document
}

function tokenize(value) {
  const normalized = value.toLowerCase().normalize('NFKC')
  const tokens = normalized.match(/[a-z][a-z0-9_$./:-]{1,}|\d+(?:\.\d+)*|[\u3400-\u9fff]+/g) ?? []
  const output = []
  for (const token of tokens) {
    if (/^[\u3400-\u9fff]+$/.test(token) && token.length > 1) {
      output.push(token)
      for (let index = 0; index < token.length - 1; index += 1) {
        output.push(token.slice(index, index + 2))
      }
    } else {
      output.push(token)
    }
  }
  return output
}

function termCounts(text) {
  const counts = new Map()
  for (const token of tokenize(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  return counts
}

export function searchIndex(index, query, projectId, limit, excludeKey = null) {
  const documents = index.documents.filter(
    (document) => (!projectId || document.projectId === projectId) && document.key !== excludeKey
  )
  const queryTokens = unique(tokenize(query), 120)
  const counted = documents.map((document) => ({
    document,
    counts: termCounts(document.searchText)
  }))
  const documentFrequency = new Map(
    queryTokens.map((token) => [token, counted.filter((entry) => entry.counts.has(token)).length])
  )
  return counted
    .map(({ document, counts }) => {
      let score = 0
      const matchedTerms = []
      for (const token of queryTokens) {
        const frequency = counts.get(token) ?? 0
        if (frequency === 0) {
          continue
        }
        matchedTerms.push(token)
        score +=
          Math.log(1 + documents.length / (1 + (documentFrequency.get(token) ?? 0))) *
          (1 + Math.log(frequency))
      }
      const queryLower = query.toLowerCase()
      if (document.title.toLowerCase().includes(queryLower)) {
        score += 25
      }
      if (document.repositories.some((repo) => queryLower.includes(repo.toLowerCase()))) {
        score += 15
      }
      score *= 1 + matchedTerms.length / Math.max(queryTokens.length, 1)
      return { document, score, matchedTerms }
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.document.key.localeCompare(right.document.key)
    )
    .slice(0, limit)
    .map(({ document, score, matchedTerms }) => ({
      key: document.key,
      projectId: document.projectId,
      kind: document.kind,
      id: document.id,
      title: document.title,
      path: document.path,
      score: Number(score.toFixed(3)),
      matchedTerms: matchedTerms.slice(0, 20),
      repositories: document.repositories,
      symbols: document.symbols.slice(0, 20),
      tables: document.tables.slice(0, 20),
      files: document.files.slice(0, 20)
    }))
}

async function build(options) {
  const manifestOption = options.manifest ?? process.env.ORCA_PROJECT_INDEX_MANIFEST
  const outputOption = options.output ?? process.env.ORCA_PROJECT_KNOWLEDGE_INDEX_PATH
  if (!manifestOption || !outputOption) {
    throw new Error(
      'build requires --manifest/--output or ORCA_PROJECT_INDEX_MANIFEST/ORCA_PROJECT_KNOWLEDGE_INDEX_PATH'
    )
  }
  const manifest = await loadManifest(manifestOption)
  const projects = options.project
    ? manifest.projects.filter((project) => project.id === options.project)
    : manifest.projects
  if (projects.length === 0) {
    throw new Error(`Unknown project: ${options.project}`)
  }
  const documents = []
  const seenKnowledgeFiles = new Set()
  const seenHistory = new Set()
  for (const project of projects) {
    for (const root of project.knowledgeRoots) {
      for (const file of await markdownFiles(root)) {
        const key = `${project.id}:${file}`
        if (seenKnowledgeFiles.has(key)) {
          continue
        }
        seenKnowledgeFiles.add(key)
        documents.push(
          parseDocument(project, root, file, await fs.readFile(file, 'utf8'), 'knowledge')
        )
      }
    }
    for (const root of project.historyRoots) {
      for (const requirementDir of await listHistoryRequirementDirectories(root)) {
        const key = `${project.id}:${requirementDir}`
        if (seenHistory.has(key)) {
          continue
        }
        seenHistory.add(key)
        const document = await historyDocument(project, root, requirementDir)
        if (document) {
          documents.push(document)
        }
      }
    }
  }
  const deduplicatedDocuments = []
  const historyPositionByDirectory = new Map()
  for (const document of documents) {
    if (document.kind !== 'history') {
      deduplicatedDocuments.push(document)
      continue
    }
    const historyDirectory = path.dirname(document.path)
    const existingPosition = historyPositionByDirectory.get(historyDirectory)
    if (existingPosition === undefined) {
      historyPositionByDirectory.set(historyDirectory, deduplicatedDocuments.length)
      deduplicatedDocuments.push(document)
      continue
    }
    const existing = deduplicatedDocuments[existingPosition]
    const existingPriority =
      projects.find((project) => project.id === existing.projectId)?.historyPriority ?? 0
    const candidatePriority =
      projects.find((project) => project.id === document.projectId)?.historyPriority ?? 0
    if (candidatePriority > existingPriority) {
      deduplicatedDocuments[existingPosition] = document
    }
  }
  const index = {
    version: INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    manifestPath: manifest.path,
    projects: projects.map(({ repositoryPatterns: _patterns, ...project }) => project),
    documentCount: deduplicatedDocuments.length,
    documents: deduplicatedDocuments
  }
  const output = path.resolve(outputOption)
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, `${JSON.stringify(index)}\n`)
  return {
    ok: true,
    command: 'build',
    projects: projects.map((project) => project.id),
    knowledgeDocuments: deduplicatedDocuments.filter((document) => document.kind === 'knowledge')
      .length,
    historyDocuments: deduplicatedDocuments.filter((document) => document.kind === 'history')
      .length,
    documents: deduplicatedDocuments.length,
    output
  }
}

async function search(options) {
  const indexOption = options.index ?? process.env.ORCA_PROJECT_KNOWLEDGE_INDEX_PATH
  if (!indexOption || !options.query) {
    throw new Error('search requires --query and --index or ORCA_PROJECT_KNOWLEDGE_INDEX_PATH')
  }
  const index = JSON.parse(await fs.readFile(path.resolve(indexOption), 'utf8'))
  if (index.version !== INDEX_VERSION || !Array.isArray(index.documents)) {
    throw new Error('Unsupported project knowledge index')
  }
  const parsedLimit = Number.parseInt(options.limit ?? String(DEFAULT_LIMIT), 10)
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 30)
    : DEFAULT_LIMIT
  const hits = searchIndex(index, options.query, options.project, limit)
  return {
    ok: true,
    command: 'search',
    query: options.query,
    project: options.project ?? null,
    count: hits.length,
    hits
  }
}

async function selftest() {
  const project = { id: 'ygt', label: '医共体', aliases: ['YGT'], repositoryPatterns: [] }
  const document = parseDocument(
    project,
    '/docs',
    '/docs/patient.md',
    '# 患者 360 查询链\n`df-ygt-biz-zhusuoyin` `Patient360Controller.getSnapshot`',
    'knowledge'
  )
  const hits = searchIndex({ documents: [document] }, '患者快照 Patient360Controller', 'ygt', 1)
  if (hits[0]?.projectId !== 'ygt' || hits[0].repositories[0] !== 'df-ygt-biz-zhusuoyin') {
    throw new Error(`selftest ranking failed: ${JSON.stringify(hits)}`)
  }
  return { ok: true, command: 'selftest', assertions: 2 }
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
    throw new Error('Usage: project-knowledge-index.mjs build|search|selftest [options]')
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
