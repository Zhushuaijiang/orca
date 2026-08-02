import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false
  }
}))

import {
  describeYgtCompanyEnvironmentStatus,
  getYgtCompanyEnvironment,
  parseYgtCompanyEnvironmentReference,
  resolveYgtCompanyEnvironmentReferencePath
} from './ygt-company-environment'

const REFERENCE_RELATIVE_PARTS = [
  'dfhis-company-environment',
  'references',
  'company-environment',
  '医共体公司开发环境信息.md'
]

const BUNDLED_REFERENCE_PATH = path.join(
  process.cwd(),
  'resources',
  'dfhis',
  ...REFERENCE_RELATIVE_PARTS
)

const temporaryDirectories: string[] = []

async function temporaryHome(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-ygt-company-env-'))
  temporaryDirectories.push(directory)
  return directory
}

async function writeReference(
  root: string,
  parts: readonly string[],
  content: string
): Promise<string> {
  const filePath = path.join(root, ...parts)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf8')
  return filePath
}

const MINIMAL_REFERENCE = [
  '**主应用：**[http://192.168.199.41:8001/login](http://192.168.199.41:8001/login)',
  '',
  'admin/Admin@123',
  '',
  '**公司开发环境jekins：**',
  '',
  '[http://192.168.199.42:8082/](http://192.168.199.42:8082/)',
  '',
  'admin/cloudhis@2123'
].join('\n')

describe('parseYgtCompanyEnvironmentReference', () => {
  it('parses every credential section from the bundled company reference', async () => {
    const { readFile } = await import('node:fs/promises')
    const text = await readFile(BUNDLED_REFERENCE_PATH, 'utf8')
    expect(parseYgtCompanyEnvironmentReference(text)).toEqual({
      YGT_MAIN_USER: 'admin',
      YGT_MAIN_PASSWORD: 'Admin@123',
      YGT_GATEWAY_USER: 'nacos',
      YGT_GATEWAY_PASSWORD: 'cloudhis2123',
      YGT_NACOS_USER: 'nacos',
      YGT_NACOS_PASSWORD: 'cloudhis2123',
      YGT_DORIS_USER: 'df_admin',
      YGT_DORIS_PASSWORD: 'cloudhis@2123',
      YGT_JENKINS_USER: 'admin',
      YGT_JENKINS_PASSWORD: 'cloudhis@2123'
    })
  })

  it('ignores JDBC-style host:port/db lines when picking slash credentials', () => {
    const text = [
      '**公司开发环境数据库doris信息：**',
      '',
      '192.168.1.10:9030/df\\_ygt',
      '',
      'df\\_admin/cloudhis@2123'
    ].join('\n')
    const values = parseYgtCompanyEnvironmentReference(text)
    expect(values.YGT_DORIS_USER).toBe('df_admin')
    expect(values.YGT_DORIS_PASSWORD).toBe('cloudhis@2123')
  })

  it('ignores section headings with full-width colons when picking line credentials', () => {
    const text = [
      '**公司开发环境网关管理：**',
      '',
      'df-gateway:http://192.168.199.41:9000/console',
      '',
      'nacos',
      '',
      'cloudhis2123'
    ].join('\n')
    const values = parseYgtCompanyEnvironmentReference(text)
    expect(values.YGT_GATEWAY_USER).toBe('nacos')
    expect(values.YGT_GATEWAY_PASSWORD).toBe('cloudhis2123')
  })

  it('drops placeholder values that contain angle brackets', () => {
    const text = ['**主应用：**', '', 'admin/<password>'].join('\n')
    const values = parseYgtCompanyEnvironmentReference(text)
    expect(values.YGT_MAIN_USER).toBe('admin')
    expect(values.YGT_MAIN_PASSWORD).toBeUndefined()
  })
})

describe('resolveYgtCompanyEnvironmentReferencePath', () => {
  beforeEach(() => {
    temporaryDirectories.length = 0
  })

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('prefers the installed skill copy over the bundled pack copy', async () => {
    const home = await temporaryHome()
    const bundled = await temporaryHome()
    const installedPath = await writeReference(
      home,
      ['.codex', 'skills', ...REFERENCE_RELATIVE_PARTS],
      MINIMAL_REFERENCE
    )
    await writeReference(bundled, REFERENCE_RELATIVE_PARTS, MINIMAL_REFERENCE)

    expect(
      resolveYgtCompanyEnvironmentReferencePath({
        homeDirectory: home,
        bundledPackPath: bundled
      })
    ).toBe(installedPath)
  })

  it('falls back to the bundled pack copy when no skill copy is installed', async () => {
    const home = await temporaryHome()
    const bundled = await temporaryHome()
    const bundledPath = await writeReference(bundled, REFERENCE_RELATIVE_PARTS, MINIMAL_REFERENCE)

    expect(
      resolveYgtCompanyEnvironmentReferencePath({
        homeDirectory: home,
        bundledPackPath: bundled
      })
    ).toBe(bundledPath)
  })

  it('returns null when no reference exists anywhere', async () => {
    const home = await temporaryHome()
    const bundled = await temporaryHome()

    expect(
      resolveYgtCompanyEnvironmentReferencePath({
        homeDirectory: home,
        bundledPackPath: bundled
      })
    ).toBeNull()
  })
})

describe('getYgtCompanyEnvironment', () => {
  beforeEach(() => {
    temporaryDirectories.length = 0
  })

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('returns parsed variables plus the reference path', async () => {
    const home = await temporaryHome()
    const bundled = await temporaryHome()
    const bundledPath = await writeReference(bundled, REFERENCE_RELATIVE_PARTS, MINIMAL_REFERENCE)

    const environment = getYgtCompanyEnvironment({ homeDirectory: home, bundledPackPath: bundled })

    expect(environment).not.toBeNull()
    expect(environment?.sourcePath).toBe(bundledPath)
    expect(environment?.variables).toMatchObject({
      YGT_MAIN_USER: 'admin',
      YGT_MAIN_PASSWORD: 'Admin@123',
      YGT_JENKINS_USER: 'admin',
      YGT_JENKINS_PASSWORD: 'cloudhis@2123',
      YGT_COMPANY_REFERENCE_PATH: bundledPath
    })
  })

  it('returns null when no reference exists', async () => {
    const home = await temporaryHome()
    const bundled = await temporaryHome()

    expect(getYgtCompanyEnvironment({ homeDirectory: home, bundledPackPath: bundled })).toBeNull()
  })
})

describe('describeYgtCompanyEnvironmentStatus', () => {
  beforeEach(() => {
    temporaryDirectories.length = 0
  })

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('reports the credential source when the reference is available', async () => {
    const home = await temporaryHome()
    const bundled = await temporaryHome()
    await writeReference(bundled, REFERENCE_RELATIVE_PARTS, MINIMAL_REFERENCE)

    const message = describeYgtCompanyEnvironmentStatus({
      homeDirectory: home,
      bundledPackPath: bundled
    })

    expect(message).toContain('YGT company credentials ready')
    expect(message).not.toContain('failed')
    expect(message).not.toContain('not installed')
  })

  it('warns without failing the install when the reference is missing', async () => {
    const home = await temporaryHome()
    const bundled = await temporaryHome()

    const message = describeYgtCompanyEnvironmentStatus({
      homeDirectory: home,
      bundledPackPath: bundled
    })

    expect(message).toContain('YGT company environment reference is missing')
    expect(message).not.toContain('failed')
    expect(message).not.toContain('not installed')
  })
})
