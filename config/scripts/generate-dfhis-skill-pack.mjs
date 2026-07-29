import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const sourceRoot = path.join(repoRoot, 'resources', 'dfhis')
const outputPath = path.resolve(
  process.argv[2] ?? path.join(repoRoot, 'out', 'dfhis-skill-pack.json')
)
const zipOutputPath = outputPath.endsWith('.json')
  ? `${outputPath.slice(0, -'.json'.length)}.zip`
  : `${outputPath}.zip`

const crcTable = new Uint32Array(256)
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  crcTable[index] = value >>> 0
}

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

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear())
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { dosDate, dosTime }
}

function uint16(value) {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value)
  return buffer
}

function uint32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0)
  return buffer
}

function createZip(files) {
  const localParts = []
  const centralParts = []
  let offset = 0
  const timestamp = dosDateTime(new Date())
  for (const file of files) {
    const name = Buffer.from(file.path, 'utf8')
    const content = file.content
    const checksum = crc32(content)
    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(timestamp.dosTime),
      uint16(timestamp.dosDate),
      uint32(checksum),
      uint32(content.length),
      uint32(content.length),
      uint16(name.length),
      uint16(0),
      name
    ])
    localParts.push(localHeader, content)
    centralParts.push(
      Buffer.concat([
        uint32(0x02014b50),
        uint16(20),
        uint16(20),
        uint16(0x0800),
        uint16(0),
        uint16(timestamp.dosTime),
        uint16(timestamp.dosDate),
        uint32(checksum),
        uint32(content.length),
        uint32(content.length),
        uint16(name.length),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(0),
        uint32(offset),
        name
      ])
    )
    offset += localHeader.length + content.length
  }
  const centralDirectory = Buffer.concat(centralParts)
  return Buffer.concat([
    ...localParts,
    centralDirectory,
    Buffer.concat([
      uint32(0x06054b50),
      uint16(0),
      uint16(0),
      uint16(files.length),
      uint16(files.length),
      uint32(centralDirectory.length),
      uint32(offset),
      uint16(0)
    ])
  ])
}

const files = await Promise.all(
  (await listFiles(sourceRoot)).map(async (relativePath) => {
    const content = await readFile(path.join(sourceRoot, relativePath))
    return {
      path: relativePath.split(path.sep).join('/'),
      sha256: createHash('sha256').update(content).digest('hex'),
      content,
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
      files: files.map(({ path, sha256, contentBase64 }) => ({ path, sha256, contentBase64 }))
    },
    null,
    2
  )}\n`
)
await writeFile(zipOutputPath, createZip(files))

console.log(`Wrote ${files.length} DFHIS skill pack files to ${outputPath}`)
console.log(`Wrote ${files.length} DFHIS skill pack files to ${zipOutputPath}`)
