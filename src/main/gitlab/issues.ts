/* eslint-disable max-lines -- Why: parallel to src/main/github/issues.ts —
co-locating issue list/create/update/comment operations keeps the shared
acquire/release + error-classification pattern obvious. Each function is
short; the file is long because the surface is broad. */
import type {
  ClassifiedError,
  GitLabAssignableUser,
  GitLabCommentResult,
  GitLabIssueInfo,
  GitLabIssueUpdate,
  IssueSourcePreference,
  MRComment
} from '../../shared/types'
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mapGitLabIssueInfo } from './mappers'
// prettier-ignore
import { glabExecFileAsync, acquire, release, getIssueProjectRef, resolveIssueSource, classifyGlabError, classifyListIssuesError, getGlabKnownHosts, glabRepoExecOptions, glabHostnameArgs, type LocalGitExecOptions, type ProjectRef } from './gl-utils'

// Why: parallel to GitHub's IssueListResult — distinguishes a successful-
// empty listing from a failed fetch.
export type IssueListResult = {
  items: GitLabIssueInfo[]
  error?: ClassifiedError
}

// Why: GitLab REST API addresses projects by URL-encoded path. Centralize
// the encoding so a future call site can't forget it (the slash escapes
// are easy to miss).
function encodedProject(projectPath: string): string {
  return encodeURIComponent(projectPath)
}

const MARKDOWN_DATA_IMAGE_PATTERN =
  /!\[([^\]]*)\]\((data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=\s]+))\)/gi

function gitLabUploadImageExtension(mimeSubtype: string): string {
  return mimeSubtype.toLowerCase() === 'jpeg' ? 'jpg' : mimeSubtype.toLowerCase()
}

function sanitizeGitLabUploadFileName(alt: string, extension: string, index: number): string {
  const base = alt
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${base || `image-${index}`}.${extension}`
}

function parseGitLabRestApiEndpoint(authStatusOutput: string, host: string): string {
  const match = authStatusOutput.match(/REST API Endpoint:\s*(\S+)/i)
  if (match?.[1]) {
    return match[1]
  }
  const protocol = host === 'gitlab.com' ? 'https' : 'http'
  return `${protocol}://${host}/api/v4/`
}

function execErrorOutput(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error)
  }
  const execLike = error as { stdout?: unknown; stderr?: unknown; message?: unknown }
  return (
    [execLike.stdout, execLike.stderr, execLike.message]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join('\n') || String(error)
  )
}

async function getGlabAuthStatusOutput(args: {
  repoPath: string
  projectRef: ProjectRef
  connectionId?: string | null
  localGitOptions: LocalGitExecOptions
}): Promise<string> {
  try {
    const statusResult = await glabExecFileAsync(
      ['auth', 'status', '--hostname', args.projectRef.host],
      glabRepoExecOptions(args.repoPath, args.connectionId, args.localGitOptions)
    )
    return `${statusResult.stdout}\n${statusResult.stderr}`
  } catch (error) {
    const output = execErrorOutput(error)
    // Why: glab exits non-zero for a bad alias token but still prints the usable REST endpoint.
    if (/REST API Endpoint:/i.test(output)) {
      return output
    }
    throw error
  }
}

function gitLabTokenHostCandidates(restApiEndpoint: string, projectHost: string): string[] {
  const hosts = new Set<string>()
  try {
    hosts.add(new URL(restApiEndpoint).host)
  } catch {
    // Ignore malformed endpoints; the project host remains a usable fallback candidate.
  }
  hosts.add(projectHost)
  return [...hosts].filter((host) => host.trim().length > 0)
}

async function getGitLabUploadFallbackToken(args: {
  repoPath: string
  projectRef: ProjectRef
  restApiEndpoint: string
  connectionId?: string | null
  localGitOptions: LocalGitExecOptions
}): Promise<string> {
  const hosts = gitLabTokenHostCandidates(args.restApiEndpoint, args.projectRef.host)
  const errors: string[] = []
  for (const host of hosts) {
    try {
      const tokenResult = await glabExecFileAsync(
        ['config', 'get', 'token', '--host', host],
        glabRepoExecOptions(args.repoPath, args.connectionId, args.localGitOptions)
      )
      const token = tokenResult.stdout.trim()
      if (token) {
        return token
      }
    } catch (error) {
      errors.push(`${host}: ${execErrorOutput(error)}`)
    }
  }
  const detail = errors.length > 0 ? ` (${errors.join('; ')})` : ''
  throw new Error(`GitLab token not found for image upload fallback${detail}`)
}

