#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { readdir, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

function parseArgs(argv) {
  const options = { _: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (!value.startsWith('--')) {
      options._.push(value)
      continue
    }
    const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    options[key] = ['json', 'allowMutations'].includes(key) ? true : argv[++index]
  }
  return options
}

function loadCatalog(filePath) {
  const catalog = JSON.parse(readFileSync(path.resolve(filePath), 'utf8'))
  if (catalog?.schemaVersion !== 1 || !catalog.environments || !catalog.services) {
    throw new Error('Catalog must contain schemaVersion 1, environments, and services.')
  }
  return catalog
}

async function findRepositories(root, maxDepth = 6) {
  const repositories = []
  async function visit(directory, depth) {
    if (depth > maxDepth) {return}
    if (existsSync(path.join(directory, '.git'))) {
      repositories.push(directory)
      return
    }
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {continue}
      const child = path.join(directory, entry.name)
      const childStat = entry.isSymbolicLink() ? await stat(child) : null
      if (entry.isDirectory() || childStat?.isDirectory()) {await visit(child, depth + 1)}
    }
  }
  await visit(path.resolve(root), 0)
  return repositories.sort()
}

function basicAuth(user, token) {
  return `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`
}

async function fetchJenkinsJobs(environment, timeoutMs) {
  const config = environment.jenkins
  if (!config?.baseUrl || !config.user || !config.token) {return []}
  const headers = { authorization: basicAuth(config.user, config.token) }
  const jobs = []
  async function visit(url, prefix = '') {
    const response = await fetch(`${url.replace(/\/$/, '')}/api/json?tree=jobs[name,url,_class]`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!response.ok) {throw new Error(`Jenkins discovery failed: HTTP ${response.status}`)}
    const data = await response.json()
    for (const job of data.jobs ?? []) {
      const fullName = prefix ? `${prefix}/${job.name}` : job.name
      if (String(job._class).includes('Folder')) {await visit(job.url, fullName)}
      else {jobs.push({ name: fullName, url: job.url })}
    }
  }
  await visit(config.baseUrl)
  return jobs.sort((left, right) => left.name.localeCompare(right.name))
}

