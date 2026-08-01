function basicAuth(user, token) {
  return `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`
}

function jobPath(job) {
  return job
    .split('/')
    .filter(Boolean)
    .map((part) => `job/${encodeURIComponent(part)}`)
    .join('/')
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options)
  if (!response.ok) {throw new Error(`HTTP ${response.status} ${response.statusText}`)}
  return response.json()
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function triggerAndWaitForJenkins(config, variables, options = {}) {
  const env = options.env ?? process.env
  const baseUrl = String(
    config.baseUrl ?? env[config.baseUrlEnv ?? 'HIS_JENKINS_URL'] ?? ''
  ).replace(/\/$/, '')
  const user = config.user ?? env[config.userEnv ?? 'HIS_JENKINS_USER'] ?? ''
  const token = config.token ?? env[config.tokenEnv ?? 'HIS_JENKINS_TOKEN'] ?? ''
  if (!baseUrl || !user || !token || !config.job) {
    throw new Error('Jenkins requires base URL, job, user, and token environment variables.')
  }
  const headers = { authorization: basicAuth(user, token) }
  let crumbHeaders = {}
  try {
    const crumb = await jsonFetch(`${baseUrl}/crumbIssuer/api/json`, { headers })
    crumbHeaders = { [crumb.crumbRequestField]: crumb.crumb }
  } catch {
    crumbHeaders = {}
  }
  const parameters = new URLSearchParams()
  for (const [key, template] of Object.entries(config.parameters ?? {})) {
    parameters.set(
      key,
      String(template).replace(/\$\{([^}]+)\}/g, (_, name) => String(variables[name] ?? ''))
    )
  }
  const endpoint = parameters.size > 0 ? 'buildWithParameters' : 'build'
  const response = await fetch(`${baseUrl}/${jobPath(config.job)}/${endpoint}?${parameters}`, {
    method: 'POST',
    headers: { ...headers, ...crumbHeaders }
  })
  if (!response.ok) {throw new Error(`Jenkins trigger failed: HTTP ${response.status}`)}
  const queueUrl = response.headers.get('location')
  if (!queueUrl) {throw new Error('Jenkins did not return a queue location.')}
  const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000
  const pollMs = options.pollMs ?? 5000
  const deadline = Date.now() + timeoutMs
  let buildUrl = ''
  while (Date.now() < deadline) {
    const queue = await jsonFetch(`${queueUrl.replace(/\/$/, '')}/api/json`, { headers })
    if (queue.cancelled) {throw new Error('Jenkins queue item was cancelled.')}
    if (queue.executable?.url) {
      buildUrl = queue.executable.url
      break
    }
    await wait(pollMs)
  }
  if (!buildUrl) {throw new Error('Timed out waiting for Jenkins queue.')}
  while (Date.now() < deadline) {
    const build = await jsonFetch(`${buildUrl.replace(/\/$/, '')}/api/json`, { headers })
    if (!build.building) {
      if (build.result !== 'SUCCESS')
        {throw new Error(`Jenkins build ${build.number} ended ${build.result}.`)}
      return { number: build.number, result: build.result, url: build.url ?? buildUrl }
    }
    await wait(pollMs)
  }
  throw new Error('Timed out waiting for Jenkins build.')
}
