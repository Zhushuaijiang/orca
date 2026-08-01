import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveDfHisProjectRuntime } from './project-runtime'

const temporaryDirectories: string[] = []

async function project(name: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), `${name}-`))
  temporaryDirectories.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('DFHIS project runtime resolver', () => {
  it('uses repository declarations before the HIS family fallback', async () => {
    const root = await project('df-web-his')
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ engines: { node: '>=20' } }))
    await writeFile(path.join(root, 'yarn.lock'), '')

    expect(resolveDfHisProjectRuntime(root)).toMatchObject({
      family: 'his',
      nodeMajor: 20,
      nodeSource: 'repository',
      packageManager: 'yarn'
    })
  })

  it('defaults HIS to Node 18 and YGT to Node 22', async () => {
    const hisRoot = await project('df-web-menzhen')
    const ygtRoot = await project('df-ygt-main')

    expect(resolveDfHisProjectRuntime(hisRoot)).toMatchObject({ family: 'his', nodeMajor: 18 })
    expect(resolveDfHisProjectRuntime(ygtRoot)).toMatchObject({ family: 'ygt', nodeMajor: 22 })
  })

  it('accepts Node 24 when a YGT repository declares it', async () => {
    const root = await project('df-ygt-main')
    await writeFile(path.join(root, '.nvmrc'), '24\n')
    await writeFile(path.join(root, 'pnpm-lock.yaml'), '')

    expect(resolveDfHisProjectRuntime(root)).toMatchObject({
      family: 'ygt',
      nodeMajor: 24,
      packageManager: 'pnpm'
    })
  })

  it('finds a matching nvm installation for terminal PATH injection', async () => {
    const root = await project('df-web-his')
    const homeDirectory = await project('runtime-home')
    const bin = path.join(homeDirectory, '.nvm', 'versions', 'node', 'v18.20.5', 'bin')
    await mkdir(bin, { recursive: true })
    await writeFile(path.join(bin, 'node'), '')

    expect(resolveDfHisProjectRuntime(root, { homeDirectory, platform: 'win32' }).nodeBinPath).toBe(
      null
    )
    expect(resolveDfHisProjectRuntime(root, { homeDirectory, platform: 'linux' }).nodeBinPath).toBe(
      bin
    )
  })
})
