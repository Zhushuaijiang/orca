#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

function parseArgs(argv) {
  const args = {
    out: path.join('tests', 'e2e', 'his-qiankun-gray.spec.js'),
    route: null,
    screenshotDir: path.join('test-results', 'his-qiankun-gray'),
    updatePackageScript: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === 'scaffold') {
      args.command = 'scaffold'
    } else if (arg === '--repo') {
      args.repo = argv[++index]
    } else if (arg === '--main-url') {
      args.mainUrl = argv[++index]
    } else if (arg === '--subapp-name') {
      args.subappName = argv[++index]
    } else if (arg === '--subapp-entry') {
      args.subappEntry = argv[++index]
    } else if (arg === '--xi-tong-id') {
      args.xiTongId = argv[++index]
    } else if (arg === '--route') {
      args.route = argv[++index]
    } else if (arg === '--out') {
      args.out = argv[++index]
    } else if (arg === '--screenshot-dir') {
      args.screenshotDir = argv[++index]
    } else if (arg === '--update-package-script') {
      args.updatePackageScript = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

function usage() {
  return `Usage:
node scripts/his-qiankun-e2e.mjs scaffold \\
  --repo /path/to/subapp \\
  --main-url http://localhost:9000 \\
  --subapp-name df-web-menzhenysz \\
  --subapp-entry //localhost:8022 \\
  --xi-tong-id 04 \\
  --update-package-script`
}

function requireArg(args, name) {
  if (!args[name]) {
    throw new Error(`Missing required argument: --${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`)
  }
}

function specTemplate(args) {
  const route = args.route ?? `/apps/${args.xiTongId}/home`
  return `const { chromium, expect, test } = require('@playwright/test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const MAIN_URL = process.env.HIS_MAIN_URL || ${JSON.stringify(args.mainUrl)}
const SUBAPP_NAME = process.env.HIS_SUBAPP_NAME || ${JSON.stringify(args.subappName)}
const SUBAPP_ENTRY = process.env.HIS_SUBAPP_ENTRY || ${JSON.stringify(args.subappEntry)}
const XI_TONG_ID = process.env.HIS_XI_TONG_ID || ${JSON.stringify(args.xiTongId)}
const TARGET_ROUTE = process.env.HIS_TARGET_ROUTE || ${JSON.stringify(route)}
const SCREENSHOT_DIR = process.env.HIS_E2E_SCREENSHOT_DIR || ${JSON.stringify(args.screenshotDir)}
const PROFILE_DIR = process.env.HIS_CORS_PROFILE || path.join(os.tmpdir(), 'chrome-cors')
const CHROME_PATH = process.env.HIS_CHROME_PATH || (
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : undefined
)

function normalizeUrl(value, baseUrl = MAIN_URL) {
  if (value.startsWith('//')) {
    return new URL(\`\${new URL(baseUrl).protocol}\${value}\`)
  }
  return new URL(value, baseUrl)
}

async function screenshot(page, name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: true })
}

async function login(page) {
  const username = process.env.HIS_E2E_USERNAME
  const password = process.env.HIS_E2E_PASSWORD
  const usernameSelector = process.env.HIS_E2E_USERNAME_SELECTOR
  const passwordSelector = process.env.HIS_E2E_PASSWORD_SELECTOR
  const submitSelector = process.env.HIS_E2E_SUBMIT_SELECTOR
  if (username && password && usernameSelector && passwordSelector && submitSelector) {
    await page.locator(usernameSelector).fill(username)
    await page.locator(passwordSelector).fill(password)
    await Promise.all([
      page.waitForLoadState('networkidle').catch(() => undefined),
      page.locator(submitSelector).click()
    ])
    return
  }
  if (process.env.HIS_E2E_ALLOW_MANUAL_LOGIN === '1') {
    await page.waitForFunction(() => sessionStorage.getItem('token'), null, { timeout: 180000 })
    return
  }
  throw new Error(
    'Set HIS_E2E_USERNAME/PASSWORD plus selector env vars, or customize login(page) in this spec.'
  )
}

async function openRequirementFlow(page) {
  if (process.env.HIS_E2E_MENU_SELECTOR) {
    await page.locator(process.env.HIS_E2E_MENU_SELECTOR).click()
    return
  }
  await page.goto(normalizeUrl(TARGET_ROUTE).toString(), { waitUntil: 'domcontentloaded' })
}

test('HIS qiankun gray sub-app E2E with screenshots', async () => {
  const subappHost = normalizeUrl(SUBAPP_ENTRY).host
  const grayRequests = []
  const browserErrors = []
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: CHROME_PATH,
    headless: process.env.HIS_E2E_HEADLESS === '1',
    viewport: { width: 1440, height: 900 },
    recordVideo: process.env.HIS_E2E_RECORD_VIDEO === '1' ? { dir: SCREENSHOT_DIR } : undefined,
    args: ['--disable-web-security', '--disable-site-isolation-trials']
  })
  const page = await context.newPage()
  page.on('request', (request) => {
    try {
      if (new URL(request.url()).host === subappHost) {
        grayRequests.push(request.url())
      }
    } catch {}
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  try {
    await page.addInitScript(({ subappName, subappEntry }) => {
      sessionStorage.setItem('devDebug', 'test')
      sessionStorage.setItem(subappName, subappEntry)
    }, { subappName: SUBAPP_NAME, subappEntry: SUBAPP_ENTRY })

    await page.goto(MAIN_URL, { waitUntil: 'domcontentloaded' })
    await screenshot(page, '01-shell-login.png')
    await login(page)
    await expect.poll(async () => page.evaluate(() => sessionStorage.getItem('token')), {
      timeout: 60000
    }).toBeTruthy()

    await openRequirementFlow(page)
    const containerSelector = \`#apps-\${XI_TONG_ID}\`
    await page.waitForFunction((selector) => {
      const element = document.querySelector(selector)
      return Boolean(element && (element.childElementCount > 0 || element.textContent.trim()))
    }, containerSelector, { timeout: 60000 })
    await screenshot(page, '02-qiankun-subapp-mounted.png')

    expect(grayRequests, \`Expected local gray sub-app requests to \${subappHost}\`).not.toHaveLength(0)
    expect(browserErrors.filter((message) => /qiankun|bootstrap|mount|script|cors/i.test(message))).toEqual([])
  } finally {
    await context.close()
  }
})
`
}

async function updatePackageScript(repo, outFile) {
  const packagePath = path.join(repo, 'package.json')
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  packageJson.scripts = packageJson.scripts ?? {}
  packageJson.scripts['e2e:screenshot'] = `playwright test ${outFile.split(path.sep).join('/')}`
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
}

async function scaffold(args) {
  requireArg(args, 'repo')
  requireArg(args, 'mainUrl')
  requireArg(args, 'subappName')
  requireArg(args, 'subappEntry')
  requireArg(args, 'xiTongId')
  const repo = path.resolve(args.repo)
  const outFile = path.normalize(args.out)
  const outPath = path.join(repo, outFile)
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, specTemplate(args))
  if (args.updatePackageScript) {
    await updatePackageScript(repo, outFile)
  }
  console.log(JSON.stringify({
    ok: true,
    spec: outPath,
    packageScript: args.updatePackageScript ? 'e2e:screenshot' : null
  }, null, 2))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.command !== 'scaffold') {
    console.log(usage())
    process.exit(args.command ? 1 : 0)
  }
  await scaffold(args)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
