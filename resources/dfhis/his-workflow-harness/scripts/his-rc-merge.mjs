import path from 'node:path'
import { spawn } from 'node:child_process'

const DEFAULT_RC_BRANCH_PATTERN = '^origin/(RC|release/RC)'

function run(argv, options) {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.on('error', (error) => resolve({ code: null, stdout, stderr, error: error.message }))
    child.on('close', (code) => resolve({ code, stdout, stderr, error: null }))
  })
}

async function git(repo, args, summary) {
  const result = await run(['git', ...args], { cwd: repo, env: process.env })
  if (result.code !== 0) {
    throw new Error(
      `${summary} failed (git ${args.join(' ')}): ${result.stderr.trim() || result.error || `exit ${result.code}`}`
    )
  }
  return result.stdout.trim()
}

async function remoteBranches(repo) {
  const output = await git(
    repo,
    ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/remotes/origin'],
    'Listing remote branches'
  )
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

async function resolveRcBranch(repo, options) {
  const remotes = await remoteBranches(repo)
  if (options.rcBranch) {
    const wanted = options.rcBranch.startsWith('origin/')
      ? options.rcBranch
      : `origin/${options.rcBranch}`
    if (!remotes.includes(wanted)) {
      throw new Error(`RC branch ${wanted} does not exist on origin after fetch.`)
    }
    return wanted
  }
  const pattern = new RegExp(options.rcBranchPattern ?? DEFAULT_RC_BRANCH_PATTERN, 'i')
  // Never treat the harness's own pushed integration branches as the RC target.
  const match = remotes.find(
    (name) => pattern.test(name) && !/^origin\/rc-verify\//i.test(name) && name !== 'origin/HEAD'
  )
  if (!match) {
    throw new Error(
      `No RC branch on origin matches /${options.rcBranchPattern ?? DEFAULT_RC_BRANCH_PATTERN}/i.`
    )
  }
  return match
}

async function assertNotMainWorktree(repo, options) {
  if (options.allowMainWorktreeMerge === true) {
    return
  }
  const gitDir = await git(repo, ['rev-parse', '--git-dir'], 'Resolving git dir')
  const commonDir = await git(repo, ['rev-parse', '--git-common-dir'], 'Resolving git common dir')
  if (path.resolve(repo, gitDir) === path.resolve(repo, commonDir)) {
    throw new Error(
      'rc-merge refuses to run in a repository main working tree; use a linked worktree or pass --allow-main-worktree-merge.'
    )
  }
}

export async function runRcMerge(context) {
  const workItem = String(context.options.workItem ?? '')
    .trim()
    .toUpperCase()
  if (!/^DFHIS-\d+$/.test(workItem)) {
    throw new Error('rc-merge requires --work-item DFHIS-<number>.')
  }
  const repo = context.repo
  const sourceBranch = context.options.sourceBranch ?? context.run.sourceBranch
  if (!sourceBranch) {
    throw new Error(
      'rc-merge requires --source-branch when the run was created on a detached HEAD.'
    )
  }
  await assertNotMainWorktree(repo, context.options)
  await git(repo, ['fetch', 'origin', '--prune'], 'Fetching origin')
  const rcBranch = await resolveRcBranch(repo, context.options)
  const integrationBranch = `rc-verify/${workItem}`
  await git(
    repo,
    ['checkout', '-B', integrationBranch, rcBranch],
    'Checking out RC integration branch'
  )
  // The checkout already moved HEAD; keep the persisted identity in sync so a later resume matches.
  context.run.repositoryHead = await git(repo, ['rev-parse', 'HEAD'], 'Reading RC tip')
  await context.persist()
  const merge = await run(['git', 'merge', '--no-ff', sourceBranch], {
    cwd: repo,
    env: process.env
  })
  if (merge.code !== 0) {
    const conflicts = await run(['git', 'diff', '--name-only', '--diff-filter=U'], {
      cwd: repo,
      env: process.env
    })
    await run(['git', 'merge', '--abort'], { cwd: repo, env: process.env })
    const files = conflicts.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    throw new Error(
      `Merging ${sourceBranch} into ${rcBranch} conflicted in ${files.length} file(s): ${files.join(', ') || 'unknown'}. Merge aborted; fix the conflict and resume.`
    )
  }
  const mergedHead = await git(repo, ['rev-parse', 'HEAD'], 'Reading merged HEAD')
  await git(
    repo,
    ['push', '--force-with-lease', 'origin', integrationBranch],
    'Pushing RC integration branch'
  )
  context.run.repositoryHead = mergedHead
  await context.persist()
  return { rcBranch, sourceBranch, integrationBranch, mergedHead }
}
