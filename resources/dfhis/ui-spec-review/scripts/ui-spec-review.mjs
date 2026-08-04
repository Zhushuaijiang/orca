#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const SCAN_EXTENSIONS = new Set(['.vue', '.css', '.scss', '.less', '.styl', '.html'])
const IGNORED_DIRECTORY = new Set([
  'node_modules',
  'dist',
  'out',
  'coverage',
  '.git',
  '__pycache__'
])
const LIGHT_PAGE_BACKGROUND = /^#(?:fff(?:fff)?|f5f5f5|fafafa|efefef|e8e8e8|ececec|f0f0f0)$/i
const DARK_TEXT_COLOR = /^#(?:000(?:000)?|333(?:333)?|444|555|666(?:666)?|999(?:999)?|4a4a4a)$/i
const FUNCTIONAL_COLORS = /^#(?:f5222d|ff4d4f|52c41a|73d13d|faad14|fadb14|1890ff|409eff)$/i
const SPACING_MULTIPLE = 4

const SPEC = {
  background: { id: 1, category: 'Layout', label: '页面基础背景色 #E9E9EC' },
  spacing: { id: 2, category: 'Layout', label: '边距/内距使用 8px（表格间 16px，表单 gutter 12px）' },
  radius: { id: 5, category: 'Layout', label: '容器圆角 4px，贴边容器 0px' },
  tableAction: { id: 9, category: 'Table Global', label: '表格操作按钮组右端对齐' },
  dxTable: { id: 11, category: 'Table Data Grid', label: '使用新的 Dx 表格（df-dx-table）组件' },
  formGutter: { id: 17, category: 'Form', label: '栅格 Gutter 间距 12px' },
  formLabel: { id: 18, category: 'Form', label: '标签右对齐+控件左对齐，或标签左对齐+控件左对齐' },
  textColor: { id: 19, category: 'Color', label: '文字颜色 #1A1A1A，用透明度区分' },
  lineHeight: { id: 21, category: 'Text', label: '行高 22px（表格数据区 18px）' },
  modalSize: { id: 27, category: 'Modal', label: '大弹窗默认 90% × 80%' }
}

function parseArgs(argv) {
  const options = { _: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (!value.startsWith('--')) {
      options._.push(value)
      continue
    }
    const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    options[key] = ['json', 'changedOnly'].includes(key) ? true : argv[++index]
  }
  return options
}

function isIgnored(relativePath) {
  return relativePath.split(path.sep).some((part) => IGNORED_DIRECTORY.has(part))
}

function violation(spec, file, line, snippet, detail) {
  return { specId: spec.id, category: spec.category, file, line, snippet, detail }
}

function cssHex(value) {
  const match = /^#([0-9a-f]{3,8})\b/i.exec(value.trim())
  return match ? `#${match[1].toLowerCase()}` : null
}

function pxValue(value) {
  const match = /^([0-9]+(?:\.[0-9]+)?)px$/.exec(value.trim())
  return match ? Number.parseFloat(match[1]) : null
}

const ACTION_BUTTON_SELECTOR = /action|operate|btn|button/i

function isActionButtonScope(selector) {
  return ACTION_BUTTON_SELECTOR.test(selector)
}