function gitLabMultipartUploadBody(args: {
  boundary: string
  fieldName: string
  fileName: string
  contentType: string
  imageBytes: Buffer
}): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${args.boundary}\r\n` +
        `Content-Disposition: form-data; name="${args.fieldName}"; filename="${args.fileName}"\r\n` +
        `Content-Type: ${args.contentType}\r\n\r\n`
    ),
    args.imageBytes,
    Buffer.from(`\r\n--${args.boundary}--\r\n`)
  ])
}

async function uploadGitLabIssueBodyImageWithNodeMultipart(args: {
  repoPath: string
  projectRef: ProjectRef
  connectionId?: string | null
  localGitOptions: LocalGitExecOptions
  alt: string
  fileName: string
  contentType: string
  imageBytes: Buffer
}): Promise<string> {
  const authStatusOutput = await getGlabAuthStatusOutput(args)
  const restApiEndpoint = parseGitLabRestApiEndpoint(
    authStatusOutput,
    args.projectRef.host
  )
  const token = await getGitLabUploadFallbackToken({ ...args, restApiEndpoint })

  const boundary = `----orca-gitlab-upload-${randomUUID()}`
  const body = gitLabMultipartUploadBody({
    boundary,
    fieldName: 'file',
    fileName: args.fileName,
    contentType: args.contentType,
    imageBytes: args.imageBytes
  })
  const uploadUrl = new URL(`projects/${encodedProject(args.projectRef.path)}/uploads`, restApiEndpoint)
  const requestBody = new Uint8Array(body).buffer
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.byteLength),
      'PRIVATE-TOKEN': token
    },
    body: requestBody
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`)
  }
  const data = JSON.parse(text) as { markdown?: string; url?: string }
  if (typeof data.markdown === 'string' && data.markdown.trim()) {
    return data.markdown
  }
  if (typeof data.url === 'string' && data.url.trim()) {
    return `![${args.alt}](${data.url})`
  }
  throw new Error('Unexpected response from GitLab upload')
}

async function uploadGitLabIssueBodyImage(args: {
  repoPath: string
  projectRef: ProjectRef
  connectionId?: string | null
  localGitOptions: LocalGitExecOptions
  alt: string
  extension: string
  index: number
  base64Content: string
}): Promise<string> {
  const tempDirName = `orca-gitlab-upload-${randomUUID()}`
  const fileName = sanitizeGitLabUploadFileName(args.alt, args.extension, args.index)
  const tempDirPath = join(tmpdir(), tempDirName)
  const filePath = join(tempDirPath, fileName)

  try {
    const imageBytes = Buffer.from(args.base64Content.replace(/\s/g, ''), 'base64')
    await mkdir(tempDirPath)
    await writeFile(filePath, imageBytes)

    await acquire()
    try {
      const { stdout } = await glabExecFileAsync(
        [
          'api',
          ...glabHostnameArgs(args.projectRef, args.connectionId),
          '-X',
          'POST',
          `projects/${encodedProject(args.projectRef.path)}/uploads`,
          '--form',
          `file=@${filePath}`
        ],
        glabRepoExecOptions(args.repoPath, args.connectionId, args.localGitOptions)
      )
      const data = JSON.parse(stdout) as { markdown?: string; url?: string }
      if (typeof data.markdown === 'string' && data.markdown.trim()) {
        return data.markdown
      }
      if (typeof data.url === 'string' && data.url.trim()) {
        return `![${args.alt}](${data.url})`
      }
      throw new Error('Unexpected response from GitLab upload')
    } catch (error) {
      try {
        return await uploadGitLabIssueBodyImageWithNodeMultipart({
          repoPath: args.repoPath,
          projectRef: args.projectRef,
          connectionId: args.connectionId,
          localGitOptions: args.localGitOptions,
          alt: args.alt,
          fileName,
          contentType: `image/${args.extension === 'jpg' ? 'jpeg' : args.extension}`,
          imageBytes
        })
      } catch (fallbackError) {
        const original = error instanceof Error ? error.message : String(error)
        const fallback =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        throw new Error(`${original}; fallback upload failed: ${fallback}`)
      }
    } finally {
      release()
    }
  } finally {
    await rm(tempDirPath, { recursive: true, force: true })
  }
}

