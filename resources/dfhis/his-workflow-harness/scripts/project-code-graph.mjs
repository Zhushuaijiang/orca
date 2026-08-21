#!/usr/bin/env node
/* eslint-disable max-lines */

import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)
const INDEX_VERSION = 2
const MANIFEST_VERSION = 1
const DEFAULT_LIMIT = 8
const MAX_SOURCE_BYTES = 1_000_000
const MAX_SYMBOLS_PER_FILE = 300
const MAX_REFERENCES_PER_FILE = 400
const MAX_FULLTEXT_TERMS = 12
const MAX_FULLTEXT_MATCHES_PER_REPOSITORY = 200
const MAX_FULLTEXT_BUFFER = 2 * 1024 * 1024
const SOURCE_EXTENSIONS = new Set([
  '.java',
  '.kt',
  '.kts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.vue',
  '.py',
  '.go',
  '.rs',
  '.cs',
  '.sql'
])
const IGNORED_DIRECTORIES = new Set([
  '.cache',
  '.git',
  '.idea',
  '.vscode',
  '.ygt-runs',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target'
])

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

function unique(values, limit = Number.POSITIVE_INFINITY) {
  return [...new Set(values.filter(Boolean))].slice(0, limit)
}

function normalizeProject(raw, manifestDir) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim()) {
    throw new Error('Every manifest project requires a non-empty id')
  }
  const roots = Array.isArray(raw.codeRoots) ? raw.codeRoots : []
  if (roots.length === 0) {
    throw new Error(`Project ${raw.id} requires at least one codeRoots entry`)
  }
  return {
    id: raw.id.trim(),
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : raw.id.trim(),
    aliases: unique([raw.id.trim(), ...(Array.isArray(raw.aliases) ? raw.aliases : [])]),
    codeRoots: roots.map((root) =>
      path.resolve(manifestDir, typeof root === 'string' ? root : root.path)
    )
  }
}

async function loadManifest(manifestPath) {
  const absolutePath = path.resolve(manifestPath)
  const raw = JSON.parse(await fs.readFile(absolutePath, 'utf8'))
  if (raw.version !== MANIFEST_VERSION || !Array.isArray(raw.projects)) {
    throw new Error(`Unsupported project index manifest: ${absolutePath}`)
  }
  const manifestDir = path.dirname(absolutePath)
  const projects = raw.projects.map((project) => normalizeProject(project, manifestDir))
  const ids = projects.map((project) => project.id)
  if (new Set(ids).size !== ids.length) {
    throw new Error('Project ids must be unique')
  }
  return { path: absolutePath, projects }
}

async function discoverRepositories(roots) {
  const repositories = new Set()
  async function walk(directory) {
    let entries
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    if (entries.some((entry) => entry.name === '.git')) {
      repositories.add(directory)
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink() && !IGNORED_DIRECTORIES.has(entry.name)) {
        await walk(path.join(directory, entry.name))
      }
    }
  }
  for (const root of roots) {
    await walk(root)
  }
  return [...repositories].sort()
}

async function git(repo, args) {
  const { stdout } = await execFile('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  return stdout.trim()
}

async function repositoryFingerprint(repo) {
  const [head, status] = await Promise.all([
    git(repo, ['rev-parse', 'HEAD']).catch(() => ''),
    git(repo, ['status', '--porcelain=v1', '-uno']).catch(() => '')
  ])
  const dirtyStats = []
  for (const line of status.split('\n').filter(Boolean)) {
    const rawPath = line.slice(3).split(' -> ').at(-1)
    if (!rawPath) {
      continue
    }
    try {
      const stat = await fs.stat(path.join(repo, rawPath))
      dirtyStats.push(`${rawPath}:${stat.size}:${stat.mtimeMs}`)
    } catch {
      dirtyStats.push(`${rawPath}:missing`)
    }
  }
  return createHash('sha256')
    .update([head, status, ...dirtyStats].join('\n'))
    .digest('hex')
}

function lineNumberAt(source, offset) {
  let line = 1
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1
    }
  }
  return line
}

function capture(source, pattern, kind, group = 1) {
  return [...source.matchAll(pattern)].map((match) => ({
    name: match[group],
    kind,
    line: lineNumberAt(source, match.index ?? 0)
  }))
}

