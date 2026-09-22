import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createStaticWebClientHandler } from './static-web-client-handler'

describe('static web client handler', () => {
  const servers: Server[] = []

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()))
          })
      )
    )
  })

  async function listen(staticRoot: string): Promise<string> {
    const server = createServer(createStaticWebClientHandler(staticRoot))
    servers.push(server)
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('expected a TCP listen address')
    }
    return `http://127.0.0.1:${address.port}`
  }

  function makeWebRoot(): string {
    const staticRoot = mkdtempSync(join(tmpdir(), 'static-web-client-'))
    mkdirSync(join(staticRoot, 'assets'))
    writeFileSync(join(staticRoot, 'web-index.html'), '<html>web</html>')
    writeFileSync(join(staticRoot, 'assets', 'app.js'), 'console.log("web")')
    return staticRoot
  }

  it('serves the web index and its assets with matching content-length', async () => {
    const origin = await listen(makeWebRoot())

    const indexResponse = await fetch(`${origin}/web-index.html`)
    expect(indexResponse.status).toBe(200)
    expect(indexResponse.headers.get('content-type')).toContain('text/html')
    expect(indexResponse.headers.get('cache-control')).toBe('no-cache')
    const indexBody = await indexResponse.text()
    expect(indexBody).toBe('<html>web</html>')
    expect(indexResponse.headers.get('content-length')).toBe(String(Buffer.byteLength(indexBody)))

    const assetResponse = await fetch(`${origin}/assets/app.js`)
    expect(assetResponse.status).toBe(200)
    expect(assetResponse.headers.get('cache-control')).toContain('immutable')
    const assetBody = await assetResponse.text()
    expect(assetBody).toBe('console.log("web")')
    expect(assetResponse.headers.get('content-length')).toBe(String(Buffer.byteLength(assetBody)))
  })

  it('maps / and /index.html to the web index', async () => {
    const origin = await listen(makeWebRoot())

    await expect((await fetch(`${origin}/`)).text()).resolves.toBe('<html>web</html>')
    await expect((await fetch(`${origin}/index.html`)).text()).resolves.toBe('<html>web</html>')
  })

  it('answers HEAD without a body', async () => {
    const origin = await listen(makeWebRoot())
    const response = await fetch(`${origin}/web-index.html`, { method: 'HEAD' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe(
      String(Buffer.byteLength('<html>web</html>'))
    )
    await expect(response.text()).resolves.toBe('')
  })

  it('returns 404 for missing files without hanging', async () => {
    const origin = await listen(makeWebRoot())
    const response = await fetch(`${origin}/assets/missing.js`, {
      signal: AbortSignal.timeout(2000)
    })
    expect(response.status).toBe(404)
    expect(response.headers.get('content-length')).toBeNull()
    await expect(response.text()).resolves.toBe('')
  })

  it('returns 500 without a leftover content-length when the web index cannot be read', async () => {
    if (process.platform === 'win32') {
      return
    }
    const staticRoot = makeWebRoot()
    const indexPath = join(staticRoot, 'web-index.html')
    chmodSync(indexPath, 0)
    try {
      try {
        readFileSync(indexPath)
        return
      } catch {
        // Owner cannot read the file, so GET must take the error path.
      }
      const origin = await listen(staticRoot)
      const response = await fetch(`${origin}/web-index.html`, {
        signal: AbortSignal.timeout(2000)
      })
      expect(response.status).toBe(500)
      expect(response.headers.get('content-length')).toBeNull()
      await expect(response.text()).resolves.toBe('')
    } finally {
      chmodSync(indexPath, 0o644)
    }
  })
})
