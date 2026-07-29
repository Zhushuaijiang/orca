import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const sourceRoot = path.join(repoRoot, 'resources', 'dfhis')
const outputPath = path.resolve(
  process.argv[2] ?? path.join(repoRoot, 'out', 'dfhis-skill-pack.json')
)

function shouldSkip(filePath) {
  const parts = filePath.split(path.sep)
  return parts.includes('__pycache__') || parts.includes('.DS_Store')
}

async function listFiles(directory, baseDirectory = directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    const relativePath = path.relative(baseDirectory, fullPath)
    if (shouldSkip(relativePath)) {
      continue
    }
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath, baseDirectory)))
    } else if (entry.isFile()) {
      files.push(relativePath)
    }
  }
  return files.sort((left, right) => left.localeCompare(right, 'en'))
}

const files = await Promise.all(
  (await listFiles(sourceRoot)).map(async (relativePath) => {
    const content = await readFile(path.join(sourceRoot, relativePath))
    return {
      path: relativePath.split(path.sep).join('/'),
      sha256: createHash('sha256').update(content).digest('hex'),
      contentBase64: content.toString('base64')
    }
  })
)

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      skillPackId: 'dfhis',
      version: new Date().toISOString(),
      files
    },
    null,
    2
  )}\n`
)

console.log(`Wrote ${files.length} DFHIS skill pack files to ${outputPath}`)
