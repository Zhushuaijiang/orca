import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../shared/types'
import {
  expandSelectedTaskSourceRepos,
  getDefaultTaskRepoSelection,
  getTaskProjectPickerGroups,
  getTaskProjectPickerRepos,
  getTaskWorkspaceRepoForSourceRepo,
  normalizeTaskRepoSelection
} from './task-page-default-repo-selection'

function repo(overrides: Partial<Repo> & Pick<Repo, 'id'>): Repo {
  return {
    path: `/repos/${overrides.id}`,
    displayName: overrides.id,
    badgeColor: '#737373',
    addedAt: 100,
    kind: 'git',
    ...overrides
  }
}

describe('getDefaultTaskRepoSelection', () => {
  it('selects one source per logical GitHub project', () => {
    const selection = getDefaultTaskRepoSelection([
      repo({
        id: 'local-orca',
        upstream: { owner: 'StablyAI', repo: 'Orca' }
      }),
      repo({
        id: 'ssh-orca',
        connectionId: 'builder',
        upstream: { owner: 'stablyai', repo: 'orca' }
      }),
      repo({
        id: 'other',
        upstream: { owner: 'stablyai', repo: 'other' }
      })
    ])

    expect([...selection].sort()).toEqual(['local-orca', 'other'])
  })

  it('prefers local checkout over a remote checkout for the same project', () => {
    const selection = getDefaultTaskRepoSelection([
      repo({
        id: 'ssh-orca',
        addedAt: 1,
        connectionId: 'builder',
        upstream: { owner: 'stablyai', repo: 'orca' }
      }),
      repo({
        id: 'local-orca',
        addedAt: 2,
        upstream: { owner: 'stablyai', repo: 'orca' }
      })
    ])

    expect([...selection]).toEqual(['local-orca'])
  })

  it('keeps same-named folders separate when provider identity is missing', () => {
    const selection = getDefaultTaskRepoSelection([
      repo({ id: 'local-app', displayName: 'app' }),
      repo({ id: 'ssh-app', displayName: 'app', connectionId: 'builder' })
    ])

    expect([...selection].sort()).toEqual(['local-app', 'ssh-app'])
  })

  it('uses GitHub repo icon metadata to identify legacy duplicate projects', () => {
    const selection = getDefaultTaskRepoSelection([
      repo({
        id: 'local-claude-swap',
        displayName: 'claude-swap',
        repoIcon: {
          type: 'image',
          src: 'https://github.com/stablyai.png?size=64',
          source: 'github',
          label: 'stablyai/claude-swap'
        }
      }),
      repo({
        id: 'ssh-claude-swap',
        displayName: 'claude-swap',
        connectionId: 'builder',
        repoIcon: {
          type: 'image',
          src: 'https://github.com/stablyai.png?size=64',
          source: 'github',
          label: 'StablyAI/claude-swap'
        }
      })
    ])

    expect([...selection]).toEqual(['local-claude-swap'])
  })
})

describe('getTaskProjectPickerRepos', () => {
  it('shows one picker row per logical GitHub project', () => {
    const pickerRepos = getTaskProjectPickerRepos([
      repo({
        id: 'local-orca',
        upstream: { owner: 'StablyAI', repo: 'Orca' }
      }),
      repo({
        id: 'ssh-orca',
        connectionId: 'builder',
        upstream: { owner: 'stablyai', repo: 'orca' }
      }),
      repo({
        id: 'other',
        upstream: { owner: 'stablyai', repo: 'other' }
      })
    ])

    expect(pickerRepos.map((candidate) => candidate.id)).toEqual(['local-orca', 'other'])
  })

  it('uses an explicitly selected remote source as the visible project row', () => {
    const pickerRepos = getTaskProjectPickerRepos(
      [
        repo({
          id: 'local-orca',
          upstream: { owner: 'stablyai', repo: 'orca' }
        }),
        repo({
          id: 'ssh-orca',
          connectionId: 'builder',
          upstream: { owner: 'stablyai', repo: 'orca' }
        })
      ],
      new Set(['ssh-orca'])
    )

    expect(pickerRepos.map((candidate) => candidate.id)).toEqual(['ssh-orca'])
  })

  it('collapses legacy local and SSH rows that share a GitHub repo icon identity', () => {
    const pickerRepos = getTaskProjectPickerRepos([
      repo({
        id: 'local-claude-swap',
        displayName: 'claude-swap',
        repoIcon: {
          type: 'image',
          src: 'https://github.com/stablyai.png?size=64',
          source: 'github',
          label: 'stablyai/claude-swap'
        }
      }),
      repo({
        id: 'ssh-claude-swap',
        displayName: 'claude-swap',
        connectionId: 'builder',
        repoIcon: {
          type: 'image',
          src: 'https://github.com/stablyai.png?size=64',
          source: 'github',
          label: 'StablyAI/claude-swap'
        }
      })
    ])

    expect(pickerRepos.map((candidate) => candidate.id)).toEqual(['local-claude-swap'])
  })
})

