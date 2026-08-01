#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { triggerAndWaitForJenkins } from './his-jenkins-client.mjs'
import { detectVerifyCommands, resolveProjectRuntime } from './his-project-runtime.mjs'

const READ_ONLY_SQL_START = /^(?:\s|--[^\n]*\n)*(select|with|show|describe|explain)\b/i
const SQL_MUTATION =
  /\b(insert|update|delete|merge|alter|drop|truncate|create|grant|revoke|call|execute)\b/i

function isReadOnlySql(sql) {
  return READ_ONLY_SQL_START.test(sql) && !SQL_MUTATION.test(sql.replace(/--[^\n]*/g, ''))
}

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
  if (!filePath) {return { schemaVersion: 1, services: {} }}
  const catalog = JSON.parse(readFileSync(path.resolve(filePath), 'utf8'))
  if (catalog?.schemaVersion !== 1 || !catalog.services || typeof catalog.services !== 'object') {
    throw new Error('HIS workflow catalog must use schemaVersion 1 and contain services.')
  }
  return catalog
}

function selectService(catalog, serviceId, repo) {
  if (serviceId) {
    if (!catalog.services[serviceId]) {throw new Error(`Service ${serviceId} is not in the catalog.`)}
    return { id: serviceId, ...catalog.services[serviceId] }
  }
  const repoName = path.basename(repo).toLowerCase()
  const matches = Object.entries(catalog.services).filter(([, service]) =>
    (service.repoNames ?? []).some((name) => String(name).toLowerCase() === repoName)
  )
  if (matches.length === 1) {return { id: matches[0][0], ...matches[0][1] }}
  return null
}

function selectEnvironment(catalog, selector) {
  if (!selector) {return null}
  const normalized = String(selector).trim().toLowerCase()
  const matches = Object.entries(catalog.environments ?? {}).filter(([id, environment]) =>
    [id, ...(environment.aliases ?? [])].some(
      (name) => String(name).trim().toLowerCase() === normalized
    )
  )
  if (matches.length !== 1)
    {throw new Error(`Environment ${selector} is not uniquely mapped in the catalog.`)}
  return { id: matches[0][0], ...matches[0][1] }
}

function commandText(argv) {
  return argv
    .map((value) => (/^[\w./:=@-]+$/.test(value) ? value : JSON.stringify(value)))
    .join(' ')
}

function runCommand(argv, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd: options.cwd,
      env: options.env,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: false
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr?.on('data', (chunk) => (stderr += String(chunk)))
    child.on('error', (error) =>
      resolve({ ok: false, code: null, stdout, stderr, error: error.message })
    )
    child.on('close', (code) => resolve({ ok: code === 0, code, stdout, stderr, error: null }))
  })
}

function selectedEnv(runtime, environment) {
  const env = { ...environment?.variables, ...process.env }
  if (runtime.nodeBinPath) {env.PATH = `${runtime.nodeBinPath}${path.delimiter}${env.PATH ?? ''}`}
  return env
}

