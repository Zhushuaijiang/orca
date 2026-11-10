// P2 client surface: share / mkdir / delete / move / range / upload.

import { test, assert } from 'orca/testing'
import { searchMarketJson } from './fixtures/search-market-fixture'
import {
  createDirectory,
  createShareLink,
  deleteEntry,
  moveEntry,
  parseSearchCursor,
  parseSearchPayload,
  readRange,
  searchFiles,
  uploadBytes,
  type FetchLike,
  type NextcloudConnection
} from './nextcloud'

const connection: NextcloudConnection = {
  serverUrl: 'http://192.168.1.10:18100',
  username: 'ncadmin',
  appPassword: 'test-token'
}

function response(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const status = init.status ?? 200
  if (status === 204 || status === 304) {
    return new Response(null, { status, headers: init.headers })
  }
  return new Response(body, { status, headers: init.headers })
}

test('createShareLink posts shareType 3 and returns the OCS url', async () => {
  const seen: { url?: string; body?: string } = {}
  const fetchLike: FetchLike = (url, init) => {
    seen.url = url
    seen.body = String(init.body)
    return Promise.resolve(
      response(
        JSON.stringify({ ocs: { meta: { status: 'ok' }, data: { url: 'http://nc/s/ySm4Tk', token: 'ySm4Tk' } } }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    )
  }
  const result = await createShareLink(fetchLike, connection, '/东昉协作/部署手册.md')
  assert.equal(seen.url, 'http://192.168.1.10:18100/ocs/v2.php/apps/files_sharing/api/v1/shares')
  assert.match(seen.body ?? '', /path=%2F%E4%B8%9C%E6%98%89%E5%8D%8F%E4%BD%9C%2F%E9%83%A8%E7%BD%B2%E6%89%8B%E5%86%8C\.md/)
  assert.match(seen.body ?? '', /shareType=3/)
  assert.equal(result.url, 'http://nc/s/ySm4Tk')
})

test('createDirectory MKCOLs and maps 405 to conflict', async () => {
  let method = ''
  const okFetch: FetchLike = (_url, init) => {
    method = init.method ?? ''
    return Promise.resolve(response(''))
  }
  await createDirectory(okFetch, connection, '/新目录')
  assert.equal(method, 'MKCOL')
  const existsFetch: FetchLike = () => Promise.resolve(response('', { status: 405 }))
  await assert.rejects(
    () => createDirectory(existsFetch, connection, '/新目录'),
    (error: unknown) => (error as { code?: string }).code === 'conflict'
  )
})

test('deleteEntry DELETEs and maps 423 to conflict', async () => {
  let method = ''
  const okFetch: FetchLike = (_url, init) => {
    method = init.method ?? ''
    return Promise.resolve(response('', { status: 204 }))
  }
  await deleteEntry(okFetch, connection, '/旧目录')
  assert.equal(method, 'DELETE')
  const lockedFetch: FetchLike = () => Promise.resolve(response('', { status: 423 }))
  await assert.rejects(
    () => deleteEntry(lockedFetch, connection, '/旧目录'),
    (error: unknown) => (error as { code?: string }).code === 'conflict'
  )
})

test('moveEntry sends a Destination header and maps 412 to conflict', async () => {
  const seen: { destination?: string; method?: string } = {}
  const okFetch: FetchLike = (_url, init) => {
    seen.method = init.method ?? ''
    seen.destination = (init.headers as Record<string, string>)?.Destination
    return Promise.resolve(response('', { status: 201 }))
  }
  await moveEntry(okFetch, connection, '/a/旧名.md', '/b/新名.md')
  assert.equal(seen.method, 'MOVE')
  assert.equal(seen.destination, 'http://192.168.1.10:18100/remote.php/dav/files/ncadmin/b/%E6%96%B0%E5%90%8D.md')
  const conflictFetch: FetchLike = () => Promise.resolve(response('', { status: 412 }))
  await assert.rejects(
    () => moveEntry(conflictFetch, connection, '/a.md', '/b.md'),
    (error: unknown) => (error as { code?: string }).code === 'conflict'
  )
})

test('readRange sends a Range header and reports total and done', async () => {
  const seen: { range?: string } = {}
  const fetchLike: FetchLike = (_url, init) => {
    seen.range = (init.headers as Record<string, string>)?.Range
    const body = '0123456789'
    return Promise.resolve(
      response(body.slice(0, 4), {
        status: 206,
        headers: { 'Content-Range': 'bytes 0-3/10', 'Content-Type': 'text/plain' }
      })
    )
  }
  const chunk = await readRange(fetchLike, connection, '/a.md', 0, 4)
  assert.equal(seen.range, 'bytes=0-3')
  assert.equal(chunk.base64, btoa('0123'))
  assert.equal(chunk.total, 10)
  assert.equal(chunk.done, false)

  const endFetch: FetchLike = () => Promise.resolve(response('', { status: 416 }))
  const tail = await readRange(endFetch, connection, '/a.md', 9999, 4)
  assert.equal(tail.done, true)
  assert.equal(tail.base64, '')
})

test('uploadBytes PUTs the bytes with a content type', async () => {
  const seen: { method?: string; type?: string; url?: string } = {}
  const fetchLike: FetchLike = (url, init) => {
    seen.url = url
    seen.method = init.method ?? ''
    seen.type = (init.headers as Record<string, string>)?.['Content-Type']
    return Promise.resolve(response('', { status: 201, headers: { 'OC-ETag': '"up-etag"' } }))
  }
  const bytes = Uint8Array.from('PDFDATA', (char) => char.charCodeAt(0))
  const result = await uploadBytes(fetchLike, connection, '/上传/报告.pdf', bytes, 'application/pdf')
  assert.equal(seen.method, 'PUT')
  assert.equal(seen.type, 'application/pdf')
  assert.match(seen.url ?? '', new RegExp('%E4%B8%8A%E4%BC%A0/%E6%8A%A5%E5%91%8A\\.pdf$'))
  assert.equal(result.etag, 'up-etag')
})

test('search fixtures keep cursor parsing stable (regression guard)', () => {
  const entries = parseSearchPayload(JSON.parse(searchMarketJson))
  assert.equal(entries.length, 3)
  assert.equal(parseSearchCursor('<http://nc?cursor=7>; rel="next"'), '7')
})
