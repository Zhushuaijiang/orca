#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

function parseArgs(argv) {
  const args = {
    out: path.join('tests', 'e2e', 'his-qiankun-gray.spec.js'),
    route: null,
    expectText: null,
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
    } else if (arg === '--expect-text') {
      args.expectText = argv[++index]
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
  --main-url <online-or-local-shell-url> \\
  --subapp-name <package-json-name> \\
  --subapp-entry //localhost:<dev-port> \\
  --xi-tong-id <xiTongId> \\
  --route /apps/<xiTongId>/<target-page-route> \\
  --expect-text <target-page-visible-text> \\
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
const EXPECT_TEXT = process.env.HIS_E2E_EXPECT_TEXT || ${JSON.stringify(args.expectText ?? '')}
const SCREENSHOT_DIR = process.env.HIS_E2E_SCREENSHOT_DIR || ${JSON.stringify(args.screenshotDir)}
const PROFILE_DIR = process.env.HIS_CORS_PROFILE || path.join(os.tmpdir(), 'chrome-cors')
const CHROME_PATH = process.env.HIS_CHROME_PATH || defaultChromePath()

function firstExistingPath(paths) {
  return paths.find((candidate) => candidate && fs.existsSync(candidate))
}

function defaultChromePath() {
  if (process.platform === 'darwin') {
    return firstExistingPath(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'])
  }
  if (process.platform === 'win32') {
    return firstExistingPath([
      process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
    ])
  }
  return undefined
}

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
  const systemSelector = process.env.HIS_E2E_SYSTEM_SELECTOR
  const systemText = process.env.HIS_E2E_SYSTEM_TEXT
  if (username && password && usernameSelector && passwordSelector && submitSelector) {
    await page.locator(usernameSelector).fill(username)
    await page.locator(passwordSelector).fill(password)
    if (systemSelector) {
      await page.locator(systemSelector).click()
      if (systemText) {
        await page.getByText(systemText).first().click()
      }
      await page.waitForFunction((selector) => {
        const element = document.querySelector(selector)
        return !element || element.value || element.textContent.trim()
      }, systemSelector, { timeout: 15000 }).catch(() => undefined)
    }
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
  if (process.env.HIS_E2E_MENU_OPEN_SELECTOR) {
    await page.locator(process.env.HIS_E2E_MENU_OPEN_SELECTOR).click()
  }
  if (process.env.HIS_E2E_MENU_SELECTOR) {
    await page.locator(process.env.HIS_E2E_MENU_SELECTOR).click()
    return
  }
  await page.goto(normalizeUrl(TARGET_ROUTE).toString(), { waitUntil: 'domcontentloaded' })
}

async function assertMountedTarget(page, containerSelector) {
  await page.waitForFunction((selector) => {
    const element = document.querySelector(selector)
    if (!element) return false
    const style = getComputedStyle(element)
    const visible = style.display !== 'none' && style.visibility !== 'hidden'
    const hasContent = element.childElementCount > 0 || element.textContent.trim().length > 0
    return visible && hasContent && Boolean(element.querySelector('#micro-app') || element.querySelector('[data-qiankun]') || hasContent)
  }, containerSelector, { timeout: 60000 })
  if (EXPECT_TEXT) {
    await expect(page.getByText(EXPECT_TEXT).first()).toBeVisible({ timeout: 30000 })
  }
  const targetPath = normalizeUrl(TARGET_ROUTE).pathname
  if (targetPath && targetPath !== '/' && !targetPath.endsWith('/home')) {
    await expect.poll(async () => new URL(page.url()).pathname, { timeout: 30000 }).toContain(targetPath)
  }
}

test('HIS qiankun gray sub-app E2E with screenshots', async () => {
  const subappHost = normalizeUrl(SUBAPP_ENTRY).host
  const grayRequests = []
  const grayResponses = []
  const browserErrors = []
  const launchOptions = {
    headless: process.env.HIS_E2E_HEADLESS === '1',
    viewport: { width: 1440, height: 900 },
    recordVideo: process.env.HIS_E2E_RECORD_VIDEO === '1' ? { dir: SCREENSHOT_DIR } : undefined,
    args: ['--disable-web-security', '--disable-site-isolation-trials']
  }
  if (CHROME_PATH) {
    launchOptions.executablePath = CHROME_PATH
  } else {
    launchOptions.channel = process.env.HIS_CHROME_CHANNEL || 'chrome'
  }
  const context = await chromium.launchPersistentContext(PROFILE_DIR, launchOptions)
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
  page.on('requestfinished', async (request) => {
    try {
      if (new URL(request.url()).host === subappHost) {
        const response = await request.response()
        grayResponses.push({ url: request.url(), status: response?.status() })
      }
    } catch {}
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
    await assertMountedTarget(page, containerSelector)
    await screenshot(page, '02-qiankun-subapp-mounted.png')

    expect(grayRequests, \`Expected local gray sub-app requests to \${subappHost}\`).not.toHaveLength(0)
    expect(
      grayResponses.filter(({ status }) => status && status >= 200 && status < 400),
      \`Expected successful local gray sub-app responses from \${subappHost}\`
    ).not.toHaveLength(0)
    expect(
      grayResponses.some(({ url }) => /config\\.json|\\.js(\\?|$)|\\.css(\\?|$)/.test(url)),
      \`Expected local gray sub-app config/assets from \${subappHost}\`
    ).toBe(true)
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
