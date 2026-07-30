import { describe, expect, it } from 'vitest'
import {
  filterAvailableTaskProviders,
  normalizeTaskProviderSettings,
  normalizeVisibleTaskProviders,
  restoreAvailableDefaultTaskProvider,
  resolveVisibleTaskProvider
} from './task-providers'

describe('task providers', () => {
  it('normalizes provider lists while preserving supported order', () => {
    expect(normalizeVisibleTaskProviders(['gitlab', 'unknown', 'gitlab', 'linear'])).toEqual([
      'gitlab'
    ])
  })

  it('falls back to default providers when none are visible', () => {
    expect(normalizeVisibleTaskProviders([])).toEqual(['gitlab', 'yunxiao', 'code-merge'])
  })

  it('drops saved defaults that are no longer task source picker entries', () => {
    expect(
      normalizeTaskProviderSettings({
        visibleTaskProviders: ['linear'],
        defaultTaskSource: 'github'
      })
    ).toEqual({
      defaultTaskSource: 'gitlab',
      visibleTaskProviders: ['gitlab', 'yunxiao', 'code-merge']
    })
  })

  it('normalizes invalid saved defaults to the first visible provider', () => {
    expect(
      normalizeTaskProviderSettings({
        visibleTaskProviders: ['gitlab'],
        defaultTaskSource: 'bitbucket'
      })
    ).toEqual({
      defaultTaskSource: 'gitlab',
      visibleTaskProviders: ['gitlab']
    })
  })

  it('defaults missing provider settings to GitLab, Yunxiao, and code merge', () => {
    expect(
      normalizeTaskProviderSettings({
        visibleTaskProviders: undefined,
        defaultTaskSource: undefined
      })
    ).toEqual({
      defaultTaskSource: 'gitlab',
      visibleTaskProviders: ['gitlab', 'yunxiao', 'code-merge']
    })
  })

  it('resolves hidden preferred providers to the first picker provider', () => {
    expect(resolveVisibleTaskProvider('github', ['linear', 'yunxiao'])).toBe('yunxiao')
  })

  it('filters non-picker providers even before runtime tooling is available', () => {
    expect(
      filterAvailableTaskProviders(['github', 'gitlab', 'linear'], {
        gitlabInstalled: false,
        linearConnected: true
      })
    ).toEqual(['gitlab'])
  })

  it('ignores saved defaults outside the task source picker', () => {
    expect(
      restoreAvailableDefaultTaskProvider(
        ['linear'],
        {
          gitlabInstalled: false,
          linearConnected: true
        },
        'github'
      )
    ).toEqual(['gitlab'])
  })

  it('falls back when an intentionally narrowed provider is outside the picker', () => {
    expect(
      restoreAvailableDefaultTaskProvider(
        ['linear'],
        {
          gitlabInstalled: false,
          linearConnected: true
        },
        'linear'
      )
    ).toEqual(['gitlab'])
  })

  it('restores GitLab as a saved default before runtime tooling is available', () => {
    expect(
      restoreAvailableDefaultTaskProvider(
        ['linear'],
        {
          gitlabInstalled: false,
          linearConnected: true
        },
        'gitlab'
      )
    ).toEqual(['gitlab'])
  })

  it('ignores invalid saved defaults while restoring visible GitLab providers', () => {
    expect(
      restoreAvailableDefaultTaskProvider(
        ['gitlab'],
        {
          gitlabInstalled: false,
          linearConnected: true
        },
        'bitbucket'
      )
    ).toEqual(['gitlab'])
  })

  it('falls back to GitLab when it is the only repo-backed visible provider', () => {
    expect(
      filterAvailableTaskProviders(['gitlab', 'linear'], {
        gitlabInstalled: false,
        linearConnected: false
      })
    ).toEqual(['gitlab'])
  })

  it('falls back to GitLab when no visible providers are available', () => {
    expect(
      filterAvailableTaskProviders(['linear'], {
        gitlabInstalled: false,
        linearConnected: false
      })
    ).toEqual(['gitlab'])
  })
})
