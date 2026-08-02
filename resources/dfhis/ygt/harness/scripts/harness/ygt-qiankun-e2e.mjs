#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function parseArgs(argv) {
  const args = {
    mainUrl: process.env.YGT_MAIN_URL || 'http://192.168.199.41:8001',
    out: path.join('tests', 'e2e', 'ygt-qiankun-gray.spec.js'),
    route: '/',
    activeRule: null,
    expectText: null,
    screenshotDir: path.join('test-results', 'ygt-qiankun-gray'),
    updatePackageScript: false
  }
  const [command, ...rest] = argv
  args.command = command
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (arg === '--repo') {
      args.repo = rest[++index]
    } else if (arg === '--main-url') {
      args.mainUrl = rest[++index]
    } else if (arg === '--subapp-name') {
      args.subappName = rest[++index]
    } else if (arg === '--subapp-entry') {
      args.subappEntry = rest[++index]
    } else if (arg === '--active-rule') {
      args.activeRule = rest[++index]
    } else if (arg === '--route') {
      args.route = rest[++index]
    } else if (arg === '--expect-text') {
      args.expectText = rest[++index]
    } else if (arg === '--out') {
      args.out = rest[++index]
    } else if (arg === '--screenshot-dir') {
      args.screenshotDir = rest[++index]
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
node scripts/harness/ygt-qiankun-e2e.mjs scaffold \\
  --repo /path/to/df-web-ygt-subapp \\
  --subapp-name <micro-app-name> \\
  --subapp-entry http://localhost:<dev-port> \\
  --active-rule /<active-rule> \\
  --route /<active-rule>/<target-page-route> \\
  --expect-text <target-page-visible-text> \\
  --update-package-script`
}

function requireArg(args, name) {
  if (!args[name]) {
    throw new Error(`Missing --${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`)
  }
}

function generatedSpec(args) {
  const routePath = new URL(args.route, args.mainUrl).pathname
  const activeRule = args.activeRule ?? `/${routePath.split('/').filter(Boolean)[0] ?? ''}`
  const route = args.route ?? activeRule
  return `import { test, expect, chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const MAIN_URL = process.env.YGT_MAIN_URL || ${JSON.stringify(args.mainUrl)}
const SUBAPP_NAME = process.env.YGT_SUBAPP_NAME || ${JSON.stringify(args.subappName)}
const SUBAPP_ENTRY = process.env.YGT_SUBAPP_ENTRY || ${JSON.stringify(args.subappEntry)}
const ACTIVE_RULE = process.env.YGT_ACTIVE_RULE || ${JSON.stringify(activeRule)}
const TARGET_ROUTE = process.env.YGT_TARGET_ROUTE || ${JSON.stringify(route)}
const EXPECT_TEXT = process.env.YGT_E2E_EXPECT_TEXT || ${JSON.stringify(args.expectText ?? '')}
const SCREENSHOT_DIR = process.env.YGT_E2E_SCREENSHOT_DIR || ${JSON.stringify(args.screenshotDir)}
const PROFILE_DIR = process.env.YGT_CORS_PROFILE || path.join(os.tmpdir(), 'chrome-cors-ygt')
const CHROME_PATH = process.env.YGT_CHROME_PATH || defaultChromePath()

function firstExistingPath(paths) {
  return paths.filter(Boolean).find((candidate) => {
    try {
      return existsSync(candidate)
    } catch {
      return false
    }
  })
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

function normalizeUrl(value) {
  if (/^\\/\\//.test(value)) {
    return new URL(\`\${new URL(MAIN_URL).protocol}\${value}\`)
  }
  return new URL(value, MAIN_URL)
}

async function screenshot(page, name) {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: true })
}

async function seedGrayEntry(page) {
  await page.addInitScript(({ name, entry }) => {
    sessionStorage.setItem('devDebug', 'test')
    sessionStorage.setItem(name, entry)
  }, { name: SUBAPP_NAME, entry: SUBAPP_ENTRY })
}

async function loginIfNeeded(page) {
  const username = process.env.YGT_E2E_USERNAME || process.env.YGT_MAIN_USER
  const password = process.env.YGT_E2E_PASSWORD || process.env.YGT_MAIN_PASSWORD
  const usernameSelector = process.env.YGT_E2E_USERNAME_SELECTOR
  const passwordSelector = process.env.YGT_E2E_PASSWORD_SELECTOR
  const submitSelector = process.env.YGT_E2E_SUBMIT_SELECTOR
  if (username && password && usernameSelector && passwordSelector && submitSelector) {
    await page.locator(usernameSelector).fill(username)
    await page.locator(passwordSelector).fill(password)
    await Promise.all([
      page.waitForLoadState('networkidle').catch(() => undefined),
      page.locator(submitSelector).click()
    ])
    return
  }
  if (process.env.YGT_E2E_ALLOW_MANUAL_LOGIN === '1') {
    await page.pause()
    return
  }
}

async function openTargetFlow(page) {
  if (process.env.YGT_E2E_MENU_OPEN_SELECTOR) {
    await page.locator(process.env.YGT_E2E_MENU_OPEN_SELECTOR).click()
  }
  if (process.env.YGT_E2E_MENU_SELECTOR) {
    await page.locator(process.env.YGT_E2E_MENU_SELECTOR).click()
    return
  }
  await page.goto(normalizeUrl(TARGET_ROUTE).toString(), { waitUntil: 'domcontentloaded' })
}

async function assertMountedTarget(page) {
  await page.waitForFunction(() => {
    const container = document.querySelector('#micro-container')
    if (!container) return false
    const style = getComputedStyle(container)
    const visible = style.display !== 'none' && style.visibility !== 'hidden'
    const hasContent = container.childElementCount > 0 || container.textContent.trim().length > 0
    return visible && hasContent
  }, null, { timeout: 60000 })
  if (EXPECT_TEXT) {
    await expect(page.getByText(EXPECT_TEXT).first()).toBeVisible({ timeout: 30000 })
  }
  const targetPath = normalizeUrl(TARGET_ROUTE).pathname
  if (targetPath && targetPath !== '/') {
    await expect.poll(async () => new URL(page.url()).pathname, { timeout: 30000 }).toContain(targetPath)
  }
}

test('YGT qiankun gray sub-app E2E with screenshots', async () => {
  const subappHost = normalizeUrl(SUBAPP_ENTRY).host
  const grayRequests = []
  const grayResponses = []
  const browserErrors = []
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: process.env.YGT_E2E_HEADLESS === '1',
    executablePath: CHROME_PATH,
    channel: CHROME_PATH ? undefined : 'chrome',
    args: ['--disable-web-security', '--disable-site-isolation-trials'],
    ignoreHTTPSErrors: true,
    recordVideo: process.env.YGT_E2E_RECORD_VIDEO === '1' ? { dir: SCREENSHOT_DIR } : undefined
  })
  const page = await context.newPage()
  page.on('request', (request) => {
    try {
      if (new URL(request.url()).host === subappHost) {
        grayRequests.push(request.url())
      }
    } catch {}
  })
  page.on('requestfinished', async (request) => {
    try {
      if (new URL(request.url()).host === subappHost) {
        const response = await request.response()
        grayResponses.push({ url: request.url(), status: response?.status() })
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
    await seedGrayEntry(page)
    await page.goto(normalizeUrl('/').toString(), { waitUntil: 'domcontentloaded' })
    await loginIfNeeded(page)
    await page.waitForLoadState('networkidle').catch(() => undefined)
    await screenshot(page, '01-shell-ready.png')

    await openTargetFlow(page)
    await assertMountedTarget(page)
    await screenshot(page, '02-qiankun-subapp-mounted.png')

    expect(grayRequests, \`Expected local gray sub-app requests to \${subappHost}\`).not.toHaveLength(0)
    expect(
      grayResponses.filter(({ status }) => status && status >= 200 && status < 400),
      \`Expected successful local gray sub-app responses from \${subappHost}\`
    ).not.toHaveLength(0)
    expect(
      grayResponses.some(({ url }) => /index\\.html|config\\.json|\\.js(\\?|$)|\\.css(\\?|$)/.test(url)),
      \`Expected local gray sub-app index/config/assets from \${subappHost}\`
    ).toBe(true)
    expect(browserErrors.filter((message) => /qiankun|bootstrap|mount|script|cors/i.test(message))).toEqual([])
  } finally {
    await context.close()
  }
})
`
}

async function updatePackageScript(repo, specPath) {
  const packagePath = path.join(repo, 'package.json')
  const content = JSON.parse(await readFile(packagePath, 'utf8'))
  content.scripts ??= {}
  content.scripts['e2e:ygt:screenshot'] =
    `playwright test ${specPath.split(path.sep).join('/')}`
  await writeFile(packagePath, `${JSON.stringify(content, null, 2)}\n`)
}

async function scaffold(args) {
  requireArg(args, 'repo')
  requireArg(args, 'subappName')
  requireArg(args, 'subappEntry')
  const repo = path.resolve(args.repo)
  const outPath = path.resolve(repo, args.out)
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, generatedSpec(args))
  if (args.updatePackageScript) {
    if (!existsSync(path.join(repo, 'package.json'))) {
      throw new Error(`package.json not found in ${repo}`)
    }
    await updatePackageScript(repo, args.out)
  }
  console.log(JSON.stringify({
    ok: true,
    spec: outPath,
    packageScript: args.updatePackageScript ? 'e2e:ygt:screenshot' : null
  }, null, 2))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.command !== 'scaffold') {
    throw new Error(usage())
  }
  await scaffold(args)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