describe('getTaskProjectPickerGroups', () => {
  it('keeps all host sources under one logical project row', () => {
    const groups = getTaskProjectPickerGroups([
      repo({
        id: 'local-orca',
        upstream: { owner: 'stablyai', repo: 'orca' }
      }),
      repo({
        id: 'ssh-orca',
        connectionId: 'builder',
        upstream: { owner: 'stablyai', repo: 'orca' }
      }),
      repo({
        id: 'docs',
        upstream: { owner: 'stablyai', repo: 'docs' }
      })
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      projectKey: 'github:stablyai/orca',
      repo: { id: 'local-orca' }
    })
    expect(groups[0]?.sources.map((source) => source.id)).toEqual(['local-orca', 'ssh-orca'])
    expect(groups[1]).toMatchObject({
      projectKey: 'github:stablyai/docs',
      repo: { id: 'docs' }
    })
  })

  it('uses the explicitly selected source as the project representative', () => {
    const groups = getTaskProjectPickerGroups(
      [
        repo({
          id: 'local-orca',
          upstream: { owner: 'stablyai', repo: 'orca' }
        }),
        repo({
          id: 'ssh-orca',
          connectionId: 'builder',
          upstream: { owner: 'stablyai', repo: 'orca' }
        })
      ],
      new Set(['ssh-orca'])
    )

    expect(groups[0]?.repo.id).toBe('ssh-orca')
    expect(groups[0]?.sources.map((source) => source.id)).toEqual(['local-orca', 'ssh-orca'])
  })
})

describe('expandSelectedTaskSourceRepos', () => {
  it('expands a selected parent workspace to nested Git remotes for task fetching', () => {
    const parent = repo({ id: 'ygt-workspace', path: '/repos/ygt-workspace' })
    const main = repo({
      id: 'df-ygt-main',
      path: '/repos/ygt-workspace/df-ygt/df-ygt-main',
      gitRemoteIdentity: {
        canonicalKey: 'gitlab.df-mic.com/df-ygt/df-ygt-main',
        remoteName: 'origin',
        remoteUrl: 'git@gitlab.df-mic.com:df-ygt/df-ygt-main.git'
      }
    })
    const biz = repo({
      id: 'df-ygt-biz-base',
      path: '/repos/ygt-workspace/df-ygt/df-ygt-biz-base',
      gitRemoteIdentity: {
        canonicalKey: 'gitlab.df-mic.com/df-ygt/df-ygt-biz-base',
        remoteName: 'origin',
        remoteUrl: 'git@gitlab.df-mic.com:df-ygt/df-ygt-biz-base.git'
      }
    })

    const expanded = expandSelectedTaskSourceRepos([parent, main, biz], new Set([parent.id]))

    expect(expanded.map((candidate) => candidate.id)).toEqual([main.id, biz.id])
  })

  it('keeps a selected remote-backed repo as the task source', () => {
    const source = repo({
      id: 'df-ygt-main',
      gitRemoteIdentity: {
        canonicalKey: 'gitlab.df-mic.com/df-ygt/df-ygt-main',
        remoteName: 'origin',
        remoteUrl: 'git@gitlab.df-mic.com:df-ygt/df-ygt-main.git'
      }
    })

    const expanded = expandSelectedTaskSourceRepos([source], new Set([source.id]))

    expect(expanded.map((candidate) => candidate.id)).toEqual([source.id])
  })
})

describe('getTaskWorkspaceRepoForSourceRepo', () => {
  it('returns the selected parent workspace for a nested task source', () => {
    const parent = repo({ id: 'ygt-workspace', path: '/repos/ygt-workspace' })
    const source = repo({
      id: 'df-ygt-main',
      path: '/repos/ygt-workspace/df-ygt/df-ygt-main',
      gitRemoteIdentity: {
        canonicalKey: 'gitlab.df-mic.com/df-ygt/df-ygt-main',
        remoteName: 'origin',
        remoteUrl: 'git@gitlab.df-mic.com:df-ygt/df-ygt-main.git'
      }
    })

    const workspaceRepo = getTaskWorkspaceRepoForSourceRepo(
      source.id,
      [parent, source],
      new Set([parent.id])
    )

    expect(workspaceRepo?.id).toBe(parent.id)
  })
})

describe('normalizeTaskRepoSelection', () => {
  it('collapses duplicate selected sources for the same logical project', () => {
    const selection = normalizeTaskRepoSelection(
      [
        repo({
          id: 'local-orca',
          upstream: { owner: 'stablyai', repo: 'orca' }
        }),
        repo({
          id: 'ssh-orca',
          connectionId: 'builder',
          upstream: { owner: 'stablyai', repo: 'orca' }
        })
      ],
      new Set(['local-orca', 'ssh-orca'])
    )

    expect([...selection]).toEqual(['local-orca'])
  })

  it('preserves a single explicit remote source selection', () => {
    const selection = normalizeTaskRepoSelection(
      [
        repo({
          id: 'local-orca',
          upstream: { owner: 'stablyai', repo: 'orca' }
        }),
        repo({
          id: 'ssh-orca',
          connectionId: 'builder',
          upstream: { owner: 'stablyai', repo: 'orca' }
        })
      ],
      new Set(['ssh-orca'])
    )

    expect([...selection]).toEqual(['ssh-orca'])
  })

  it('normalizes raw all-host selection to one source per logical project', () => {
    const selection = normalizeTaskRepoSelection(
      [
        repo({
          id: 'local-orca',
          upstream: { owner: 'stablyai', repo: 'orca' }
        }),
        repo({
          id: 'ssh-orca',
          connectionId: 'builder',
          upstream: { owner: 'stablyai', repo: 'orca' }
        }),
        repo({
          id: 'docs',
          upstream: { owner: 'stablyai', repo: 'docs' }
        })
      ],
      new Set(['local-orca', 'ssh-orca', 'docs'])
    )

    expect([...selection].sort()).toEqual(['docs', 'local-orca'])
  })
})
