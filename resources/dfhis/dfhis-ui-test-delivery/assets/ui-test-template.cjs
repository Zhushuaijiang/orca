const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright-core')

const workItem = process.env.TEST_WORK_ITEM_ID || 'DFHIS-00000'
const artifactRoot = process.env.TEST_ARTIFACT_ROOT || '/artifacts'
const workRoot = path.join(artifactRoot, workItem)
const screenshotDir = path.join(workRoot, 'evidence', 'screenshots')
const videoDir = path.join(workRoot, 'evidence', 'videos')
const networkDir = path.join(workRoot, 'evidence', 'network')
const reportPath = path.join(workRoot, 'reports', 'results.xml')
const baseUrl = process.env.DFHIS_BASE_URL || 'http://127.0.0.1/'

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function safeUrl(value) {
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname}`
  } catch {
    return '<invalid-url>'
  }
}

function redactText(value) {
  let result = String(value)
  for (const name of ['DFHIS_USERNAME', 'DFHIS_PASSWORD']) {
    const secret = process.env[name]
    if (secret) {
      result = result.replaceAll(secret, `<${name.toLowerCase()}-redacted>`)
    }
  }
  return result.slice(0, 1000)
}

function writeJUnit({ duration, error }) {
  const failure = error
    ? `<failure message="${xml(error.message)}">${xml(error.stack || error.message)}</failure>`
    : ''
  const failed = error ? 1 : 0
  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${workItem}" tests="1" failures="${failed}" errors="0" skipped="0" time="${duration.toFixed(3)}"><testcase classname="dfhis.ui" name="requirement_scenario" time="${duration.toFixed(3)}">${failure}</testcase></testsuite>\n`
  fs.writeFileSync(reportPath, content)
}

async function loginAndOpenTarget(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  throw new Error('Implement stable DFHIS navigation before execution')
}

async function main() {
  if (process.env.DFHIS_UI_SANDBOX !== '1') {
    throw new Error('Run through run_container_ui_test.py')
  }
  for (const directory of [screenshotDir, videoDir, networkDir, path.dirname(reportPath)]) {
    fs.mkdirSync(directory, { recursive: true })
  }
  const responses = []
  const consoleMessages = []
  const started = Date.now()
  let browser
  let context
  let failure
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.HIS_CHROME_PATH || '/usr/bin/google-chrome',
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-site-isolation-trials'
      ]
    })
    context = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      recordVideo: { dir: videoDir, size: { width: 1600, height: 900 } }
    })
    await context.addInitScript(() => {
      window.chrome = { ...window.chrome, isDfHisLauncherStart: false }
    })
    const page = await context.newPage()
    page.on('response', (response) =>
      responses.push({ status: response.status(), url: safeUrl(response.url()) })
    )
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type())) {
        consoleMessages.push({ type: message.type(), text: redactText(message.text()) })
      }
    })
    page.on('pageerror', (error) =>
      consoleMessages.push({ type: 'pageerror', text: redactText(error.message) })
    )
    await loginAndOpenTarget(page)
    // Perform only the safe requirement-specific action and decisive assertions here.
    await page.screenshot({ path: path.join(screenshotDir, 'scenario_passed.png'), fullPage: true })
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error))
    const page = context?.pages()[0]
    if (page) {
      await page
        .screenshot({ path: path.join(screenshotDir, 'scenario_failed.png'), fullPage: true })
        .catch(() => {})
    }
  } finally {
    fs.writeFileSync(
      path.join(networkDir, 'responses.json'),
      `${JSON.stringify(responses, null, 2)}\n`
    )
    fs.writeFileSync(
      path.join(networkDir, 'console.json'),
      `${JSON.stringify(consoleMessages, null, 2)}\n`
    )
    if (context) {
      await context.close().catch(() => {})
    }
    if (browser) {
      await browser.close().catch(() => {})
    }
    writeJUnit({ duration: (Date.now() - started) / 1000, error: failure })
  }
  if (failure) {
    throw failure
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error))
  process.exitCode = 1
})
