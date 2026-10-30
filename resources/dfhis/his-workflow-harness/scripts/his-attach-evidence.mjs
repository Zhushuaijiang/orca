import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const EVIDENCE_DIRECTORIES = new Set(['screenshots', 'videos', 'traces'])
const MEDIA_FILE = /\.(?:png|jpe?g|mp4|webm|zip)$/i

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

// Media files qualify only below a screenshots/videos/traces directory.
export function collectEvidenceMedia(rootDirectory) {
  const files = []
  const pending = [{ directory: rootDirectory, inside: false }]
  while (pending.length > 0) {
    const { directory, inside } = pending.pop()
    if (!existsSync(directory)) {
      continue
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        pending.push({
          directory: target,
          inside: inside || EVIDENCE_DIRECTORIES.has(entry.name.toLowerCase())
        })
      } else if (entry.isFile() && inside && MEDIA_FILE.test(entry.name)) {
        files.push(target)
      }
    }
  }
  return files.sort()
}

export async function runAttachEvidence(context) {
  const workItem = String(context.options.workItem ?? '')
    .trim()
    .toUpperCase()
  if (!/^DFHIS-\d+$/.test(workItem)) {
    throw new Error('attach-evidence requires --work-item DFHIS-<number>.')
  }
  const requirementDir = context.options.requirementDir
  if (!requirementDir) {
    throw new Error(
      'attach-evidence requires --requirement-dir (the archived Yunxiao requirement directory).'
    )
  }
  if (!existsSync(path.join(path.resolve(requirementDir), 'raw.json'))) {
    throw new Error(
      `attach-evidence requirement dir has no raw.json: ${path.resolve(requirementDir)}`
    )
  }
  const uploader = path.resolve(
    import.meta.dirname,
    '../../yunxiao-requirement-archiver/scripts/upload_yunxiao_attachment.py'
  )
  if (!existsSync(uploader)) {
    throw new Error(`Yunxiao attachment uploader is missing: ${uploader}`)
  }
  const root = path.join(path.resolve(context.options.artifactRoot ?? ''), workItem)
  const files = collectEvidenceMedia(root)
  if (files.length === 0) {
    throw new Error(`No UI evidence artifacts to upload under ${root} (screenshots/videos/traces).`)
  }
  const python = context.options.python ?? (process.platform === 'win32' ? 'python' : 'python3')
  const uploaded = []
  for (const file of files) {
    const argv = [
      python,
      uploader,
      '--requirement-dir',
      path.resolve(requirementDir),
      '--file',
      file
    ]
    const result = await run(argv, { cwd: context.repo, env: process.env })
    if (result.code !== 0) {
      throw new Error(
        `Attachment upload failed for ${path.basename(file)}: ${result.stderr.trim() || result.stdout.trim() || result.error || `exit ${result.code}`}`
      )
    }
    uploaded.push({ path: file, name: path.basename(file), size: statSync(file).size, workItem })
  }
  return uploaded
}