function scanCssLine(line, file, lineNumber, selector, findings) {
  for (const declaration of line.matchAll(/([\w-]+)\s*:\s*([^;}{]+)/g)) {
    const property = declaration[1].toLowerCase()
    const value = declaration[2].trim()
    if (property === 'background' || property === 'background-color') {
      const hex = cssHex(value)
      if (hex && LIGHT_PAGE_BACKGROUND.test(hex)) {
        findings.push(
          violation(SPEC.background, file, lineNumber, line.trim(),
            `背景 ${hex} 为浅色硬编码，页面基础背景应使用 #E9E9EC`)
        )
      }
    }
    if (property === 'margin' || property === 'padding' || property === 'gap') {
      const px = pxValue(value)
      if (px !== null && px > 0 && px % SPACING_MULTIPLE !== 0) {
        findings.push(
          violation(SPEC.spacing, file, lineNumber, line.trim(),
            `${property} 为 ${px}px，不在 4px 栅格上；规范间距 8px（容器）/16px（表格间）/12px（表单 gutter）`)
        )
      }
    }
    if (property === 'border-radius') {
      const px = pxValue(value)
      if (px !== null && px !== 0 && px !== 4) {
        findings.push(
          violation(SPEC.radius, file, lineNumber, line.trim(),
            `圆角 ${px}px，规范常规容器 4px、贴边容器 0px`)
        )
      }
    }
    if (property === 'line-height') {
      const px = pxValue(value)
      if (px !== null && px !== 18 && px !== 22) {
        findings.push(
          violation(SPEC.lineHeight, file, lineNumber, line.trim(),
            `行高 ${px}px，规范正文 22px、表格数据区 18px`)
        )
      }
    }
    if (property === 'color') {
      const hex = cssHex(value)
      if (hex && DARK_TEXT_COLOR.test(hex) && !FUNCTIONAL_COLORS.test(hex)) {
        findings.push(
          violation(SPEC.textColor, file, lineNumber, line.trim(),
            `文字颜色硬编码 ${hex}，规范基础文字 #1A1A1A，用透明度区分层级`)
        )
      }
    }
    if ((property === 'justify-content' || property === 'text-align') && isActionButtonScope(selector)) {
      if (/^(left|center|flex-start|start)$/.test(value)) {
        findings.push(
          violation(SPEC.tableAction, file, lineNumber, line.trim(),
            `操作按钮区 ${property}: ${value}，规范右端对齐（justify-content: flex-end）`)
        )
      }
    }
    if (property === 'gutter' && value !== '12') {
      findings.push(
        violation(SPEC.formGutter, file, lineNumber, line.trim(),
          `gutter 为 ${value}，规范栅格间距 12px`)
      )
    }
  }
}

function scanTemplateLine(line, file, lineNumber, findings) {
  const elTable = /<el-table(?=\s|>)/
  if (elTable.test(line)) {
    findings.push(
      violation(SPEC.dxTable, file, lineNumber, line.trim(),
        '使用 Element UI 表格 <el-table>，规范使用新的 Dx 表格 <df-dx-table>（DevExtreme DataGrid，来源 df-web-bui）')
    )
  }
  const gutter = /:gutter="([0-9]+)"|gutter="([0-9]+)"/.exec(line)
  if (gutter) {
    const value = gutter[1] ?? gutter[2]
    if (value !== '12') {
      findings.push(
        violation(SPEC.formGutter, file, lineNumber, line.trim(),
          `栅格 gutter 为 ${value}，规范 12px`)
      )
    }
  }
  const labelPosition = /label-position="([a-z]+)"/.exec(line)
  if (labelPosition && labelPosition[1] !== 'right' && labelPosition[1] !== 'left') {
    findings.push(
      violation(SPEC.formLabel, file, lineNumber, line.trim(),
        `label-position="${labelPosition[1]}"，规范为标签右对齐+控件左对齐或标签左对齐+控件左对齐`)
    )
  }
  const modalWidth = /(?:width|:width)="('([^']+)'|[^"]*)"/.exec(line)
  if (modalWidth && /dialog|modal/.test(line.toLowerCase())) {
    const width = modalWidth[2] ?? modalWidth[1]
    if (width && width !== '90%') {
      findings.push(
        violation(SPEC.modalSize, file, lineNumber, line.trim(),
          `弹窗宽度 ${width}，大弹窗默认应为遮罩宽度的 90%`)
      )
    }
  }
}

async function scanText(file, text) {
  const findings = []
  const lines = text.split('\n')
  let selector = ''
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim() || line.trim().startsWith('//') || line.trim().startsWith('*')) {continue}
    const selectorMatch = /([^{}]+)\s*\{/.exec(line)
    if (selectorMatch) {selector = selectorMatch[1].trim()}
    scanCssLine(line, file, index + 1, selector, findings)
    if (file.endsWith('.vue') || file.endsWith('.html')) {scanTemplateLine(line, file, index + 1, findings)}
  }
  return findings
}

async function walkFiles(repo, changedOnly) {
  if (changedOnly) {
    return changedFiles(repo)
  }
  const files = []
  const visit = async (directory, base) => {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name)
      const relativePath = path.relative(base, fullPath)
      if (isIgnored(relativePath)) {continue}
      if (entry.isDirectory()) {await visit(fullPath, base)}
      else if (SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {files.push(relativePath)}
    }
  }
  await visit(repo, repo)
  return files
}

async function runGit(repo, args) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr?.on('data', (chunk) => (stderr += String(chunk)))
    child.on('error', (error) => resolve({ ok: false, stdout, stderr, error: error.message }))
    child.on('close', (code) => resolve({ ok: code === 0, stdout, stderr, error: null }))
  })
}

