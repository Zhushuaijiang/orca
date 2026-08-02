import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const MAX_CAPTURE_BYTES = 256 * 1024

function appendBounded(chunks, chunk) {
  chunks.push(Buffer.from(chunk))
  let total = chunks.reduce((sum, entry) => sum + entry.length, 0)
  while (total > MAX_CAPTURE_BYTES && chunks.length > 1) {
    total -= chunks.shift().length
  }
}

export function capturePackagedProcessOutput(child) {
  const stdout = []
  const stderr = []
  child?.stdout?.on('data', (chunk) => appendBounded(stdout, chunk))
  child?.stderr?.on('data', (chunk) => appendBounded(stderr, chunk))
  return { stdout, stderr }
}

function readCaptured(chunks) {
  return Buffer.concat(chunks).toString('utf8')
}

function copyDiagnosticFile(source, destination) {
  if (existsSync(source)) {
    copyFileSync(source, destination)
  }
}

export function persistPackagedLaunchDiagnostics({
  childProcess,
  error,
  processOutput,
  userDataDir
}) {
  const outputDir = process.env.ORCA_E2E_DIAG_DIR
  if (!outputDir) {
    return
  }
  mkdirSync(outputDir, { recursive: true })
  const summary = {
    error: error instanceof Error ? error.stack : String(error),
    exitCode: childProcess?.exitCode ?? null,
    killed: childProcess?.killed ?? null,
    pid: childProcess?.pid ?? null,
    stderr: readCaptured(processOutput.stderr),
    stdout: readCaptured(processOutput.stdout)
  }
  writeFileSync(
    path.join(outputDir, 'packaged-launch.json'),
    `${JSON.stringify(summary, null, 2)}\n`
  )
  copyDiagnosticFile(
    path.join(userDataDir, 'startup-diagnostics.log'),
    path.join(outputDir, 'startup-diagnostics.log')
  )
  copyDiagnosticFile(
    path.join(userDataDir, 'logs', 'daemon.log'),
    path.join(outputDir, 'daemon.log')
  )
}
