import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

function run(argv, options) {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.on('error', (error) => resolve({ code: null, stdout, stderr, error: error.message }))
    child.on('close', (code) => resolve({ code, stdout, stderr, error: null }))
  })
}

function evidenceFiles(directory) {
  if (!existsSync(directory)) {return []}
  const files = []
  const pending = [directory]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name)
      if (entry.isDirectory()) {pending.push(target)}
      else if (entry.isFile()) {files.push(target)}
    }
  }
  return files
}

export async function runDfHisUiSandboxGate(context) {
  const workItem = String(context.options.workItem ?? '').trim().toUpperCase()
  const testScript = context.options.uiTestScript
  const artifactRoot = context.options.artifactRoot
  if (!/^DFHIS-\d+$/.test(workItem))
    {throw new Error('DFHIS UI sandbox requires --work-item DFHIS-<number>.')}
  if (!testScript || !artifactRoot)
    {throw new Error('DFHIS UI sandbox requires --ui-test-script and --artifact-root.')}

  const runner = path.resolve(
    import.meta.dirname,
    '../../dfhis-ui-test-delivery/scripts/run_container_ui_test.py'
  )
  if (!existsSync(runner)) {throw new Error(`DFHIS UI sandbox runner is missing: ${runner}`)}
  const python = context.options.python ?? process.env.TEST_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')
  const argv = [
    python,
    runner,
    'run',
    workItem,
    path.resolve(testScript),
    '--root',
    path.resolve(artifactRoot),
    '--backend',
    context.options.uiSandboxBackend ?? 'remote'
  ]
  if (context.options.uiSandboxRemote)
    {argv.push('--remote', context.options.uiSandboxRemote)}
  if (context.options.uiBaseUrl)
    {argv.push('--base-url', context.options.uiBaseUrl)}
  if (context.options.allowUiMutations) {argv.push('--allow-mutations')}

  const result = await run(argv, { cwd: context.repo, env: process.env })
  if (result.code !== 0)
    {throw new Error(`DFHIS UI sandbox failed: ${result.stderr.trim() || result.stdout.trim() || result.error}`)}
  const reportDirectory = path.join(path.resolve(artifactRoot), workItem, 'reports')
  const manifestPath = path.join(reportDirectory, 'sandbox-run.json')
  const junitPath = path.join(reportDirectory, 'results.xml')
  if (!existsSync(manifestPath) || !existsSync(junitPath))
    {throw new Error('DFHIS UI sandbox did not return its manifest and JUnit evidence.')}
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.result !== 'passed' || manifest.backend !== (context.options.uiSandboxBackend ?? 'remote'))
    {throw new Error('DFHIS UI sandbox manifest does not prove a passing run on the selected backend.')}
  const files = evidenceFiles(path.join(path.resolve(artifactRoot), workItem, 'evidence'))
  if (!files.some((file) => /\.(?:png|jpe?g|webm|json)$/i.test(file)))
    {throw new Error('DFHIS UI sandbox passed without screenshot, video, or network evidence.')}
  return { manifestPath, backend: manifest.backend, image: manifest.image }
}
