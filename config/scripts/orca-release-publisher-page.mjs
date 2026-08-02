import { pageCss } from './orca-release-publisher-page-css.mjs'

export function pageHtml() {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Orca Release Publisher</title>
  <style>${pageCss()}</style>
</head>
<body>
<main>
  <header class="page">
    <div class="mark">O</div>
    <div>
      <h1>Orca Release Publisher</h1>
      <p>本地升版、构建、打包、发布工具 · DFHIS 桌面端</p>
    </div>
  </header>

  <section class="card">
    <h2>配置</h2>
    <div class="grid">
      <label class="field">Repo root <input id="repoRoot" /></label>
      <label class="field">SSH password <input id="sshPassword" type="password" placeholder="留空则使用 .dfhis-auto-release.env 或 SSH key" /></label>
      <label class="field" style="grid-column: 1 / -1;">Release notes <textarea id="notes">Release Orca desktop build.</textarea></label>
    </div>
  </section>

  <section class="card">
    <div class="actions">
      <button id="releaseAll" class="primary">一键全流程发布</button>
      <button id="refresh">刷新状态</button>
      <button id="prepare">准备下一版</button>
      <button id="buildMac">构建 macOS app</button>
      <button id="triggerWin">触发 Windows CI</button>
      <button id="publish">发布到服务器</button>
      <span id="busy"></span>
    </div>
  </section>

  <section class="card" id="autoReleaseSection" style="display:none">
    <h2>自动发布流水线</h2>
    <div id="autoReleaseSummary" class="actions" style="margin-bottom:10px"></div>
    <div class="steps" id="autoReleaseSteps"></div>
    <pre id="autoReleaseLog"></pre>
  </section>

  <section class="card">
    <h2>状态</h2>
    <div id="summary" class="stats"></div>
    <div id="warnings"></div>
  </section>

  <section class="card">
    <h2>构建产物</h2>
    <div class="grid">
      <div>
        <h3 class="field" style="margin:0 0 8px">macOS</h3>
        <div id="macCandidates"></div>
      </div>
      <div>
        <h3 class="field" style="margin:0 0 8px">Windows</h3>
        <div id="windowsCandidates"></div>
      </div>
    </div>
  </section>

  <section class="card">
    <h2>输出</h2>
    <pre id="output">Ready.</pre>
  </section>
</main>
<script>
let status = null
const el = (id) => document.getElementById(id)
const setBusy = (text) => { el('busy').textContent = text; for (const id of ['refresh','prepare','buildMac','triggerWin','publish','releaseAll']) el(id).disabled = Boolean(text) }
const post = async (url, body) => {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = await response.json()
  if (!response.ok || json.error) throw new Error(json.error || response.statusText)
  return json
}
const fmt = (size) => size ? ((size / 1024 / 1024).toFixed(size > 100 * 1024 * 1024 ? 0 : 1) + ' MB') : ''
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
const artifactHtml = (a) =>
  '<div class="artifact"><span class="pill ' + esc(a.status) + '">' + esc(a.status) + '</span>' +
  '<span class="meta">' + esc(a.version || '') + ' ' + fmt(a.size) + '</span><code>' + esc(a.path) + '</code></div>'
const statHtml = (label, value) =>
  '<div class="stat"><div class="label">' + label + '</div><div class="value" title="' + esc(value) + '">' + esc(value) + '</div></div>'

const STEP_FLOW = [
  { name: '升版推送', match: ['prepare', 'windows-ci-trigger'] },
  { name: 'Windows CI', match: ['windows-ci-wait'] },
  { name: '下载安装包', match: ['windows-artifact-download'] },
  { name: 'macOS 构建', match: ['macos-build'] },
  { name: '发布', match: ['publish'] }
]
function stepsHtml(auto) {
  if (!auto || !auto.step) return ''
  const activeIndex = STEP_FLOW.findIndex((step) => step.match.includes(auto.step))
  return STEP_FLOW.map((step, index) => {
    let cls = ''
    let mark = String(index + 1)
    if (auto.state === 'published' || index < activeIndex) { cls = 'done'; mark = '✓' }
    else if (auto.state === 'failed' && index === activeIndex) { cls = 'error'; mark = '✕' }
    else if (auto.state === 'running' && index === activeIndex) { cls = 'active' }
    return '<div class="step ' + cls + '"><div class="dot">' + mark + '</div><div class="name">' + step.name + '</div></div>'
  }).join('')
}
let autoPollTimer = null
function renderAutoRelease(auto) {
  const section = el('autoReleaseSection')
  if (!auto) { section.style.display = 'none'; return }
  section.style.display = ''
  const pills = []
  if (auto.state) pills.push('<span class="pill ' + esc(auto.state) + '">' + esc(auto.state) + '</span>')
  if (auto.step && auto.state === 'running') pills.push('<span class="pill">' + esc(auto.step) + '</span>')
  if (auto.version) pills.push('<span class="pill">' + esc(auto.version) + '</span>')
  if (auto.windowsRunId) pills.push('<span class="pill">CI #' + esc(auto.windowsRunId) + '</span>')
  if (auto.reason) pills.push('<span class="pill">' + esc(auto.reason) + '</span>')
  if (auto.error) pills.push('<span class="pill failed">' + esc(auto.error) + '</span>')
  if (auto.updatedAt) pills.push('<span class="muted" style="font-size:11.5px">' + esc(auto.updatedAt.replace('T', ' ').slice(0, 19)) + '</span>')
  el('autoReleaseSummary').innerHTML = pills.join('')
  el('autoReleaseSteps').innerHTML = stepsHtml(auto)
  el('autoReleaseLog').textContent = auto.logTail || ''
  if (auto.state === 'running' && !autoPollTimer) {
    autoPollTimer = setInterval(() => { if (!el('busy').textContent) refresh() }, 30000)
  } else if (auto.state !== 'running' && autoPollTimer) {
    clearInterval(autoPollTimer)
    autoPollTimer = null
  }
}
async function refresh() {
  setBusy('刷新中...')
  try {
    const repo = encodeURIComponent(el('repoRoot').value)
    const password = encodeURIComponent(el('sshPassword').value)
    status = await (await fetch('/api/status?repoRoot=' + repo + '&sshPassword=' + password)).json()
    if (status.error) throw new Error(status.error)
    el('repoRoot').value = status.repoRoot
    el('summary').innerHTML =
      statHtml('Version', status.version) +
      statHtml('Branch', (status.branch || 'detached') + ' · ' + status.headSha.slice(0, 8)) +
      statHtml('Working tree', status.isDirty ? 'Dirty' : 'Clean') +
      statHtml('Server latest', status.remoteLatest?.version || '不可用')
    el('warnings').innerHTML = status.warnings.map((w) => '<p class="warn">' + esc(w) + '</p>').join('')
    el('macCandidates').innerHTML = status.macCandidates.map(artifactHtml).join('')
    el('windowsCandidates').innerHTML = status.windowsCandidates.map(artifactHtml).join('')
    renderAutoRelease(status.autoRelease)
  } catch (error) {
    el('output').textContent = error.message
  } finally {
    setBusy('')
  }
}
el('refresh').onclick = refresh
el('prepare').onclick = async () => {
  setBusy('准备下一版...')
  try {
    const result = await post('/api/prepare-release', {
      repoRoot: el('repoRoot').value,
      sshPassword: el('sshPassword').value
    })
    status = result.status
    el('output').textContent = result.output
    await refresh()
  } catch (error) { el('output').textContent = error.message } finally { setBusy('') }
}
el('buildMac').onclick = async () => {
  setBusy('自动升版并构建 macOS 中...')
  try {
    const result = await post('/api/build-macos', { repoRoot: el('repoRoot').value })
    status = result.status
    el('output').textContent = result.output
    await refresh()
  } catch (error) { el('output').textContent = error.message } finally { setBusy('') }
}
el('triggerWin').onclick = async () => {
  setBusy('自动升版、提交推送并触发 Windows CI...')
  try {
    const result = await post('/api/trigger-windows-ci', {
      repoRoot: el('repoRoot').value,
      sshPassword: el('sshPassword').value
    })
    el('output').textContent = 'Triggered Windows CI on ' + result.branch + '\n' + result.output
  } catch (error) { el('output').textContent = error.message } finally { setBusy('') }
}
el('publish').onclick = async () => {
  if (!status?.selectedMacAppPath || !status?.selectedWindowsExePath) {
    el('output').textContent = '缺少 ready macOS app 或 Windows installer。'
    return
  }
  setBusy('发布中...')
  try {
    const result = await post('/api/publish', {
      repoRoot: el('repoRoot').value,
      macAppPath: status.selectedMacAppPath,
      windowsExePath: status.selectedWindowsExePath,
      sshPassword: el('sshPassword').value,
      notes: el('notes').value,
      cleanOldReleases: true,
      cleanLocalOldReleases: true
    })
    status = result.status
    el('output').textContent = result.output + '\nmacOS: ' + result.macosUrl + '\nWindows: ' + result.windowsUrl
    await refresh()
  } catch (error) { el('output').textContent = error.message } finally { setBusy('') }
}
el('releaseAll').onclick = async () => {
  setBusy('启动全流程自动发布...')
  try {
    const result = await post('/api/release-all', {
      repoRoot: el('repoRoot').value,
      sshPassword: el('sshPassword').value
    })
    el('output').textContent = '自动发布流水线已启动 (pid ' + result.pid + ')，进度见"自动发布流水线"面板。'
    await refresh()
  } catch (error) { el('output').textContent = error.message } finally { setBusy('') }
}
refresh()
</script>
</body>
</html>`
}
