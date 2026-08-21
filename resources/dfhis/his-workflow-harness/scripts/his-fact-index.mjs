#!/usr/bin/env node

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const INDEX_VERSION = 1
const MAX_SEARCH_TEXT = 24_000
const DEFAULT_LIMIT = 3

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

async function markdownFiles(root) {
  const files = []
  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
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

async function requirementHistoryCards(root) {
  if (!root) {
    return []
  }
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const cards = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || !/^DFHIS-\d+$/.test(entry.name)) {
      continue
    }
    const requirementPath = path.join(root, entry.name, 'requirement.md')
    let markdown
    try {
      markdown = await fs.readFile(requirementPath, 'utf8')
    } catch {
      continue
    }
    let codeEntries = []
    try {
      codeEntries = await fs.readdir(path.join(root, entry.name, 'code'), { withFileTypes: true })
    } catch {}
    const deliveryRepos = codeEntries
      .filter((codeEntry) => codeEntry.isDirectory() && /^df-[a-z0-9-]+$/i.test(codeEntry.name))
      .map((codeEntry) => codeEntry.name)
    const parsed = parseCard(root, requirementPath, markdown)
    parsed.key = `history/${entry.name}`
    parsed.id = entry.name
    parsed.domain = 'requirement-history'
    parsed.repos = unique([...deliveryRepos, ...parsed.repos])
    parsed.searchText = `${parsed.title} ${parsed.repos.join(' ')} ${parsed.searchText}`
    cards.push(parsed)
  }
  return cards
}

function unique(values, limit = 80) {
  return [...new Set(values.filter(Boolean))].slice(0, limit)
}

