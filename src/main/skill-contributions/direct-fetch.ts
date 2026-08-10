// Why: Node's global fetch inherits http_proxy/HTTP_PROXY env vars, routing
// intranet requests (192.168.x.x) through the proxy and timing out.  This
// helper runs fetch with proxy env stripped so LAN traffic goes direct.

const PROXY_ENV_KEYS = ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY']

/** Run an async fn with proxy env vars temporarily removed. */
export async function withoutProxyEnv<T>(fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {}
  for (const key of PROXY_ENV_KEYS) {
    if (process.env[key]) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  }
  try {
    return await fn()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value !== undefined) {
        process.env[key] = value
      }
    }
  }
}
