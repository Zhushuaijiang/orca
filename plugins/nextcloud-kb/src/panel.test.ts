// A reopened panel keeps its saved tree; only 刷新 asks the worker for the listing again.

import { assert, mockHost, mount, test, type TestPanel } from 'orca/testing'
import * as panel from './panel'
import type { KbEntry } from './protocol'

const connection = { serverUrl: 'http://192.168.1.10:18100', username: 'ncadmin' }

function file(name: string): KbEntry {
  return {
    name,
    path: `/${name}`,
    dir: false,
    size: 1024,
    modifiedMs: 1769304000000,
    etag: 'aa11bb22cc33',
    fileId: '14400'
  }
}

function serverListing(name: string) {
  return mockHost({
    requests: {
      'kb.status': { configured: true, ...connection, ok: true, error: null },
      'kb.list': { entries: [file(name)] }
    }
  })
}

// Asking this server anything would replace the tree with a connection error.
function unreachableServer() {
  return mockHost({
    requests: { 'kb.status': { configured: true, ...connection, ok: false, error: '连接失败' } }
  })
}

const savedTree = {
  plugin: {
    'kb.status-view': { phase: 'ready', ...connection },
    'kb.dir-entries': { '/': [file('旧文件.md')] }
  }
}

// The first label is the server row; the rest are the files listed under it.
function listedFiles(view: TestPanel): string[] {
  const tree = view.find({ type: 'Tree' })
  assert(tree, 'the file tree is not drawn')
  const labels = JSON.stringify(tree.props.items).matchAll(/"label":"([^"]*)"/g)
  return [...labels].slice(1).map((match) => match[1] ?? '')
}

test('reopening the panel keeps the saved tree and does not ask the server', async () => {
  const view = await mount(panel, { host: unreachableServer(), persisted: savedTree })
  await view.settled()
  assert.deepEqual(listedFiles(view), ['旧文件.md'])
  assert.equal(view.find({ type: 'Callout' }), null)
})

test('the refresh button lists the folder again', async () => {
  const view = await mount(panel, { host: serverListing('新文件.md'), persisted: savedTree })
  await view.press({ label: '刷新' })
  assert.deepEqual(listedFiles(view), ['新文件.md'])
})

test('a first open with nothing saved lists the root folder', async () => {
  const view = await mount(panel, { host: serverListing('新文件.md') })
  await view.settled()
  assert.deepEqual(listedFiles(view), ['新文件.md'])
})

test('打开 resolves the share link without a late gesture-gated host call', async () => {
  const url = 'http://192.168.1.10:18100/s/AbCdEf123456'
  const entry = file('部署手册.md')
  const host = mockHost({
    requests: {
      'kb.status': { configured: true, ...connection, ok: true, error: null },
      'kb.list': { entries: [entry] },
      'kb.share': { url, reused: true }
    }
  })
  const view = await mount(panel, {
    host,
    persisted: {
      plugin: {
        'kb.status-view': { phase: 'ready', ...connection },
        'kb.dir-entries': { '/': [entry] },
        'kb.selected': entry.path
      }
    }
  })
  await view.settled()
  const open = view.find({ type: 'Button', text: '打开' })
  assert(open, 'the 打开 button should be drawn')
  await view.press(open)
  await view.settled()
  // A share fetch is a network round trip; shell.openExternal after it loses the one-shot
  // press grant in the real host. The reliable path is a Link with a real href instead.
  assert.deepEqual(host.callsOf('shell.openExternal'), [])
  const link = view.find({ type: 'Link' })
  assert(link, '打开 should publish a Link carrying the public URL')
  assert.equal(link.props.href, url)
  assert.equal(view.find({ type: 'Callout' }), null)
})