async function uploadGitLabIssueBodyImages(
  repoPath: string,
  body: string,
  projectRef: ProjectRef,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<string> {
  const matches = [...body.matchAll(MARKDOWN_DATA_IMAGE_PATTERN)]
  if (matches.length === 0) {
    return body
  }

  let result = ''
  let cursor = 0
  for (const [index, match] of matches.entries()) {
    const matchStart = match.index ?? cursor
    const fullMatch = match[0]
    result += body.slice(cursor, matchStart)
    result += await uploadGitLabIssueBodyImage({
      repoPath,
      projectRef,
      connectionId,
      localGitOptions,
      alt: match[1] || `Image ${index + 1}`,
      extension: gitLabUploadImageExtension(match[3] || 'png'),
      index: index + 1,
      base64Content: match[4] || ''
    })
    cursor = matchStart + fullMatch.length
  }
  result += body.slice(cursor)
  return result
}

/**
 * Get a single issue by number.
 *
 * Why this path doesn't take a preference — mirrors the GitHub issues.ts
 * commentary: linked-issue lookups persist a number to a worktree at
 * creation time. Routing detail lookups through the live per-repo
 * preference would silently flip an existing link to a different project
 * after the user toggled the selector.
 */
export async function getIssue(
  repoPath: string,
  issueNumber: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabIssueInfo | null> {
  const knownHosts = await getGlabKnownHosts(connectionId, localGitOptions)
  const projectRef = await getIssueProjectRef(repoPath, knownHosts, connectionId, localGitOptions)
  // Why: don't fall back to a cwd-inferred `glab issue view` when the project
  // can't be resolved — on an SSH connection cwd is not the repo dir, so glab
  // hits a non-repo dir and fails with `git: exit status 128`. Return null
  // (the caller already treats a missing project as "no issue") instead of
  // spawning a doomed cwd-dependent call.
  if (!projectRef) {
    return null
  }
  await acquire()
  try {
    const { stdout } = await glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        `projects/${encodedProject(projectRef.path)}/issues/${issueNumber}`
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
    const data = JSON.parse(stdout)
    return mapGitLabIssueInfo(data)
  } catch {
    return null
  } finally {
    release()
  }
}

/**
 * List issues for a project.
 *
 * Mirrors github/listIssues — returns a structured IssueListResult so
 * permission errors surface in the UI instead of collapsing to "No issues".
 */
// Why: GitLab issues only have 'opened' / 'closed' lifecycle states.
// 'all' maps to no state param so the API returns both.
export type IssueListState = 'opened' | 'closed' | 'all'

export async function listIssues(
  repoPath: string,
  limit = 20,
  preference?: IssueSourcePreference,
  state: IssueListState = 'opened',
  assignee?: string,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<IssueListResult> {
  const knownHosts = await getGlabKnownHosts(connectionId, localGitOptions)
  const { source: projectRef } = await resolveIssueSource(
    repoPath,
    preference,
    knownHosts,
    connectionId,
    localGitOptions
  )
  // Why: when the project can't be resolved we must NOT fall back to an
  // unscoped `glab issue list` that infers the project from cwd. For a repo
  // on an SSH connection there is no local cwd matching the repo, so glab
  // runs git resolution in a non-repo dir and fails with `git: exit status
  // 128`. In an "All projects" aggregate one such failure must not sink the
  // whole panel — return a structured, isolated result so the resolvable
  // projects still load.
  if (!projectRef) {
    return {
      items: [],
      error: {
        type: 'not_found',
        message: 'Could not resolve a GitLab project for this repository.'
      }
    }
  }
  await acquire()
  try {
    const stateParam = state === 'all' ? '' : `&state=${state}`
    const scopeParam = assignee === '@me' ? '&scope=assigned_to_me' : ''
    const { stdout } = await glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        `projects/${encodedProject(projectRef.path)}/issues?per_page=${limit}&order_by=updated_at&sort=desc${stateParam}${scopeParam}`
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
    const data = JSON.parse(stdout) as Record<string, unknown>[]
    // Why: GitLab's project issues endpoint returns true issues only
    // (MRs are a separate endpoint), so no equivalent of GitHub's
    // pull_request filter is needed here.
    return {
      items: data.map((d) => mapGitLabIssueInfo(d as Parameters<typeof mapGitLabIssueInfo>[0]))
    }
  } catch (err) {
    const stderr = err instanceof Error ? err.message : String(err)
    return {
      items: [],
      error: classifyListIssuesError(stderr)
    }
  } finally {
    release()
  }
}

/**
 * Create a new GitLab issue. Uses `glab api` with explicit project path so
 * the call doesn't depend on cwd matching the project the user picked.
 */
export async function createIssue(
  repoPath: string,
  title: string,
  body: string,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true; number: number; url: string } | { ok: false; error: string }> {
  const trimmedTitle = title.trim()
  if (!trimmedTitle) {
    return { ok: false, error: 'Title is required' }
  }
  const knownHosts = await getGlabKnownHosts(connectionId, localGitOptions)
  const { source: projectRef } = await resolveIssueSource(
    repoPath,
    preference,
    knownHosts,
    connectionId,
    localGitOptions
  )
  if (!projectRef) {
    return {
      ok: false,
      error: 'Could not resolve GitLab project for this repository'
    }
  }
  let issueBody = body
  try {
    issueBody = await uploadGitLabIssueBodyImages(
      repoPath,
      body,
      projectRef,
      connectionId,
      localGitOptions
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Could not upload GitLab issue image: ${message}` }
  }
  await acquire()
  try {
    const { stdout } = await glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        '-X',
        'POST',
        `projects/${encodedProject(projectRef.path)}/issues`,
        '-f',
        `title=${trimmedTitle}`,
        '-f',
        // Why: GitLab uses `description` (not `body`) for issue text.
        `description=${issueBody}`
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
    const data = JSON.parse(stdout) as { iid?: number; web_url?: string; url?: string }
    if (typeof data.iid !== 'number') {
      return { ok: false, error: 'Unexpected response from GitLab' }
    }
    return {
      ok: true,
      number: data.iid,
      url: String(data.web_url ?? data.url ?? '')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  } finally {
    release()
  }
}

/**
 * Update an existing GitLab issue.
 *
 * Why: callers that list through a per-repo issue source preference must
 * mutate the same GitLab project, or identical IIDs on origin/upstream can
 * silently edit the wrong issue.
 */
export async function updateIssue(
  repoPath: string,
  issueNumber: number,
  updates: GitLabIssueUpdate,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  projectRefOverride?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const projectRef =
    projectRefOverride ??
    (
      await resolveIssueSource(
        repoPath,
        preference,
        await getGlabKnownHosts(connectionId, localGitOptions),
        connectionId,
        localGitOptions
      )
    ).source
  if (!projectRef) {
    return {
      ok: false,
      error: 'Could not resolve GitLab project for this repository'
    }
  }

  const repoFlag = projectRef.path
  const errors: string[] = []

  // State change requires a separate command (parallel to github's split).
  if (updates.state) {
    await acquire()
    try {
      const cmd = updates.state === 'closed' ? 'close' : 'reopen'
      await glabExecFileAsync(
        [
          'issue',
          cmd,
          String(issueNumber),
          '-R',
          repoFlag,
          ...glabHostnameArgs(projectRef, connectionId)
        ],
        glabRepoExecOptions(repoPath, connectionId, localGitOptions)
      )
    } catch (err) {
      const stderr = err instanceof Error ? err.message : String(err)
      // Treat "already closed/reopened" as a no-op (matches gh path).
      if (!stderr.toLowerCase().includes('already')) {
        errors.push(classifyGlabError(stderr).message)
      }
    } finally {
      release()
    }
  }

  if (updates.body !== undefined) {
    await acquire()
    try {
      await glabExecFileAsync(
        [
          'api',
          ...glabHostnameArgs(projectRef, connectionId),
          '-X',
          'PUT',
          `projects/${encodedProject(repoFlag)}/issues/${issueNumber}`,
          '-f',
          `description=${updates.body}`
        ],
        glabRepoExecOptions(repoPath, connectionId, localGitOptions)
      )
    } catch (err) {
      const stderr = err instanceof Error ? err.message : String(err)
      errors.push(classifyGlabError(stderr).message)
    } finally {
      release()
    }
  }

  // Field edits via `glab issue update`.
  const editArgs: string[] = [
    'issue',
    'update',
    String(issueNumber),
    '-R',
    repoFlag,
    ...glabHostnameArgs(projectRef, connectionId)
  ]
  let hasEditArgs = false

  if (updates.title) {
    editArgs.push('--title', updates.title)
    hasEditArgs = true
  }
  for (const label of updates.addLabels ?? []) {
    editArgs.push('--label', label)
    hasEditArgs = true
  }
  for (const label of updates.removeLabels ?? []) {
    editArgs.push('--unlabel', label)
    hasEditArgs = true
  }
  for (const assignee of updates.addAssignees ?? []) {
    editArgs.push('--assignee', assignee)
    hasEditArgs = true
  }
  for (const assignee of updates.removeAssignees ?? []) {
    editArgs.push('--unassignee', assignee)
    hasEditArgs = true
  }

  if (hasEditArgs) {
    await acquire()
    try {
      await glabExecFileAsync(
        editArgs,
        glabRepoExecOptions(repoPath, connectionId, localGitOptions)
      )
    } catch (err) {
      const stderr = err instanceof Error ? err.message : String(err)
      errors.push(classifyGlabError(stderr).message)
    } finally {
      release()
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join('; ') }
  }
  return { ok: true }
}

/**
 * Add a comment (note) to an existing GitLab issue. Mirrors
 * github/addIssueComment.
 */
export async function addIssueComment(
  repoPath: string,
  issueNumber: number,
  body: string,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  projectRefOverride?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabCommentResult> {
  const projectRef =
    projectRefOverride ??
    (
      await resolveIssueSource(
        repoPath,
        preference,
        await getGlabKnownHosts(connectionId, localGitOptions),
        connectionId,
        localGitOptions
      )
    ).source
  if (!projectRef) {
    return {
      ok: false,
      error: 'Could not resolve GitLab project for this repository'
    }
  }
  await acquire()
  try {
    const { stdout } = await glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        '-X',
        'POST',
        `projects/${encodedProject(projectRef.path)}/issues/${issueNumber}/notes`,
        '-f',
        `body=${body}`
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
    const data = JSON.parse(stdout) as {
      id?: number
      author?: { username?: string; avatar_url?: string; state?: string } | null
      body?: string
      created_at?: string
      // Why: GitLab note responses don't include a per-note web_url; build one
      // from the issue URL. We don't have the issue URL here, so leave blank
      // — the renderer falls back to the issue URL when comment.url is empty.
    }
    const comment: MRComment = {
      id: data.id ?? Date.now(),
      author: data.author?.username ?? 'You',
      authorAvatarUrl: data.author?.avatar_url ?? '',
      body: data.body ?? body,
      createdAt: data.created_at ?? new Date().toISOString(),
      url: '',
      isBot: data.author?.state === 'bot'
    }
    return { ok: true, comment }
  } catch (err) {
    const stderr = err instanceof Error ? err.message : String(err)
    return { ok: false, error: classifyGlabError(stderr).message }
  } finally {
    release()
  }
}

export async function listLabels(
  repoPath: string,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<string[]> {
  const knownHosts = await getGlabKnownHosts(connectionId, localGitOptions)
  const { source: projectRef } = await resolveIssueSource(
    repoPath,
    preference,
    knownHosts,
    connectionId,
    localGitOptions
  )
  if (!projectRef) {
    return []
  }
  await acquire()
  try {
    const { stdout } = await glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        '--paginate',
        `projects/${encodedProject(projectRef.path)}/labels`,
        '--jq',
        '.[].name'
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
    return stdout
      .trim()
      .split('\n')
      .filter((l) => l.length > 0)
  } catch {
    return []
  } finally {
    release()
  }
}

export async function listAssignableUsers(
  repoPath: string,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabAssignableUser[]> {
  const knownHosts = await getGlabKnownHosts(connectionId, localGitOptions)
  const { source: projectRef } = await resolveIssueSource(
    repoPath,
    preference,
    knownHosts,
    connectionId,
    localGitOptions
  )
  if (!projectRef) {
    return []
  }
  await acquire()
  try {
    // Why: `members/all` returns project members including those inherited
    // from parent groups — important for projects under a top-level group
    // where assignable users typically come from the group, not the project.
    // --paginate walks every page; --jq emits NDJSON.
    const { stdout } = await glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        '--paginate',
        `projects/${encodedProject(projectRef.path)}/members/all?per_page=100`,
        '--jq',
        '.[] | {id, username, name, avatar_url, state}'
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
    type RESTMember = {
      id?: number
      username?: string
      name?: string | null
      avatar_url?: string | null
      state?: string | null
    }
    const users: GitLabAssignableUser[] = []
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }
      try {
        const user = JSON.parse(trimmed) as RESTMember
        if (user.username) {
          users.push({
            ...(typeof user.id === 'number' ? { id: user.id } : {}),
            username: user.username,
            name: user.name ?? null,
            avatarUrl: user.avatar_url ?? '',
            ...(user.state !== undefined ? { state: user.state } : {})
          })
        }
      } catch {
        // Skip malformed NDJSON lines defensively.
      }
    }
    return users
  } catch {
    return []
  } finally {
    release()
  }
}
