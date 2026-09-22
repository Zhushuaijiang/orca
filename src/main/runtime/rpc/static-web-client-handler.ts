import { readFile } from 'node:fs/promises'
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http'
import { extname, isAbsolute, posix, relative, resolve } from 'node:path'

const STATIC_WEB_ALLOWED_PATHS = new Set(['/web-index.html'])
const STATIC_WEB_ALLOWED_PREFIXES = ['/assets/', '/cmaps/', '/standard_fonts/', '/wasm/']
const STATIC_WEB_CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2']
])

export function createStaticWebClientHandler(staticRoot: string): RequestListener {
  const resolvedRoot = resolve(staticRoot)
  return (request, response) => {
    void handleStaticRequest(resolvedRoot, request, response)
  }
}

async function handleStaticRequest(
  staticRoot: string,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD')
    writeHttpStatus(response, 405)
    return
  }

  const pathname = parseStaticPathname(request.url)
  if (!pathname) {
    writeHttpStatus(response, 400)
    return
  }
  if (!isAllowedStaticWebPath(pathname)) {
    writeHttpStatus(response, 404)
    return
  }

  const absolutePath = resolve(staticRoot, pathname.slice(1))
  const relativePath = relative(staticRoot, absolutePath)
  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    writeHttpStatus(response, 404)
    return
  }

  // Why readFile instead of createReadStream: Electron's asar vfs can stat a packed
  // web-index.html (HEAD 200 + Content-Length) then fail the GET stream. The old
  // handler flipped to 500 without clearing Content-Length, so browsers hung on an
  // empty body. The bundled web client is a small SPA; buffering it is asar-safe.
  let body: Buffer
  try {
    body = await readFile(absolutePath)
  } catch (error) {
    writeHttpStatus(response, statusForReadError(error))
    return
  }

  response.statusCode = 200
  response.setHeader(
    'Content-Type',
    STATIC_WEB_CONTENT_TYPES.get(extname(absolutePath)) ?? 'application/octet-stream'
  )
  response.setHeader('Content-Length', body.byteLength)
  response.setHeader(
    'Cache-Control',
    pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
  )
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  response.end(body)
}

function parseStaticPathname(rawUrl: string | undefined): string | null {
  if (!rawUrl) {
    return '/web-index.html'
  }
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://127.0.0.1').pathname)
  } catch {
    return null
  }
  if (pathname === '/' || pathname === '/index.html') {
    return '/web-index.html'
  }
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) {
    return null
  }
  if (posix.normalize(pathname) !== pathname) {
    return null
  }
  return mapProxyPrefixedStaticPathname(pathname)
}

function mapProxyPrefixedStaticPathname(pathname: string): string {
  if (pathname === '/web-index.html' || pathname.endsWith('/web-index.html')) {
    return '/web-index.html'
  }
  const prefixIndex = STATIC_WEB_ALLOWED_PREFIXES.reduce(
    (deepest, prefix) => Math.max(deepest, pathname.indexOf(prefix)),
    -1
  )
  if (prefixIndex !== -1) {
    // Why: reverse proxies may forward the external path prefix through to
    // Orca. Only the bundled /assets subtree is served after the prefix.
    return pathname.slice(prefixIndex)
  }
  return pathname
}

function isAllowedStaticWebPath(pathname: string): boolean {
  return (
    STATIC_WEB_ALLOWED_PATHS.has(pathname) ||
    STATIC_WEB_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  )
}

function statusForReadError(error: unknown): number {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR') {
    return 404
  }
  return 500
}

function writeHttpStatus(response: ServerResponse, statusCode: number): void {
  if (response.headersSent) {
    response.destroy()
    return
  }
  response.statusCode = statusCode
  response.removeHeader('Content-Length')
  response.removeHeader('Content-Type')
  response.removeHeader('Cache-Control')
  response.end()
}