function extractSymbols(extension, source) {
  const symbols = []
  if (['.java', '.kt', '.kts', '.cs'].includes(extension)) {
    symbols.push(
      ...capture(source, /\b(?:class|interface|enum|record|object)\s+([A-Za-z_$][\w$]*)/g, 'type'),
      ...capture(
        source,
        /\b(?:public|protected|private|static|final|suspend|abstract|override|open|internal|async|virtual|sealed|\s)+[\w<>,.?[\] ]+\s+([A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*(?:throws\s+[^{]+)?\{/g,
        'method'
      )
    )
  } else if (['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.vue'].includes(extension)) {
    symbols.push(
      ...capture(source, /\b(?:class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/g, 'type'),
      ...capture(source, /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g, 'function'),
      ...capture(
        source,
        /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
        'function'
      )
    )
  } else if (extension === '.py') {
    symbols.push(
      ...capture(source, /^\s*class\s+([A-Za-z_][\w]*)/gm, 'type'),
      ...capture(source, /^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/gm, 'function')
    )
  } else if (['.go', '.rs'].includes(extension)) {
    symbols.push(
      ...capture(source, /\b(?:type|struct|enum|trait)\s+([A-Za-z_][\w]*)/g, 'type'),
      ...capture(source, /\bfn\s+([A-Za-z_][\w]*)\s*\(/g, 'function'),
      ...capture(source, /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)\s*\(/g, 'function')
    )
  }
  return unique(
    symbols
      .filter((symbol) => symbol.name && symbol.name.length >= 2)
      .map((symbol) => JSON.stringify(symbol)),
    MAX_SYMBOLS_PER_FILE
  ).map((symbol) => JSON.parse(symbol))
}

function extractImports(extension, source) {
  const imports = []
  if (['.java', '.kt', '.kts'].includes(extension)) {
    imports.push(
      ...[...source.matchAll(/^\s*import\s+(?:static\s+)?([\w.*]+)\s*;?/gm)].map(
        (match) => match[1]
      )
    )
  }
  if (['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.vue'].includes(extension)) {
    imports.push(
      ...[...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)].map(
        (match) => match[1] ?? match[2]
      )
    )
  }
  if (extension === '.py') {
    imports.push(
      ...[...source.matchAll(/^\s*(?:from|import)\s+([\w.]+)/gm)].map((match) => match[1])
    )
  }
  return unique(imports, 120)
}

function extractRoutes(source) {
  return unique(
    [
      ...source.matchAll(
        /@(?:RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\s*\(\s*(?:value\s*=\s*)?["'`]([^"'`]+)|\bpath\s*:\s*["'`]([^"'`]+)|\burl\s*:\s*["'`]([^"'`]+)/g
      )
    ].map((match) => match[1] ?? match[2] ?? match[3]),
    80
  )
}

function extractIdentifierCandidates(source) {
  return unique(source.match(/\b[A-Za-z_$][A-Za-z0-9_$]{2,}\b/g) ?? [], MAX_REFERENCES_PER_FILE * 3)
}

async function inspectFile(repoPath, relativePath) {
  const extension = path.extname(relativePath).toLowerCase()
  if (!SOURCE_EXTENSIONS.has(extension)) {
    return {
      path: relativePath,
      language: extension.slice(1) || 'other',
      symbols: [],
      imports: [],
      routes: []
    }
  }
  const absolutePath = path.join(repoPath, relativePath)
  let stat
  try {
    stat = await fs.stat(absolutePath)
  } catch {
    return null
  }
  if (stat.size > MAX_SOURCE_BYTES) {
    return {
      path: relativePath,
      language: extension.slice(1),
      symbols: [],
      imports: [],
      routes: [],
      skipped: 'large'
    }
  }
  let source
  try {
    source = await fs.readFile(absolutePath, 'utf8')
  } catch {
    return null
  }
  return {
    path: relativePath,
    language: extension.slice(1),
    symbols: extractSymbols(extension, source),
    imports: extractImports(extension, source),
    routes: extractRoutes(source),
    identifierCandidates: extractIdentifierCandidates(source)
  }
}

async function mapConcurrent(values, concurrency, mapper) {
  const output = Array.from({ length: values.length })
  let cursor = 0
  async function worker() {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      output[index] = await mapper(values[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()))
  return output
}

async function scanRepository(project, repoPath, fingerprint) {
  const rawFiles = await git(repoPath, ['ls-files', '-z'])
  const trackedFiles = rawFiles ? rawFiles.split('\0').filter(Boolean) : []
  const files = (
    await mapConcurrent(trackedFiles, 16, (file) => inspectFile(repoPath, file))
  ).filter(Boolean)
  const [remote, branch] = await Promise.all([
    git(repoPath, ['remote', 'get-url', 'origin']).catch(() => ''),
    git(repoPath, ['branch', '--show-current']).catch(() => '')
  ])
  return {
    key: `${project.id}/${path.basename(repoPath)}`,
    projectId: project.id,
    name: path.basename(repoPath),
    path: repoPath,
    remote,
    branch,
    fingerprint,
    trackedFileCount: trackedFiles.length,
    files
  }
}

function resolveReferences(repositories) {
  const definitions = new Set()
  for (const repo of repositories) {
    for (const file of repo.files) {
      for (const symbol of file.symbols) {
        definitions.add(symbol.name)
      }
    }
  }
  for (const repo of repositories) {
    for (const file of repo.files) {
      if (!file.identifierCandidates) {
        continue
      }
      const own = new Set(file.symbols.map((symbol) => symbol.name))
      file.references = file.identifierCandidates
        .filter((identifier) => definitions.has(identifier) && !own.has(identifier))
        .slice(0, MAX_REFERENCES_PER_FILE)
      delete file.identifierCandidates
    }
  }
}

async function readExistingIndex(indexPath) {
  try {
    const index = JSON.parse(await fs.readFile(indexPath, 'utf8'))
    return index.version === INDEX_VERSION && Array.isArray(index.repositories) ? index : null
  } catch {
    return null
  }
}

async function build(options) {
  const manifestOption = options.manifest ?? process.env.ORCA_PROJECT_INDEX_MANIFEST
  const outputOption = options.output ?? process.env.ORCA_PROJECT_CODE_GRAPH_PATH
  if (!manifestOption || !outputOption) {
    throw new Error(
      'build requires --manifest/--output or ORCA_PROJECT_INDEX_MANIFEST/ORCA_PROJECT_CODE_GRAPH_PATH'
    )
  }
  const manifest = await loadManifest(manifestOption)
  const selectedProjects = options.project
    ? manifest.projects.filter((project) => project.id === options.project)
    : manifest.projects
  if (selectedProjects.length === 0) {
    throw new Error(`Unknown project: ${options.project}`)
  }
  const output = path.resolve(outputOption)
  const previous = options.full === 'true' ? null : await readExistingIndex(output)
  const previousByPath = new Map((previous?.repositories ?? []).map((repo) => [repo.path, repo]))
  const repositories = []
  let reusedRepositories = 0
  let rebuiltRepositories = 0
  for (const project of selectedProjects) {
    const repoPaths = await discoverRepositories(project.codeRoots)
    for (const repoPath of repoPaths) {
      const fingerprint = await repositoryFingerprint(repoPath)
      const existing = previousByPath.get(repoPath)
      if (existing?.fingerprint === fingerprint) {
        repositories.push(existing)
        reusedRepositories += 1
      } else {
        repositories.push(await scanRepository(project, repoPath, fingerprint))
        rebuiltRepositories += 1
      }
    }
  }
  resolveReferences(repositories)
  const index = {
    version: INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    manifestPath: manifest.path,
    projects: selectedProjects,
    repositoryCount: repositories.length,
    trackedFileCount: repositories.reduce((total, repo) => total + repo.trackedFileCount, 0),
    indexedSourceFileCount: repositories.reduce(
      (total, repo) =>
        total + repo.files.filter((file) => SOURCE_EXTENSIONS.has(`.${file.language}`)).length,
      0
    ),
    symbolCount: repositories.reduce(
      (total, repo) =>
        total + repo.files.reduce((subtotal, file) => subtotal + file.symbols.length, 0),
      0
    ),
    repositories
  }
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, `${JSON.stringify(index)}\n`)
  return {
    ok: true,
    command: 'build',
    projects: selectedProjects.map((project) => project.id),
    repositories: index.repositoryCount,
    reusedRepositories,
    rebuiltRepositories,
    trackedFiles: index.trackedFileCount,
    indexedSourceFiles: index.indexedSourceFileCount,
    symbols: index.symbolCount,
    output
  }
}

function queryTerms(value) {
  const normalized = value.normalize('NFKC').toLowerCase()
  const base = normalized.match(/[a-z0-9_$./:-]{2,}|[\u3400-\u9fff]+/g) ?? []
  return unique(
    base
      .flatMap((term) =>
        /^[\u3400-\u9fff]+$/.test(term) && term.length > 2
          ? [
              term,
              ...Array.from({ length: term.length - 1 }, (_, index) => term.slice(index, index + 2))
            ]
          : [
              term,
              ...term
                .split(/[.$/:-]+/)
                .filter(
                  (part) => part.length >= 4 && !['backend', 'frontend', 'service'].includes(part)
                )
            ]
      )
      .filter((term) => term.length >= 2),
    100
  )
}

function scoreText(text, terms, weights) {
  const lower = text.toLowerCase()
  let score = 0
  for (const term of terms) {
    if (lower === term) {
      score += weights.exact
    } else if (lower.includes(term)) {
      score += weights.contains
    }
  }
  return score
}

function fullTextTerms(value) {
  return unique(
    (value.normalize('NFKC').match(/[A-Za-z_$][A-Za-z0-9_$./:-]{2,}|[\u3400-\u9fff]{2,}/g) ?? [])
      .flatMap((term) => [term, ...term.split(/[.$/:-]+/)])
      .filter((term) => term.length >= 3 || /^[\u3400-\u9fff]{2,}$/.test(term))
      .sort((left, right) => right.length - left.length),
    MAX_FULLTEXT_TERMS
  )
}

async function grepRepository(repo, terms) {
  const sourcePaths = new Set(repo.files.map((file) => file.path))
  const args = [
    '-C',
    repo.path,
    'grep',
    '-n',
    '-I',
    '-i',
    '-m',
    '2',
    '--full-name',
    '--no-color',
    '-F',
    ...terms.flatMap((term) => ['-e', term]),
    '--',
    ...[...SOURCE_EXTENSIONS].map((extension) => `*${extension}`)
  ]
  let stdout = ''
  try {
    ;({ stdout } = await execFile('git', args, {
      encoding: 'utf8',
      maxBuffer: MAX_FULLTEXT_BUFFER
    }))
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'stdout' in error &&
      typeof error.stdout === 'string'
    ) {
      stdout = error.stdout
    } else if (error && typeof error === 'object' && 'code' in error && error.code === 1) {
      return []
    } else {
      throw error
    }
  }
  return stdout
    .split(/\r?\n/)
    .slice(0, MAX_FULLTEXT_MATCHES_PER_REPOSITORY)
    .flatMap((line) => {
      const match = line.match(/^(.+?):(\d+):(.*)$/)
      if (!match || !sourcePaths.has(match[1])) {
        return []
      }
      const content = match[3].trim().replace(/\s+/g, ' ')
      const lower = `${match[1]} ${content}`.toLowerCase()
      const matchedTerms = terms.filter((term) => lower.includes(term.toLowerCase()))
      return [
        {
          projectId: repo.projectId,
          repository: repo.name,
          file: match[1],
          absolutePath: path.join(repo.path, match[1]),
          line: Number.parseInt(match[2], 10),
          snippet: content.slice(0, 300),
          matchedTerms,
          score: matchedTerms.reduce((total, term) => total + term.length, 0)
        }
      ]
    })
}

export async function fullTextSearchIndex(index, options) {
  const terms = fullTextTerms(options.query)
  if (terms.length === 0) {
    return []
  }
  const projectFilter = options.project?.trim()
  const repositoryFilter = new Set(
    (options.repositories ?? '')
      .split(',')
      .map((repository) => repository.trim())
      .filter(Boolean)
  )
  const repositories = index.repositories.filter(
    (repo) =>
      (!projectFilter || repo.projectId === projectFilter) &&
      (repositoryFilter.size === 0 || repositoryFilter.has(repo.name))
  )
  const matches = (
    await mapConcurrent(repositories, 4, (repo) => grepRepository(repo, terms))
  ).flat()
  const parsedLimit = Number.parseInt(options.limit ?? String(DEFAULT_LIMIT), 10)
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 30)
    : DEFAULT_LIMIT
  return matches
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.repository.localeCompare(right.repository) ||
        left.file.localeCompare(right.file) ||
        left.line - right.line
    )
    .slice(0, limit)
}

export function searchIndex(index, options) {
  const terms = queryTerms(options.query)
  const projectFilter = options.project?.trim()
  const repositoryFilter = new Set(
    (options.repositories ?? '')
      .split(',')
      .map((repository) => repository.trim())
      .filter(Boolean)
  )
  const projectById = new Map((index.projects ?? []).map((project) => [project.id, project]))
  const fileHits = []
  for (const repo of index.repositories) {
    if (projectFilter && repo.projectId !== projectFilter) {
      continue
    }
    if (repositoryFilter.size > 0 && !repositoryFilter.has(repo.name)) {
      continue
    }
    const project = projectById.get(repo.projectId)
    const repoText = `${repo.projectId} ${project?.label ?? ''} ${(project?.aliases ?? []).join(' ')} ${repo.name} ${repo.key}`
    const repoScore = scoreText(repoText, terms, {
      exact: 70,
      contains: 20
    })
    for (const file of repo.files) {
      let score = repoScore + scoreText(file.path, terms, { exact: 45, contains: 12 })
      const matchedSymbols = []
      for (const symbol of file.symbols) {
        const symbolScore = scoreText(symbol.name, terms, { exact: 100, contains: 35 })
        if (symbolScore > 0) {
          score += symbolScore
          matchedSymbols.push(symbol)
        }
      }
      const matchedRoutes = file.routes.filter(
        (route) => scoreText(route, terms, { exact: 80, contains: 25 }) > 0
      )
      const matchedImports = file.imports.filter(
        (entry) => scoreText(entry, terms, { exact: 40, contains: 10 }) > 0
      )
      const matchedReferences = (file.references ?? []).filter(
        (reference) => scoreText(reference, terms, { exact: 50, contains: 15 }) > 0
      )
      score +=
        matchedRoutes.length * 40 + matchedImports.length * 15 + matchedReferences.length * 20
      const searchableText = [
        repoText,
        file.path,
        ...file.symbols.map((symbol) => symbol.name),
        ...file.routes,
        ...file.imports,
        ...(file.references ?? [])
      ]
        .join(' ')
        .toLowerCase()
      const matchedTermCount = terms.filter((term) => searchableText.includes(term)).length
      score += matchedTermCount * 35
      score *= 1 + matchedTermCount / Math.max(terms.length, 1)
      if (file.path.startsWith('docs/') || file.path.includes('/docs/')) {
        score *= 0.45
      }
      if (['md', 'mdx', 'txt'].includes(file.language)) {
        score *= 0.2
      }
      if (score > 0) {
        fileHits.push({
          repo,
          file,
          score,
          matchedSymbols,
          matchedRoutes,
          matchedImports,
          matchedReferences
        })
      }
    }
  }
  const parsedLimit = Number.parseInt(options.limit ?? String(DEFAULT_LIMIT), 10)
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 50)
    : DEFAULT_LIMIT
  return fileHits
    .sort(
      (left, right) => right.score - left.score || left.file.path.localeCompare(right.file.path)
    )
    .slice(0, limit)
    .map(
      ({
        repo,
        file,
        score,
        matchedSymbols,
        matchedRoutes,
        matchedImports,
        matchedReferences
      }) => ({
        projectId: repo.projectId,
        repository: repo.name,
        repositoryPath: repo.path,
        file: file.path,
        absolutePath: path.join(repo.path, file.path),
        language: file.language,
        score,
        symbols: (matchedSymbols.length > 0 ? matchedSymbols : file.symbols).slice(0, 12),
        routes: (matchedRoutes.length > 0 ? matchedRoutes : file.routes).slice(0, 8),
        imports: matchedImports.slice(0, 8),
        references: matchedReferences.slice(0, 12)
      })
    )
}

async function search(options) {
  const indexOption = options.index ?? process.env.ORCA_PROJECT_CODE_GRAPH_PATH
  if (!indexOption || !options.query) {
    throw new Error('search requires --query and --index or ORCA_PROJECT_CODE_GRAPH_PATH')
  }
  const index = await readExistingIndex(path.resolve(indexOption))
  if (!index) {
    throw new Error('Unsupported or missing project code graph')
  }
  const hits = searchIndex(index, options)
  return {
    ok: true,
    command: 'search',
    query: options.query,
    project: options.project ?? null,
    indexedRepositories: index.repositoryCount,
    indexedFiles: index.indexedSourceFileCount,
    indexedSymbols: index.symbolCount,
    count: hits.length,
    hits
  }
}

async function fulltext(options) {
  const indexOption = options.index ?? process.env.ORCA_PROJECT_CODE_GRAPH_PATH
  if (!indexOption || !options.query) {
    throw new Error('fulltext requires --query and --index or ORCA_PROJECT_CODE_GRAPH_PATH')
  }
  const index = await readExistingIndex(path.resolve(indexOption))
  if (!index) {
    throw new Error('Unsupported or missing project code graph')
  }
  const hits = await fullTextSearchIndex(index, options)
  return {
    ok: true,
    command: 'fulltext',
    query: options.query,
    project: options.project ?? null,
    repositories: options.repositories ?? null,
    count: hits.length,
    hits
  }
}

async function status(options) {
  const indexOption = options.index ?? process.env.ORCA_PROJECT_CODE_GRAPH_PATH
  if (!indexOption) {
    throw new Error('status requires --index or ORCA_PROJECT_CODE_GRAPH_PATH')
  }
  const index = await readExistingIndex(path.resolve(indexOption))
  if (!index) {
    return { ok: false, command: 'status', reason: 'missing_or_unsupported' }
  }
  return {
    ok: true,
    command: 'status',
    generatedAt: index.generatedAt,
    projects: index.projects.map((project) => project.id),
    repositories: index.repositoryCount,
    trackedFiles: index.trackedFileCount,
    indexedSourceFiles: index.indexedSourceFileCount,
    symbols: index.symbolCount
  }
}

async function selftest() {
  const source = `package com.df.ygt;\nimport com.df.base.BaseService;\n@RestController\nclass PatientController {\n  @GetMapping("/patients/{id}")\n  public PatientDTO findPatient(String id) { return patientService.find(id); }\n}`
  const symbols = extractSymbols('.java', source)
  const routes = extractRoutes(source)
  const imports = extractImports('.java', source)
  if (!symbols.some((symbol) => symbol.name === 'PatientController')) {
    throw new Error('selftest failed to extract Java type')
  }
  if (!symbols.some((symbol) => symbol.name === 'findPatient')) {
    throw new Error('selftest failed to extract Java method')
  }
  if (routes[0] !== '/patients/{id}' || imports[0] !== 'com.df.base.BaseService') {
    throw new Error('selftest failed to extract route/import')
  }
  const index = {
    repositoryCount: 1,
    indexedSourceFileCount: 1,
    symbolCount: symbols.length,
    repositories: [
      {
        projectId: 'ygt',
        name: 'df-ygt-biz-base',
        path: '/code/df-ygt-biz-base',
        files: [
          {
            path: 'PatientController.java',
            language: 'java',
            symbols,
            routes,
            imports,
            references: ['PatientDTO']
          }
        ]
      }
    ]
  }
  const hits = searchIndex(index, { query: 'findPatient', project: 'ygt', limit: '1' })
  if (hits[0]?.repository !== 'df-ygt-biz-base') {
    throw new Error(`selftest ranking failed: ${JSON.stringify(hits)}`)
  }
  return { ok: true, command: 'selftest', assertions: 5 }
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2))
  const result =
    command === 'build'
      ? await build(options)
      : command === 'search'
        ? await search(options)
        : command === 'fulltext'
          ? await fulltext(options)
          : command === 'status'
            ? await status(options)
            : command === 'selftest'
              ? await selftest()
              : null
  if (!result) {
    throw new Error('Usage: project-code-graph.mjs build|search|fulltext|status|selftest [options]')
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