async function changedFiles(repo) {
  const tracked = await runGit(repo, ['diff', '--name-only', '--diff-filter=ACM', 'HEAD'])
  const untracked = await runGit(repo, ['ls-files', '--others', '--exclude-standard'])
  const files = `${tracked.stdout}\n${untracked.stdout}`
    .split('\n')
    .filter((name) => name && !isIgnored(name) && SCAN_EXTENSIONS.has(path.extname(name).toLowerCase()))
  return [...new Set(files)].sort()
}

function summary(report) {
  const byCategory = {}
  for (const item of report.violations) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1
  }
  report.violationsByCategory = byCategory
  return report
}

async function review(repo, options) {
  if (!existsSync(repo)) {throw new Error(`Repository does not exist: ${repo}`)}
  const files = await walkFiles(repo, options.changedOnly === true)
  const violations = []
  for (const relativePath of files) {
    const text = await readFile(path.join(repo, relativePath), 'utf8')
    violations.push(...(await scanText(relativePath, text)))
  }
  return summary({
    status: violations.length > 0 ? 'fail' : 'pass',
    spec: 'ui-spec-review',
    repo,
    scannedFiles: files.length,
    changedOnly: options.changedOnly === true,
    violations,
    generatedAt: new Date().toISOString()
  })
}

async function selftest() {
  const compliantCss = [
    ['.container { margin: 8px; padding: 8px; border-radius: 4px; }', '.container'],
    ['.page { background: #E9E9EC; }', '.page'],
    ['.table-actions { justify-content: flex-end; }', '.table-actions'],
    ['body { color: #1A1A1A; line-height: 22px; }', 'body']
  ]
  const compliantFindings = []
  compliantCss.forEach(([line, selector], index) =>
    scanCssLine(line, 'ok.css', index + 1, selector, compliantFindings)
  )
  if (compliantFindings.length !== 0)
    {throw new Error(`Compliant CSS flagged: ${JSON.stringify(compliantFindings)}`)}
  const violatingCss = [
    ['.container { margin: 10px; padding: 6px; border-radius: 8px; }', '.container'],
    ['.page { background: #FFFFFF; }', '.page'],
    ['.table-actions { justify-content: center; }', '.table-actions'],
    ['body { color: #333; line-height: 24px; }', 'body']
  ]
  const violatingFindings = []
  violatingCss.forEach(([line, selector], index) =>
    scanCssLine(line, 'bad.css', index + 1, selector, violatingFindings)
  )
  const expectedSpecIds = new Set([1, 2, 5, 9, 19, 21])
  const foundSpecIds = new Set(violatingFindings.map((item) => item.specId))
  for (const specId of expectedSpecIds) {
    if (!foundSpecIds.has(specId))
      {throw new Error(`selftest did not flag spec #${specId}: ${JSON.stringify(violatingFindings)}`)}
  }
  const templateFindings = []
  scanTemplateLine('<el-table :data="rows" />', 'bad.vue', 1, templateFindings)
  scanTemplateLine('<el-row :gutter="20">', 'bad.vue', 2, templateFindings)
  scanTemplateLine('<el-form label-position="top">', 'bad.vue', 3, templateFindings)
  scanTemplateLine('<el-dialog width="60%">', 'bad.vue', 4, templateFindings)
  const expectedTemplateSpecIds = new Set([11, 17, 18, 27])
  const foundTemplateSpecIds = new Set(templateFindings.map((item) => item.specId))
  for (const specId of expectedTemplateSpecIds) {
    if (!foundTemplateSpecIds.has(specId))
      {throw new Error(`selftest did not flag template spec #${specId}`)}
  }
  return {
    status: 'pass',
    spec: 'ui-spec-review',
    selftest: true,
    repo: tmpdir(),
    scannedFiles: compliantCss.length + violatingCss.length,
    violations: [],
    generatedAt: new Date().toISOString()
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const action = options._[0] ?? 'review'
  const report = action === 'selftest'
    ? await selftest()
    : await review(path.resolve(options.repo ?? process.cwd()), options)
  if (options.json) {console.log(JSON.stringify(report, null, 2))}
  else {
    if (report.status === 'pass') {console.log(`UI spec review passed (${report.scannedFiles} files scanned).`)}
    else {
      console.log(`UI spec review failed (${report.violations.length} violations across ${report.scannedFiles} files).`)
      for (const item of report.violations) {
        console.log(`  [规范 ${item.specId}/${item.category}] ${item.file}:${item.line} ${item.detail}`)
      }
    }
  }
  if (report.status !== 'pass') {process.exitCode = 1}
}

await main()