function matches(text, pattern, group = 0) {
  return unique([...text.matchAll(pattern)].map((match) => match[group]))
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

function parseCard(root, file, markdown) {
  const relativePath = path.relative(root, file)
  const baseName = path.basename(file, path.extname(file))
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? baseName
  const id =
    heading.match(/\b(?:INP|OUT|EMR|PHA|LAB|RAD|MAT|PLT|SP)-[A-Z0-9-]+\b/i)?.[0] ??
    baseName.match(/\b[A-Z]+-[A-Z0-9-]+\b/i)?.[0] ??
    null
  const codeSpans = matches(markdown, /`([^`\n]{2,160})`/g, 1)
  const repos = unique(
    matches(markdown, /\bdf-(?:web|mic|bff|sapi|his-api|agg|winbff)-[a-z0-9-]+\b/gi)
  )
  const symbols = unique(
    codeSpans.filter(
      (value) =>
        value.length <= 120 &&
        !value.includes('/') &&
        !value.toLowerCase().endsWith('.md') &&
        /^(?:[A-Z][A-Za-z0-9_$]*(?:Controller|Service|ServiceImpl|Repository|Mapper|Api|DTO|Req|Vo)|[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*(?:\([^)]*\))?)$/.test(
          value
        )
    )
  )
  const tables = unique(
    codeSpans.filter((value) => /^[a-z][a-z0-9]*(?:_[a-z0-9]+){1,8}$/i.test(value))
  )
  const plainText = compactMarkdown(markdown).slice(0, MAX_SEARCH_TEXT)
  return {
    key: `${path.dirname(relativePath)}/${id ?? baseName}`.replace(/^\.\//, ''),
    id,
    domain: relativePath.split(path.sep)[0] || 'root',
    title: heading,
    path: file,
    relativePath,
    repos,
    symbols,
    tables,
    searchText: `${heading} ${repos.join(' ')} ${symbols.join(' ')} ${tables.join(' ')} ${plainText}`
  }
}

function tokenize(value) {
  const normalized = value.toLowerCase().normalize('NFKC')
  const tokens = normalized.match(/[a-z][a-z0-9_$.-]{1,}|\d+(?:\.\d+)*|[\u3400-\u9fff]+/g) ?? []
  const output = []
  for (const token of tokens) {
    if (/^[\u3400-\u9fff]+$/.test(token)) {
      if (token.length === 1) {
        output.push(token)
      } else {
        for (let index = 0; index < token.length - 1; index += 1) {
          output.push(token.slice(index, index + 2))
        }
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

function search(index, query, limit) {
  const queryTokens = unique(tokenize(query), 120)
  if (queryTokens.length === 0) {
    return []
  }
  const documents = index.cards.map((card) => ({ card, counts: termCounts(card.searchText) }))
  const documentFrequency = new Map()
  for (const token of queryTokens) {
    documentFrequency.set(token, documents.filter((document) => document.counts.has(token)).length)
  }
  const queryLower = query.toLowerCase()
  return documents
    .map(({ card, counts }) => {
      let score = 0
      for (const token of queryTokens) {
        const frequency = counts.get(token) ?? 0
        if (frequency === 0) {
          continue
        }
        const inverseDocumentFrequency = Math.log(
          1 + index.cards.length / (1 + (documentFrequency.get(token) ?? 0))
        )
        score += inverseDocumentFrequency * (1 + Math.log(frequency))
      }
      const titleLower = card.title.toLowerCase()
      if (queryLower.length >= 2 && titleLower.includes(queryLower)) {
        score += 20
      }
      score += card.repos.some((repo) => queryLower.includes(repo.toLowerCase())) ? 12 : 0
      const matchedTerms = queryTokens.filter((token) => counts.has(token))
      return { card, score, matchedTerms }
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.card.key.localeCompare(right.card.key))
    .slice(0, limit)
    .map(({ card, score, matchedTerms }) => ({
      key: card.key,
      id: card.id,
      domain: card.domain,
      title: card.title,
      path: card.path,
      score: Number(score.toFixed(3)),
      matchedTerms: matchedTerms.slice(0, 20),
      repos: card.repos,
      symbols: card.symbols.slice(0, 20),
      tables: card.tables.slice(0, 20)
    }))
}

async function build(options) {
  const cardsOption = options.cards ?? process.env.HIS_FACT_CARDS_ROOT
  const outputOption = options.output ?? process.env.HIS_FACT_INDEX_PATH
  if (!cardsOption || !outputOption) {
    throw new Error('build requires --cards/--output or HIS_FACT_CARDS_ROOT/HIS_FACT_INDEX_PATH')
  }
  const cardsRoot = path.resolve(cardsOption)
  const files = await markdownFiles(cardsRoot)
  const cards = []
  for (const file of files) {
    cards.push(parseCard(cardsRoot, file, await fs.readFile(file, 'utf8')))
  }
  const requirementsRoot = options.requirements ?? process.env.YUNXIAO_ARCHIVE_WORKSPACE
  const historyCards = await requirementHistoryCards(
    requirementsRoot ? path.resolve(requirementsRoot) : ''
  )
  cards.push(...historyCards)
  const index = {
    version: INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    cardsRoot,
    requirementsRoot: requirementsRoot ? path.resolve(requirementsRoot) : null,
    cards
  }
  await fs.mkdir(path.dirname(path.resolve(outputOption)), { recursive: true })
  await fs.writeFile(path.resolve(outputOption), `${JSON.stringify(index)}\n`)
  return {
    ok: true,
    command: 'build',
    cards: files.length,
    historyRequirements: historyCards.length,
    documents: cards.length,
    output: path.resolve(outputOption)
  }
}

async function runSearch(options) {
  const indexOption = options.index ?? process.env.HIS_FACT_INDEX_PATH
  if (!indexOption || !options.query) {
    throw new Error('search requires --query and --index or HIS_FACT_INDEX_PATH')
  }
  const indexPath = path.resolve(indexOption)
  try {
    await fs.access(indexPath)
  } catch {
    await build({
      cards: options.cards ?? process.env.HIS_FACT_CARDS_ROOT,
      requirements: options.requirements ?? process.env.YUNXIAO_ARCHIVE_WORKSPACE,
      output: indexPath
    })
  }
  const index = JSON.parse(await fs.readFile(indexPath, 'utf8'))
  if (index.version !== INDEX_VERSION || !Array.isArray(index.cards)) {
    throw new Error('Unsupported fact index')
  }
  const parsedLimit = Number.parseInt(options.limit ?? String(DEFAULT_LIMIT), 10)
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 20)
    : DEFAULT_LIMIT
  const hits = search(index, options.query, limit)
  return { ok: true, command: 'search', query: options.query, count: hits.length, hits }
}

async function selftest() {
  const index = {
    version: INDEX_VERSION,
    cards: [
      parseCard(
        '/cards',
        '/cards/outpatient/INP-201.md',
        '# 门诊接诊医嘱剂量与收费数量转换链\n`df-mic-lc-menzhen` `YiZhuFyOpriation.processYiZhuFyNew` `mz_yizhufy`'
      ),
      parseCard('/cards', '/cards/inpatient/INP-001.md', '# 住院医嘱执行链\n执行确认和费用状态')
    ]
  }
  const hits = search(index, '门诊医嘱收费数量', 1)
  if (hits[0]?.id !== 'INP-201' || hits[0].repos[0] !== 'df-mic-lc-menzhen') {
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
        ? await runSearch(options)
        : command === 'selftest'
          ? await selftest()
          : null
  if (!result) {
    throw new Error('Usage: his-fact-index.mjs build|search|selftest [options]')
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
