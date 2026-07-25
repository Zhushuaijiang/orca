export function pageHtml() {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Orca Release Publisher</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 56px; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    p { margin: 0; color: color-mix(in srgb, CanvasText 68%, Canvas); }
    section { margin-top: 18px; border: 1px solid color-mix(in srgb, CanvasText 18%, Canvas); border-radius: 10px; padding: 16px; }
    .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    label { display: grid; gap: 6px; font-size: 12px; font-weight: 600; }
    input, textarea { box-sizing: border-box; width: 100%; border: 1px solid color-mix(in srgb, CanvasText 20%, Canvas); border-radius: 8px; padding: 9px 10px; background: Canvas; color: CanvasText; font: inherit; }
    textarea { min-height: 72px; resize: vertical; }
    button { border: 1px solid color-mix(in srgb, CanvasText 20%, Canvas); border-radius: 8px; padding: 9px 12px; background: Canvas; color: CanvasText; font: inherit; cursor: pointer; }
    button.primary { background: CanvasText; color: Canvas; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    pre { white-space: pre-wrap; word-break: break-word; max-height: 340px; overflow: auto; border-radius: 8px; padding: 12px; background: color-mix(in srgb, CanvasText 7%, Canvas); }
    .muted { color: color-mix(in srgb, CanvasText 62%, Canvas); }
    .pill { display: inline-flex; border: 1px solid color-mix(in srgb, CanvasText 18%, Canvas); border-radius: 999px; padding: 2px 8px; font-size: 12px; }
    .artifact { border-top: 1px solid color-mix(in srgb, CanvasText 12%, Canvas); padding: 10px 0; }
    .artifact:first-child { border-top: 0; padding-top: 0; }
    .warn { color: #b45309; }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<main>
  <h1>Orca Release Publisher</h1>
  <p>独立的本地构建、打包、发布工具。不属于 Orca app 设置页。</p>

  <section class="grid">
    <label>Repo root <input id="repoRoot" /></label>
    <label>SSH password <input id="sshPassword" type="password" placeholder="留空则使用 SSH key" /></label>
    <label class="grid" style="grid-column: 1 / -1;">Release notes <textarea id="notes">Release Orca desktop build.</textarea></label>
  </section>

  <section>
    <div class="row">
      <button id="refresh">刷新状态</button>
      <button id="buildMac">构建 macOS app</button>
      <button id="triggerWin">触发 Windows CI</button>
      <button id="publish" class="primary">发布到服务器</button>
      <span id="busy" class="muted"></span>
    </div>
  </section>

  <section>
    <div id="summary" class="grid"></div>
    <div id="warnings"></div>
  </section>

  <section class="grid">
    <div>
      <h3>macOS candidates</h3>
      <div id="macCandidates"></div>
    </div>
    <div>
      <h3>Windows candidates</h3>
      <div id="windowsCandidates"></div>
    </div>
  </section>

  <section>
    <h3>Output</h3>
    <pre id="output">Ready.</pre>
  </section>
</main>
<script>
let status = null
const el = (id) => document.getElementById(id)
const setBusy = (text) => { el('busy').textContent = text; for (const id of ['refresh','buildMac','triggerWin','publish']) el(id).disabled = Boolean(text) }
const post = async (url, body) => {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = await response.json()
  if (!response.ok || json.error) throw new Error(json.error || response.statusText)
  return json
}
const fmt = (size) => size ? ((size / 1024 / 1024).toFixed(size > 100 * 1024 * 1024 ? 0 : 1) + ' MB') : ''
const artifactHtml = (a) => '<div class="artifact"><span class="pill">' + a.status + '</span> <span class="muted">' + (a.version || '') + ' ' + fmt(a.size) + '</span><br><code>' + a.path + '</code></div>'
async function refresh() {
  setBusy('刷新中...')
  try {
    const repo = encodeURIComponent(el('repoRoot').value)
    const password = encodeURIComponent(el('sshPassword').value)
    status = await (await fetch('/api/status?repoRoot=' + repo + '&sshPassword=' + password)).json()
    if (status.error) throw new Error(status.error)
    el('repoRoot').value = status.repoRoot
    el('summary').innerHTML =
      '<div><b>Version</b><br><span class="muted">' + status.version + '</span></div>' +
      '<div><b>Branch</b><br><span class="muted">' + (status.branch || 'detached') + ' · ' + status.headSha.slice(0, 10) + '</span></div>' +
      '<div><b>Working tree</b><br><span class="muted">' + (status.isDirty ? 'Dirty' : 'Clean') + '</span></div>' +
      '<div><b>Server latest</b><br><span class="muted">' + (status.remoteLatest?.version || 'Unavailable') + '</span></div>'
    el('warnings').innerHTML = status.warnings.map((w) => '<p class="warn">' + w + '</p>').join('')
    el('macCandidates').innerHTML = status.macCandidates.map(artifactHtml).join('')
    el('windowsCandidates').innerHTML = status.windowsCandidates.map(artifactHtml).join('')
  } catch (error) {
    el('output').textContent = error.message
  } finally {
    setBusy('')
  }
}
el('refresh').onclick = refresh
el('buildMac').onclick = async () => {
  setBusy('构建 macOS 中...')
  try {
    const result = await post('/api/build-macos', { repoRoot: el('repoRoot').value })
    status = result.status
    el('output').textContent = result.output
    await refresh()
  } catch (error) { el('output').textContent = error.message } finally { setBusy('') }
}
el('triggerWin').onclick = async () => {
  setBusy('触发 Windows CI...')
  try {
    const result = await post('/api/trigger-windows-ci', { repoRoot: el('repoRoot').value })
    el('output').textContent = 'Triggered Windows CI on ' + result.branch + '\\n' + result.output
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
    el('output').textContent = result.output + '\\nmacOS: ' + result.macosUrl + '\\nWindows: ' + result.windowsUrl
    await refresh()
  } catch (error) { el('output').textContent = error.message } finally { setBusy('') }
}
refresh()
</script>
</body>
</html>`
}