function evidence(type, result, summary, command = null, artifactPath = null) {
  return {
    id: `VE-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type,
    result,
    summary,
    command,
    artifactPath,
    collectedAt: Date.now()
  }
}

async function commandEvidence(argv, repo, runtime, type, summary, environment = null) {
  const result = await runCommand(argv, {
    cwd: repo,
    env: selectedEnv(runtime, environment),
    capture: true
  })
  if (!result.ok)
    {throw new Error(
      `${summary} failed (${commandText(argv)}): ${result.stderr.trim() || result.error || `exit ${result.code}`}`
    )}
  return evidence(type, 'pass', summary, commandText(argv))
}

async function gitBranch(repo) {
  const result = await runCommand(['git', 'branch', '--show-current'], {
    cwd: repo,
    env: process.env,
    capture: true
  })
  return result.ok ? result.stdout.trim() : ''
}

async function doctor(context) {
  if (!existsSync(context.repo)) {throw new Error(`Repository does not exist: ${context.repo}`)}
  const results = []
  const git = await runCommand(['git', 'status', '--short', '--branch'], {
    cwd: context.repo,
    env: process.env,
    capture: true
  })
  if (!git.ok) {throw new Error(`Git status failed: ${git.stderr.trim() || git.error}`)}
  results.push(
    evidence('command', 'pass', 'Git repository state inspected.', 'git status --short --branch')
  )
  if (context.runtime.nodeMajor) {
    const node = await runCommand(['node', '--version'], {
      cwd: context.repo,
      env: selectedEnv(context.runtime, context.environment),
      capture: true
    })
    if (!node.ok) {throw new Error(`Node ${context.runtime.nodeMajor} is required but unavailable.`)}
    const actualMajor = Number.parseInt(node.stdout.trim().replace(/^v/, '').split('.')[0], 10)
    if (actualMajor !== context.runtime.nodeMajor)
      {throw new Error(`Expected Node ${context.runtime.nodeMajor}, got ${node.stdout.trim()}.`)}
    results.push(
      evidence(
        'runtime',
        'pass',
        `Node ${node.stdout.trim()} selected from ${context.runtime.nodeSource}.`,
        'node --version'
      )
    )
  }
  return results
}

async function verify(context) {
  const commands =
    context.service?.verifyCommands ?? detectVerifyCommands(context.repo, context.runtime)
  if (commands.length === 0) {throw new Error('No verification command was detected or configured.')}
  const results = []
  for (const argv of commands) {
    const type = argv.includes('build') ? 'build' : 'passing_test'
    results.push(
      await commandEvidence(
        argv,
        context.repo,
        context.runtime,
        type,
        'Local project verification passed.',
        context.environment
      )
    )
  }
  return results
}

async function database(context) {
  const checks = context.service?.databaseChecks ?? []
  if (checks.length === 0)
    {throw new Error('No read-only database checks are configured for this service.')}
  const results = []
  for (const check of checks) {
    if (!isReadOnlySql(check.sql ?? ''))
      {throw new Error(`Database check ${check.name ?? '<unnamed>'} is not read-only.`)}
    const missing = (check.requiredEnv ?? []).filter((name) => !process.env[name])
    if (missing.length > 0)
      {throw new Error(
        `Database check ${check.name} is missing environment variables: ${missing.join(', ')}.`
      )}
    const argv = [check.command, ...(check.args ?? []), '-c', check.sql]
    await commandEvidence(
      argv,
      context.repo,
      context.runtime,
      'database',
      `Database check passed: ${check.name}.`,
      context.environment
    )
    results.push(
      evidence(
        'database',
        'pass',
        `Database check passed: ${check.name}.`,
        `${check.command} <redacted connection args> -c <read-only SQL>`
      )
    )
  }
  return results
}

async function jenkins(context) {
  if (!context.allowMutations) {throw new Error('Jenkins triggering requires --allow-mutations.')}
  const config = {
    ...context.environment?.jenkins,
    ...context.service?.jenkins,
    job: context.options.job ?? context.service?.jenkins?.job
  }
  if (!config.job)
    {throw new Error('No Jenkins job is configured; select a mapped service or pass --job.')}
  const build = await triggerAndWaitForJenkins(
    config,
    { branch: await gitBranch(context.repo), nodeMajor: context.runtime.nodeMajor ?? '' },
    {
      timeoutMs: Number(context.options.timeoutMs ?? 30 * 60 * 1000),
      env: selectedEnv(context.runtime, context.environment)
    }
  )
  return [
    evidence('jenkins', 'pass', `Jenkins ${config.job} #${build.number} succeeded.`, build.url)
  ]
}

async function deploy(context) {
  if (!context.allowMutations) {throw new Error('Deployment requires --allow-mutations.')}
  const argv = context.service?.deployCommand
  if (!Array.isArray(argv) || argv.length === 0)
    {throw new Error('No deployment command is configured for this service.')}
  return [
    await commandEvidence(
      argv,
      context.repo,
      context.runtime,
      'deployment',
      'Deployment command completed.',
      context.environment
    )
  ]
}

async function smoke(context) {
  const urls = context.service?.smokeUrls ?? []
  if (urls.length === 0) {throw new Error('No smoke URLs are configured for this service.')}
  const results = []
  for (const url of urls) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(Number(context.options.smokeTimeoutMs ?? 15000))
    })
    if (!response.ok)
      {throw new Error(`Smoke check failed: ${url} returned HTTP ${response.status}.`)}
    results.push(
      evidence('smoke', 'pass', `Smoke check passed: ${url} returned HTTP ${response.status}.`, url)
    )
  }
  return results
}

