#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)
const INDEX_VERSION = 1
const DEFAULT_LIMIT = 5
const DEFAULT_INDEX_PATH = path.join(homedir(), '.cache', 'orca', 'his-index', 'code-paths.json')
const IGNORED_DIRECTORIES = new Set([
  '.cache',
  '.idea',
  '.vscode',
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

async function discoverRepositories(root) {
  const repositories = []
  async function walk(directory) {
    let entries
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    if (entries.some((entry) => entry.name === '.git')) {
      repositories.push(directory)
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink() && !IGNORED_DIRECTORIES.has(entry.name)) {
        await walk(path.join(directory, entry.name))
      }
    }
  }
  await walk(root)
  return repositories.sort()
}

async function git(repo, args) {
  const { stdout } = await execFile('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  return stdout.trim()
}

function extensionSummary(files) {
  const counts = new Map()
  for (const file of files) {
    const extension = path.extname(file).toLowerCase() || '[none]'
    counts.set(extension, (counts.get(extension) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([extension, count]) => ({ extension, count }))
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

async function describeRepository(root, repoPath) {
  const rawFiles = await git(repoPath, ['ls-files', '-z'])
  const files = rawFiles ? rawFiles.split('\0').filter(Boolean) : []
  let remote = ''
  let branch = ''
  try {
    remote = await git(repoPath, ['remote', 'get-url', 'origin'])
  } catch {}
  try {
    branch = await git(repoPath, ['branch', '--show-current'])
  } catch {}
  return {
    key: path.relative(root, repoPath),
    name: path.basename(repoPath),
    path: repoPath,
    remote,
    branch,
    fileCount: files.length,
    extensions: extensionSummary(files),
    files
  }
}

function terms(value) {
  const raw =
    value
      .normalize('NFKC')
      .toLowerCase()
      .match(/[a-z0-9_$.-]{2,}/g) ?? []
  return [
    ...new Set(
      raw.flatMap((term) => [term, ...term.split(/[.$-]+/)]).filter((term) => term.length >= 2)
    )
  ]
}

function rankRepositories(index, query, limit) {
  const queryTerms = terms(query)
  if (queryTerms.length === 0) {
    return []
  }
  return index.repositories
    .map((repo) => {
      const repoName = repo.name.toLowerCase()
      const repoKey = repo.key.toLowerCase()
      const matches = []
      let score = 0
      for (const file of repo.files) {
        const lower = file.toLowerCase()
        let fileScore = 0
        for (const term of queryTerms) {
          if (lower === term) {
            fileScore += 30
          } else if (path.basename(lower, path.extname(lower)) === term) {
            fileScore += 24
          } else if (lower.includes(term)) {
            fileScore += 8
          }
        }
        if (fileScore > 0) {
          matches.push({ path: file, score: fileScore })
        }
      }
      for (const term of queryTerms) {
        if (repoName === term) {
          score += 80
        } else if (repoName.includes(term)) {
          score += 35
        } else if (repoKey.includes(term)) {
          score += 15
        }
      }
      matches.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
      score += matches.slice(0, 20).reduce((total, match) => total + match.score, 0)
      return { repo, score, matches: matches.slice(0, 20) }
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.repo.key.localeCompare(right.repo.key))
    .slice(0, limit)
    .map(({ repo, score, matches }) => ({
      key: repo.key,
      name: repo.name,
      path: repo.path,
      remote: repo.remote,
      branch: repo.branch,
      fileCount: repo.fileCount,
      score,
      matchedPaths: matches.map((match) => match.path)
    }))
}

async function build(options) {
  const rootOption = options.root ?? process.env.YUNXIAO_DEFAULT_CODE_ROOT
  const outputOption = options.output ?? process.env.HIS_CODE_INDEX_PATH ?? DEFAULT_INDEX_PATH
  if (!rootOption) {
    throw new Error('build requires --root or YUNXIAO_DEFAULT_CODE_ROOT')
  }
  const root = path.resolve(rootOption)
  const repositoryPaths = await discoverRepositories(root)
  const repositories = await mapConcurrent(repositoryPaths, 8, (repoPath) =>
    describeRepository(root, repoPath)
  )
  const index = {
    version: INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    root,
    repositoryCount: repositories.length,
    fileCount: repositories.reduce((total, repo) => total + repo.fileCount, 0),
    repositories
  }
  const output = path.resolve(outputOption)
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, `${JSON.stringify(index)}\n`)
  return {
    ok: true,
    command: 'build',
    repositories: index.repositoryCount,
    files: index.fileCount,
    output
  }
}

async function search(options) {
  if (!options.query) {
    throw new Error('search requires --query')
  }
  const indexPath = path.resolve(
    options.index ?? process.env.HIS_CODE_INDEX_PATH ?? DEFAULT_INDEX_PATH
  )
  const index = JSON.parse(await fs.readFile(indexPath, 'utf8'))
  if (index.version !== INDEX_VERSION || !Array.isArray(index.repositories)) {
    throw new Error('Unsupported HIS code index')
  }
  const parsedLimit = Number.parseInt(options.limit ?? String(DEFAULT_LIMIT), 10)
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 20)
    : DEFAULT_LIMIT
  const hits = rankRepositories(index, options.query, limit)
  return {
    ok: true,
    command: 'search',
    query: options.query,
    indexedRepositories: index.repositoryCount,
    indexedFiles: index.fileCount,
    count: hits.length,
    hits
  }
}

async function selftest() {
  const index = {
    repositories: [
      {
        key: 'service/lc/df-mic-lc-zhuyuan',
        name: 'df-mic-lc-zhuyuan',
        path: '/code/df-mic-lc-zhuyuan',
        remote: '',
        branch: 'develop',
        fileCount: 2,
        files: ['src/BingRenYzApi.java', 'src/YiZhuServiceImpl.java']
      },
      {
        key: 'web/lc/df-web-menzhenysz',
        name: 'df-web-menzhenysz',
        path: '/code/df-web-menzhenysz',
        remote: '',
        branch: 'develop',
        fileCount: 1,
        files: ['src/views/JieZhen.vue']
      }
    ]
  }
  const hits = rankRepositories(index, 'BingRenYzApi.saveYiZhu()', 1)
  if (hits[0]?.name !== 'df-mic-lc-zhuyuan' || !hits[0].matchedPaths[0].includes('BingRenYzApi')) {
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
    throw new Error('Usage: his-code-index.mjs build|search|selftest [options]')
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
