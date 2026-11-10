// `orca plugin test` runs these in plain Node against the transpiled sources,
// exactly as Orca's worker would load them. Fixtures are verbatim responses
// captured from a real Nextcloud 35 server.

import { test, assert } from 'orca/testing'
import { propfindRootXml } from './fixtures/propfind-root-fixture'
import { searchMarketJson } from './fixtures/search-market-fixture'
import {
  encodeDavPath,
  isTextPath,
  listDirectory,
  normalizeServerUrl,
  parsePropfindBody,
  parseSearchCursor,
  parseSearchPayload,
  searchFiles,
  writeFile,
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
  return new Response(body, {
    status: init.status ?? 200,
    headers: init.headers
  })
}

test('normalizeServerUrl adds scheme and strips trailing slashes', () => {
  assert.equal(normalizeServerUrl('192.168.1.10:18100/'), 'http://192.168.1.10:18100')
  assert.equal(normalizeServerUrl('https://nc.example.org///'), 'https://nc.example.org')
})

test('encodeDavPath encodes each segment but not the slashes', () => {
  assert.equal(
    encodeDavPath('/东昉协作/部署 手册.md'),
    '%E4%B8%9C%E6%98%89%E5%8D%8F%E4%BD%9C/%E9%83%A8%E7%BD%B2%20%E6%89%8B%E5%86%8C.md'
  )
  assert.equal(encodeDavPath('/'), '')
})

test('parsePropfindBody decodes entries and sorts folders first', () => {
  const entries = parsePropfindBody(propfindRootXml, 'ncadmin', '/')
  assert.equal(entries.length, 5)
  assert.deepEqual(
    entries.map((entry) => entry.name).sort(),
    ['README.md', '东昉协作', '市场支持', '部署手册.md', '架构图.png'].sort()
  )
  assert.deepEqual(entries.slice(0, 2).map((entry) => entry.dir), [true, true])
  assert.deepEqual(entries.slice(2).map((entry) => entry.dir), [false, false, false])
  // Pinyin order within the two Chinese file names is stable across ICU builds.
  assert.ok(entries.findIndex((e) => e.name === '部署手册.md') < entries.findIndex((e) => e.name === '架构图.png'))
  assert.equal(entries[0].fileId, '14290')
  const readme = entries.find((entry) => entry.name === 'README.md')
  assert.equal(readme?.dir, false)
  assert.equal(readme?.size, 512)
  assert.equal(readme?.etag, 'deadbeef01')
  assert.notEqual(readme?.modifiedMs, null)
})

test('listDirectory sends PROPFIND Depth 1 with basic auth and parses the body', async () => {
  const seen: { url?: string; init?: RequestInit } = {}
  const fetchLike: FetchLike = (url, init) => {
    seen.url = url
    seen.init = init
    return Promise.resolve(response(propfindRootXml, { headers: { 'Content-Type': 'application/xml' } }))
  }
  const entries = await listDirectory(fetchLike, connection, '/')
  assert.equal(seen.url, 'http://192.168.1.10:18100/remote.php/dav/files/ncadmin/')
  assert.equal(seen.init?.method, 'PROPFIND')
  const headers = (seen.init?.headers ?? {}) as Record<string, string>
  assert.equal(headers.Depth, '1')
  assert.match(headers.Authorization ?? '', /^Basic /)
  assert.equal(entries.length, 5)
})

test('listDirectory maps 401 to an invalid_params error', async () => {
  const fetchLike: FetchLike = () => Promise.resolve(response('', { status: 401 }))
  await assert.rejects(
    () => listDirectory(fetchLike, connection, '/'),
    (error: unknown) => (error as { code?: string }).code === 'invalid_params'
  )
})

test('parseSearchPayload maps entries and keeps entries without a path', () => {
  const entries = parseSearchPayload(JSON.parse(searchMarketJson))
  assert.equal(entries.length, 3)
  assert.equal(entries[0].name, '02_行业资料与市场参考')
  assert.equal(entries[0].dir, true)
  assert.equal(entries[1].path, '/东昉数智/部署手册.md')
  assert.equal(entries[2].path, '')
})

test('parseSearchCursor reads the rel=next link cursor', () => {
  assert.equal(
    parseSearchCursor(
      '<http://nc/ocs/v2.php/search/providers/files/search?term=x&cursor=41>; rel="next", <http://nc/?cursor=1>; rel="first"'
    ),
    '41'
  )
  assert.equal(parseSearchCursor(null), null)
  assert.equal(parseSearchCursor('<http://nc/?cursor=1>; rel="first"'), null)
})

test('searchFiles passes term and cursor and returns paged entries', async () => {
  let seenUrl = ''
  const fetchLike: FetchLike = (url) => {
    seenUrl = url
    return Promise.resolve(
      response(searchMarketJson, {
        headers: {
          'Content-Type': 'application/json',
          Link: '<http://192.168.1.10:18100/ocs/v2.php/search/providers/files/search?term=%E5%B8%82%E5%9C%BA&cursor=41>; rel="next"'
        }
      })
    )
  }
  const result = await searchFiles(fetchLike, connection, '市场', '13')
  assert.equal(
    seenUrl,
    'http://192.168.1.10:18100/ocs/v2.php/search/providers/files/search?term=%E5%B8%82%E5%9C%BA&cursor=13'
  )
  assert.equal(result.entries.length, 3)
  assert.equal(result.cursor, '41')
})

test('writeFile sends If-Match and maps 412 to a conflict error', async () => {
  const seen: { ifMatch?: string } = {}
  const okFetch: FetchLike = (_url, init) => {
    seen.ifMatch = (init.headers as Record<string, string>)?.['If-Match']
    return Promise.resolve(response('', { headers: { 'OC-ETag': '"new-etag"' } }))
  }
  const result = await writeFile(okFetch, connection, '/东昉协作/部署 手册.md', 'hello', 'old-etag')
  assert.equal(seen.ifMatch, '"old-etag"')
  assert.equal(result.etag, 'new-etag')

  const conflictFetch: FetchLike = () => Promise.resolve(response('', { status: 412 }))
  await assert.rejects(
    () => writeFile(conflictFetch, connection, '/a.md', 'hello', 'old-etag'),
    (error: unknown) => (error as { code?: string }).code === 'conflict'
  )
})

test('writeFile omits If-Match when creating without a base etag', async () => {
  const seen: { headers?: Record<string, string> }[] = []
  const fetchLike: FetchLike = (_url, init) => {
    seen.push(init.headers as Record<string, string>)
    return Promise.resolve(response(''))
  }
  await writeFile(fetchLike, connection, '/新文件.md', 'hello', null)
  assert.equal('If-Match' in (seen[0] ?? {}), false)
})

test('isTextPath matches common text and code extensions', () => {
  assert.equal(isTextPath('/docs/手册.md'), true)
  assert.equal(isTextPath('/src/main.ts'), true)
  assert.equal(isTextPath('/.gitignore'), true)
  assert.equal(isTextPath('/a/b/架构图.png'), false)
  assert.equal(isTextPath('/a/b/发布包.zip'), false)
})