async function selftest() {
  const runtime = resolveProjectRuntime(path.join(tmpdir(), 'df-web-example'))
  if (runtime.family !== 'his' || runtime.nodeMajor !== 18)
    {throw new Error('HIS runtime fallback failed.')}
  const environment = selectEnvironment(
    { environments: { local152: { aliases: ['本地152开发环境'] } } },
    '本地152开发环境'
  )
  if (environment?.id !== 'local152') {throw new Error('Environment alias resolution failed.')}
  if (!isReadOnlySql('SELECT 1') || isReadOnlySql('WITH x AS (UPDATE t SET a = 1) SELECT * FROM x'))
    {throw new Error('Read-only SQL gate failed.')}
  return [evidence('command', 'pass', 'Harness runtime and read-only SQL gates passed.')]
}

async function writeReport(report, reportDirectory) {
  if (!reportDirectory) {return null}
  const directory = path.resolve(reportDirectory)
  await mkdir(directory, { recursive: true })
  const jsonPath = path.join(directory, 'report.json')
  const markdownPath = path.join(directory, 'report.md')
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  const lines = [
    '# HIS Workflow Evidence',
    '',
    `- Status: ${report.ok ? 'passed' : 'failed'}`,
    `- Repository: ${report.repo}`,
    `- Service: ${report.serviceId ?? 'unmapped'}`,
    `- Node: ${report.runtime.nodeMajor ?? 'unknown'} (${report.runtime.nodeSource})`,
    '',
    '## Evidence',
    '',
    ...report.evidence.map((item) => `- ${item.result}: ${item.type} - ${item.summary}`)
  ]
  await writeFile(markdownPath, `${lines.join('\n')}\n`)
  return { jsonPath, markdownPath }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const action = options._[0] ?? 'intake'
  const repo = path.resolve(options.repo ?? process.cwd())
  const catalog = loadCatalog(options.catalog ?? process.env.HIS_WORKFLOW_CATALOG)
  const runtime = resolveProjectRuntime(repo)
  const service = selectService(catalog, options.service, repo)
  const environment = selectEnvironment(catalog, options.environment)
  const context = {
    repo,
    runtime,
    service,
    environment,
    options,
    allowMutations: options.allowMutations === true
  }
  const report = {
    schemaVersion: 1,
    action,
    repo,
    serviceId: service?.id ?? null,
    environmentId: environment?.id ?? null,
    runtime,
    startedAt: Date.now(),
    completedAt: null,
    ok: false,
    stages: [],
    evidence: [],
    error: null
  }
  const actions =
    action === 'full' ? ['doctor', 'verify', 'database', 'jenkins', 'deploy', 'smoke'] : [action]
  try {
    for (const stage of actions) {
      const startedAt = Date.now()
      const stageEvidence =
        stage === 'intake'
          ? [evidence('runtime', 'pass', 'Repository intake completed.')]
          : stage === 'doctor'
            ? await doctor(context)
            : stage === 'verify'
              ? await verify(context)
              : stage === 'database'
                ? await database(context)
                : stage === 'jenkins'
                  ? await jenkins(context)
                  : stage === 'deploy'
                    ? await deploy(context)
                    : stage === 'smoke'
                      ? await smoke(context)
                      : stage === 'selftest'
                        ? await selftest()
                        : (() => {
                            throw new Error(`Unknown action: ${stage}`)
                          })()
      report.evidence.push(...stageEvidence)
      report.stages.push({ name: stage, status: 'passed', startedAt, completedAt: Date.now() })
    }
    report.ok = true
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error)
    report.stages.push({
      name: actions[report.stages.length] ?? action,
      status: 'failed',
      startedAt: Date.now(),
      completedAt: Date.now(),
      error: report.error
    })
  }
  report.completedAt = Date.now()
  report.artifacts = await writeReport(report, options.reportDir)
  if (options.json) {console.log(JSON.stringify(report, null, 2))}
  else {console.log(report.ok ? 'HIS workflow completed.' : `HIS workflow failed: ${report.error}`)}
  if (!report.ok) {process.exitCode = 1}
}

await main()
