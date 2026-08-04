#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { triggerAndWaitForJenkins } from './his-jenkins-client.mjs'
import { detectVerifyCommands, resolveProjectRuntime } from './his-project-runtime.mjs'
import {
  executeWorkflow,
  workflowStatePath
} from './his-workflow-orchestrator.mjs'
import {
  assertWorkflowRunIdentity,
  createWorkflowRun,
  loadWorkflowRun,
  resetFailedStagesForResume,
  resetInterruptedAttempts,
  saveWorkflowRun,
  workflowStage
} from './his-workflow-run-state.mjs'

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
    options[key] =
      ['json', 'allowMutations', 'resume', 'allowUnverifiedJenkinsBranch'].includes(key)
        ? true
        : argv[++index]
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

function bindServiceEnvironment(service, environment) {
  if (!service || !environment) {return service}
  const binding = service.environments?.[environment.id]
  if (!binding) {return service}
  return { ...service, ...binding, jenkins: { ...service.jenkins, ...binding.jenkins } }
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

function uiReviewScriptPath() {
  return path.resolve(import.meta.dirname, '../../ui-spec-review/scripts/ui-spec-review.mjs')
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

async function gitHead(repo) {
  const result = await runCommand(['git', 'rev-parse', 'HEAD'], {
    cwd: repo,
    env: process.env,
    capture: true
  })
  return result.ok ? result.stdout.trim() : null
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
    const command = commandText(argv)
    const type = /\b(?:e2e|playwright|cypress|cy:run|test:e2e|test:playwright|screenshot|visual)\b/i.test(command)
      ? 'e2e'
      : argv.includes('build')
        ? 'build'
        : 'passing_test'
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

async function uiReview(context) {
  const scanner = uiReviewScriptPath()
  if (!existsSync(scanner)) {
    throw new Error(`UI spec review scanner is missing: ${scanner}`)
  }
  const argv = ['node', scanner, '--repo', context.repo, '--json']
  if (context.options.changedOnly) {argv.push('--changed-only')}
  const result = await runCommand(argv, { cwd: context.repo, env: process.env, capture: true })
  let report = null
  if (result.stdout) {
    try {report = JSON.parse(result.stdout)} catch {report = null}
  }
  if (!report) {
    throw new Error(
      `UI spec review failed to run (${commandText(argv)}): ${result.stderr.trim() || result.error || `exit ${result.code}`}`
    )
  }
  const violationCount = report.violations?.length ?? 0
  if (violationCount > 0) {
    const first = report.violations[0]
    throw new Error(
      `UI spec review gate blocked: ${violationCount} violation(s), e.g. [规范 ${first.specId}/${first.category}] ${first.file}:${first.line} ${first.detail}`
    )
  }
  return [
    evidence(
      'ui',
      'pass',
      `UI spec review passed (${report.scannedFiles ?? 0} files scanned).`,
      commandText(argv)
    )
  ]
}

async function database(context) {
  const checks = context.service?.databaseChecks ?? context.environment?.databaseChecks ?? []
  if (checks.length === 0)
    {throw new Error('No read-only database checks are configured for this service.')}
  const results = []
  for (const check of checks) {
    if (!isReadOnlySql(check.sql ?? ''))
      {throw new Error(`Database check ${check.name ?? '<unnamed>'} is not read-only.`)}
    const environment = selectedEnv(context.runtime, context.environment)
    const missing = (check.requiredEnv ?? []).filter((name) => !environment[name])
    if (missing.length > 0)
      {throw new Error(
        `Database check ${check.name} is missing environment variables: ${missing.join(', ')}.`
      )}
    const argv = await databaseCommand(check, environment, context.repo)
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
        `${check.driver ?? check.command} <redacted connection args> -c <read-only SQL>`
      )
    )
  }
  return results
}

async function databaseCommand(check, environment, repo) {
  if (check.driver !== 'postgres') {
    return [check.command, ...(check.args ?? []), '-c', check.sql]
  }
  const candidates = [
    process.env.PSQL_PATH,
    'psql',
    '/opt/homebrew/opt/libpq/bin/psql',
    '/usr/local/opt/libpq/bin/psql'
  ].filter(Boolean)
  for (const candidate of candidates) {
    const probe = await runCommand([candidate, '--version'], {
      cwd: repo,
      env: environment,
      capture: true
    })
    if (probe.ok) {return [candidate, ...(check.args ?? []), '-c', check.sql]}
  }
  const docker = await runCommand(['docker', 'info'], { cwd: repo, env: environment, capture: true })
  if (docker.ok) {
    return [
      'docker', 'run', '--rm',
      '-e', 'PGHOST', '-e', 'PGPORT', '-e', 'PGDATABASE', '-e', 'PGUSER', '-e', 'PGPASSWORD',
      'postgres:16-alpine', 'psql', '-c', check.sql
    ]
  }
  throw new Error('PostgreSQL check requires psql or a running Docker engine.')
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
  const branch = await gitBranch(context.repo)
  if (config.branchMode === 'unknown' && !context.options.allowUnverifiedJenkinsBranch) {
    throw new Error(
      `Jenkins ${config.job} branch selection is unverified; rediscover the job or pass --allow-unverified-jenkins-branch for supervised use.`
    )
  }
  if (config.requiredBranch && config.requiredBranch !== branch) {
    throw new Error(
      `Jenkins ${config.job} is fixed to branch ${config.requiredBranch}; current branch is ${branch}.`
    )
  }
  const build = await triggerAndWaitForJenkins(
    config,
    {
      branch,
      nodeMajor: context.runtime.nodeMajor ?? '',
      runId: context.run.runId
    },
    {
      timeoutMs: Number(context.options.timeoutMs ?? 30 * 60 * 1000),
      env: selectedEnv(context.runtime, context.environment),
      external: workflowStage(context.run, 'jenkins').external,
      onExternalState: async (external) => {
        workflowStage(context.run, 'jenkins').external = external
        await context.persist()
      }
    }
  )
  return [
    evidence('jenkins', 'pass', `Jenkins ${config.job} #${build.number} succeeded.`, build.url)
  ]
}

async function deploy(context) {
  if (!context.allowMutations) {throw new Error('Deployment requires --allow-mutations.')}
  const argv = context.service?.deployCommand
  if (!Array.isArray(argv) || argv.length === 0) {
    if (context.service?.jenkins?.performsDeployment) {
      const buildUrl = workflowStage(context.run, 'jenkins').external?.buildUrl ?? null
      return [
        evidence(
          'deployment',
          'pass',
          'Jenkins build-and-publish job completed the deployment.',
          buildUrl
        )
      ]
    }
    throw new Error('No deployment command is configured for this service.')
  }
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

async function deploymentCheck(context) {
  const argv = context.service?.deployCheckCommand
  if (!Array.isArray(argv) || argv.length === 0) {return null}
  return commandEvidence(
    argv,
    context.repo,
    context.runtime,
    'deployment',
    'Deployment recovery check confirmed the target state.',
    context.environment
  )
}

async function rollback(context, cause) {
  const argv = context.service?.rollbackCommand
  if (!Array.isArray(argv) || argv.length === 0) {return false}
  const item = await commandEvidence(
    argv,
    context.repo,
    context.runtime,
    'deployment',
    'Rollback command completed after failed post-deployment verification.',
    context.environment
  )
  context.run.evidence.push(item)
  context.run.recovery.push({
    stage: 'smoke',
    action: 'rollback-completed',
    cause: cause instanceof Error ? cause.message : String(cause),
    at: Date.now()
  })
  await context.persist()
  return true
}

async function smoke(context) {
  const smokeUrls = context.service?.smokeUrls ?? context.environment?.smokeUrls ?? []
  const checks =
    context.service?.smokeChecks ??
    context.environment?.smokeChecks ??
    smokeUrls.map((url) => ({ url }))
  if (checks.length === 0) {throw new Error('No smoke checks are configured for this service.')}
  const results = []
  for (const check of checks) {
    const response = await fetch(check.url, {
      signal: AbortSignal.timeout(Number(context.options.smokeTimeoutMs ?? 15000))
    })
    const accepted = check.expectedStatuses?.includes(response.status) ?? response.ok
    if (!accepted)
      {throw new Error(`Smoke check failed: ${check.url} returned HTTP ${response.status}.`)}
    results.push(
      evidence(
        'smoke',
        'pass',
        `Smoke check passed: ${check.url} returned HTTP ${response.status}.`,
        check.url
      )
    )
  }
  return results
}

async function selftest() {
  const runtime = resolveProjectRuntime(path.join(tmpdir(), 'df-web-example'))
  if (runtime.family !== 'his' || runtime.nodeMajor !== 18)
    {throw new Error('HIS runtime fallback failed.')}
  const e2eRepo = await mkdtemp(path.join(tmpdir(), 'df-web-e2e-'))
  await writeFile(
    path.join(e2eRepo, 'package.json'),
    JSON.stringify({
      name: 'df-web-e2e-example',
      packageManager: 'pnpm@9.0.0',
      scripts: {
        build: 'vite build',
        test: 'vitest run',
        'e2e:screenshot': 'playwright test tests/e2e/his-qiankun-gray.spec.js'
      }
    })
  )
  const e2eCommands = detectVerifyCommands(e2eRepo, resolveProjectRuntime(e2eRepo))
    .map(commandText)
  if (e2eCommands.join(' && ') !== 'pnpm run build && pnpm test && pnpm run e2e:screenshot')
    {throw new Error(`E2E verify command detection failed: ${e2eCommands.join(' && ')}`)}
  const environment = selectEnvironment(
    { environments: { local152: { aliases: ['本地152开发环境'] } } },
    '本地152开发环境'
  )
  if (environment?.id !== 'local152') {throw new Error('Environment alias resolution failed.')}
  if (!isReadOnlySql('SELECT 1') || isReadOnlySql('WITH x AS (UPDATE t SET a = 1) SELECT * FROM x'))
    {throw new Error('Read-only SQL gate failed.')}
  if (!existsSync(uiReviewScriptPath()))
    {throw new Error('ui-spec-review scanner is missing from the skill pack.')}
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
    `- Status: ${report.status}`,
    `- Run: ${report.runId}`,
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

async function runStage(stage, context) {
  if (stage === 'intake') {return [evidence('runtime', 'pass', 'Repository intake completed.')]}
  if (stage === 'doctor') {return doctor(context)}
  if (stage === 'verify') {return verify(context)}
  if (stage === 'ui-review') {return uiReview(context)}
  if (stage === 'database') {return database(context)}
  if (stage === 'jenkins') {return jenkins(context)}
  if (stage === 'deploy') {return deploy(context)}
  if (stage === 'smoke') {return smoke(context)}
  if (stage === 'selftest') {return selftest()}
  throw new Error(`Unknown action: ${stage}`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const requestedAction = options._[0] ?? 'intake'
  const resumeRequested = requestedAction === 'resume' || options.resume === true
  const requestedStatePath = options.stateFile
    ? path.resolve(options.stateFile)
    : options.reportDir
      ? path.join(path.resolve(options.reportDir), 'run-state.json')
      : null
  if (resumeRequested && !requestedStatePath) {
    throw new Error('Resume requires --state-file or --report-dir.')
  }
  const resumedRun = resumeRequested ? await loadWorkflowRun(requestedStatePath) : null
  const action = resumedRun?.action ?? requestedAction
  const repo = path.resolve(resumedRun?.repo ?? options.repo ?? process.cwd())
  const catalog = loadCatalog(options.catalog ?? process.env.HIS_WORKFLOW_CATALOG)
  const runtime = resolveProjectRuntime(repo)
  const selectedService = selectService(catalog, options.service ?? resumedRun?.serviceId, repo)
  const environment = selectEnvironment(catalog, options.environment ?? resumedRun?.environmentId)
  const service = bindServiceEnvironment(selectedService, environment)
  const stages =
    action === 'full'
      ? ['doctor', 'verify', 'database', 'jenkins', 'deploy', 'smoke']
      : action === 'build'
        ? ['doctor', 'verify', 'jenkins']
        : [action]
  const head = await gitHead(repo)
  const run =
    resumedRun ??
    createWorkflowRun({
      action,
      repo,
      repositoryHead: head,
      serviceId: service?.id,
      environmentId: environment?.id,
      runtime,
      stages,
      runId: options.runId
    })
  if (resumedRun) {
    assertWorkflowRunIdentity(run, {
      repo,
      repositoryHead: head,
      serviceId: service?.id,
      environmentId: environment?.id
    })
    resetInterruptedAttempts(run)
    resetFailedStagesForResume(run)
  }
  const statePath = workflowStatePath(options, run.runId)
  await mkdir(path.dirname(statePath), { recursive: true })
  const context = {
    repo,
    runtime,
    service,
    environment,
    options,
    run,
    allowMutations: options.allowMutations === true,
    persist: () => saveWorkflowRun(statePath, run)
  }
  await context.persist()
  try {
    await executeWorkflow(context, { runStage, deploymentCheck, rollback })
    run.status = 'passed'
    run.completedAt = Date.now()
    run.error = null
  } catch (error) {
    run.status = 'failed'
    run.completedAt = Date.now()
    run.error = error instanceof Error ? error.message : String(error)
  }
  run.ok = run.status === 'passed'
  run.artifacts = await writeReport(run, options.reportDir ?? path.dirname(statePath))
  await context.persist()
  if (options.json) {console.log(JSON.stringify(run, null, 2))}
  else {console.log(run.ok ? 'HIS workflow completed.' : `HIS workflow failed: ${run.error}`)}
  if (!run.ok) {process.exitCode = 1}
}

await main()