function decodeXmlText(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

async function inspectJenkinsJob(job, headers, timeoutMs) {
  const response = await fetch(`${job.url.replace(/\/$/, '')}/config.xml`, {
    headers,
    signal: AbortSignal.timeout(timeoutMs)
  })
  if (!response.ok) {throw new Error(`Jenkins job config failed: HTTP ${response.status}`)}
  const xml = await response.text()
  const commands = [...xml.matchAll(/<command>([\s\S]*?)<\/command>/g)].map((match) =>
    decodeXmlText(match[1])
  )
  const parameterBlocks = [...xml.matchAll(/<[^>]*ParameterDefinition>([\s\S]*?)<\/[^>]*ParameterDefinition>/g)]
  const parameterNames = parameterBlocks
    .map((match) => match[1].match(/<name>([^<]+)<\/name>/)?.[1]?.trim())
    .filter(Boolean)
  const branchParameter = parameterNames.find((name) => /^(?:git[_-]?)?(?:branch|ref)$/i.test(name)) ?? null
  const configuredRefs = commands
    .flatMap((command) => [...command.matchAll(/\b((?:RC|release|feature)[_/-][\w./-]+)\b/gi)])
    .map((match) => match[1])
  const uniqueRefs = new Set(configuredRefs)
  return {
    parameterNames,
    branchParameter,
    requiredBranch: branchParameter ? null : uniqueRefs.size === 1 ? configuredRefs[0] : null,
    branchMode: branchParameter
      ? 'parameter'
      : uniqueRefs.size === 1
        ? 'fixed'
        : 'unknown',
    performsDeployment: commands.some((command) =>
      /(?:publish_[\w.-]*\.py|\bkubectl\b|\bhelm\b|docker\s+(?:service|stack)|\bdeploy\b)/i.test(command)
    )
  }
}

async function inspectMappedJobs(matches, environment, timeoutMs) {
  const headers = {
    authorization: basicAuth(environment.jenkins.user, environment.jenkins.token)
  }
  for (const match of matches) {
    if (match.status !== 'mapped') {continue}
    try {
      match.selected.capabilities = await inspectJenkinsJob(match.selected, headers, timeoutMs)
    } catch (error) {
      match.selected.capabilities = {
        inspectionError: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

function normalizedName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function normalizedJobName(value) {
  return normalizedName(
    String(value).replace(/(?:[-_/](?:dev|test|prod|release|master|build|deploy|jenkins))+$/i, '')
  )
}

function matchScore(repoName, jobName) {
  const repo = normalizedName(repoName)
  const job = normalizedJobName(jobName)
  if (!repo || !job) {return 0}
  if (repo === job) {return 100}
  if (job.startsWith(repo) || job.endsWith(repo)) {return 92}
  if (job.includes(repo)) {return 80}
  return 0
}

function resolveJobCollisions(matches) {
  const mappedByJob = new Map()
  for (const match of matches) {
    if (match.status !== 'mapped') {continue}
    const current = mappedByJob.get(match.selected.name) ?? []
    current.push(match)
    mappedByJob.set(match.selected.name, current)
  }
  for (const collisions of mappedByJob.values()) {
    if (collisions.length < 2) {continue}
    const bestScore = Math.max(...collisions.map((match) => match.selected.score))
    const best = collisions.filter((match) => match.selected.score === bestScore)
    for (const match of collisions) {
      if (best.length === 1 && match === best[0]) {continue}
      match.status = 'ambiguous'
      match.selected = null
    }
  }
  return matches
}

function repositoryAliases(repoPath) {
  const name = path.basename(repoPath)
  const aliases = [name]
  const rules = [
    [/^df-web-/, 'web-'],
    [/^df-agg-/, 'agg-'],
    [/^df-mic-jj-/, 'jj-'],
    [/^df-mic-lc-/, 'lc-'],
    [/^df-mic-yibao-/, 'yb-']
  ]
  for (const [pattern, replacement] of rules) {
    if (pattern.test(name)) {aliases.push(name.replace(pattern, replacement))}
  }
  if (name.startsWith('df-bff-')) {
    aliases.push(name.replace(/^df-bff-/, 'winbff-'), name.replace(/^df-bff-/, 'hisbff-'))
  }
  if (name.startsWith('df-mic-')) {
    const suffix = name.replace(/^df-mic-/, '')
    if (repoPath.includes(`${path.sep}base${path.sep}`)) {aliases.push(`gy-${suffix}`)}
    if (repoPath.includes(`${path.sep}lc${path.sep}`)) {aliases.push(`lc-${suffix}`)}
    if (repoPath.includes(`${path.sep}cw${path.sep}`)) {aliases.push(`jj-${suffix}`)}
    if (repoPath.includes(`${path.sep}yibao${path.sep}`)) {aliases.push(`yb-${suffix}`)}
    if (repoPath.includes(`${path.sep}ylgl${path.sep}`)) {
      aliases.push(`gy-${suffix}`, `lc-${suffix}`)
    }
    if (repoPath.includes(`${path.sep}ykf${path.sep}`)) {
      aliases.push(`ykf-${suffix}`, `df-${suffix}`, `agg-${suffix}`)
    }
  }
  if (name === 'df-his-gateway') {aliases.push('his-gateway')}
  if (name === 'df-mic-oss') {aliases.push('oss')}
  if (name === 'df-oapi') {aliases.push('df-oapi')}
  if (name === 'df-sapi') {aliases.push('df-sapi')}
  return [...new Set(aliases)]
}

function matchRepository(repoPath, jobs) {
  const repoName = path.basename(repoPath)
  const candidates = jobs
    .map((job) => {
      const scores = repositoryAliases(repoPath).map((alias) => ({
        alias,
        score: matchScore(alias, job.name)
      }))
      const best = scores.sort((left, right) => right.score - left.score)[0]
      return { ...job, score: best?.score ?? 0, matchedAlias: best?.alias ?? null }
    })
    .filter((job) => job.score >= 80)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
  const topScore = candidates[0]?.score ?? 0
  const top = candidates.filter((candidate) => candidate.score === topScore)
  return {
    repoName,
    repoPath,
    status: top.length === 1 && topScore >= 92 ? 'mapped' : candidates.length ? 'ambiguous' : 'unmapped',
    selected: top.length === 1 && topScore >= 92 ? top[0] : null,
    candidates: candidates.slice(0, 10)
  }
}

function mergeMappings(catalog, environmentId, matches) {
  for (const match of matches) {
    if (match.status !== 'mapped') {continue}
    const current = catalog.services[match.repoName] ?? { repoNames: [match.repoName] }
    const capabilities = match.selected.capabilities ?? {}
    const parameters = capabilities.branchParameter
      ? { [capabilities.branchParameter]: '${branch}' }
      : undefined
    catalog.services[match.repoName] = {
      ...current,
      repoNames: [...new Set([...(current.repoNames ?? []), match.repoName])],
      environments: {
        ...current.environments,
        [environmentId]: {
          ...current.environments?.[environmentId],
          jenkins: {
            ...current.environments?.[environmentId]?.jenkins,
            job: match.selected.name,
            discoveredUrl: match.selected.url,
            performsDeployment: capabilities.performsDeployment === true,
            requiredBranch: capabilities.requiredBranch ?? null,
            branchMode: capabilities.branchMode ?? 'unknown',
            ...(parameters ? { parameters } : {})
          }
        }
      }
    }
  }
}

async function atomicWrite(filePath, value) {
  const target = path.resolve(filePath)
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temp, target)
}

function validateCatalog(catalog) {
  const services = Object.entries(catalog.services).map(([id, service]) => {
    const environmentEntries = Object.entries(service.environments ?? {})
    const releaseReady = environmentEntries.filter(([environmentId, value]) => {
      const environment = catalog.environments[environmentId] ?? {}
      const hasDeployment = value.deployCommand || value.jenkins?.performsDeployment
      const hasSmoke =
        value.smokeUrls?.length ||
        value.smokeChecks?.length ||
        environment.smokeUrls?.length ||
        environment.smokeChecks?.length
      const hasDatabase = value.databaseChecks?.length || environment.databaseChecks?.length
      const branchVerified = ['fixed', 'parameter'].includes(value.jenkins?.branchMode)
      return Boolean(value.jenkins?.job && hasDeployment && hasSmoke && hasDatabase && branchVerified)
    })
    return {
      id,
      repoNames: service.repoNames ?? [],
      mappedEnvironments: environmentEntries.map(([environmentId]) => environmentId),
      releaseReadyEnvironments: releaseReady.map(([environmentId]) => environmentId)
    }
  })
  return {
    serviceCount: services.length,
    releaseReadyServiceCount: services.filter((service) => service.releaseReadyEnvironments.length).length,
    services
  }
}

async function discover(options, catalog) {
  const repositories = await findRepositories(options.repoRoot, Number(options.maxDepth ?? 6))
  const environmentIds = options.environment
    ? [options.environment]
    : Object.keys(catalog.environments)
  const environments = []
  for (const environmentId of environmentIds) {
    const environment = catalog.environments[environmentId]
    if (!environment) {throw new Error(`Unknown environment: ${environmentId}`)}
    try {
      const jobs = await fetchJenkinsJobs(environment, Number(options.timeoutMs ?? 10000))
      const matches = resolveJobCollisions(repositories.map((repo) => matchRepository(repo, jobs)))
      await inspectMappedJobs(matches, environment, Number(options.timeoutMs ?? 10000))
      mergeMappings(catalog, environmentId, matches)
      environments.push({
        environmentId,
        status: 'ok',
        jobCount: jobs.length,
        jobNames: jobs.map((job) => job.name),
        matches
      })
    } catch (error) {
      environments.push({
        environmentId,
        status: 'unreachable',
        error: error instanceof Error ? error.message : String(error),
        jobCount: 0,
        matches: []
      })
    }
  }
  if (options.allowMutations) {await atomicWrite(options.catalog, catalog)}
  return { repositoryCount: repositories.length, environments, validation: validateCatalog(catalog) }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const action = options._[0] ?? 'validate'
  if (!options.catalog) {throw new Error('--catalog is required.')}
  const catalog = loadCatalog(options.catalog)
  const result =
    action === 'discover'
      ? await discover(options, catalog)
      : action === 'validate'
        ? validateCatalog(catalog)
        : (() => {
            throw new Error(`Unknown action: ${action}`)
          })()
  console.log(JSON.stringify(result, null, options.json ? 2 : 0))
}

await main()
