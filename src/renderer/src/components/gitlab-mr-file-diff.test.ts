import { describe, expect, it } from 'vitest'
import { parseGitLabMRFileDiff } from './gitlab-mr-file-diff'

describe('parseGitLabMRFileDiff', () => {
  it('tracks old and new line numbers across hunk, context, deletion, and addition rows', () => {
    const rows = parseGitLabMRFileDiff(
      [
        '@@ -17,7 +17,12 @@',
        ' unchanged',
        '-old line',
        '+new line',
        '+another new line',
        ' trailing context'
      ].join('\n')
    )

    expect(rows).toEqual([
      {
        kind: 'hunk',
        oldLine: null,
        newLine: null,
        marker: '',
        text: '@@ -17,7 +17,12 @@'
      },
      { kind: 'context', oldLine: 17, newLine: 17, marker: '', text: 'unchanged' },
      { kind: 'delete', oldLine: 18, newLine: null, marker: '-', text: 'old line' },
      { kind: 'add', oldLine: null, newLine: 18, marker: '+', text: 'new line' },
      { kind: 'add', oldLine: null, newLine: 19, marker: '+', text: 'another new line' },
      { kind: 'context', oldLine: 19, newLine: 20, marker: '', text: 'trailing context' }
    ])
  })

  it('keeps diff metadata out of line numbering', () => {
    const rows = parseGitLabMRFileDiff(
      ['--- a/file.ts', '+++ b/file.ts', '@@ -1 +1 @@', '-before', '+after'].join('\n')
    )

    expect(rows.map((row) => [row.kind, row.oldLine, row.newLine])).toEqual([
      ['metadata', null, null],
      ['metadata', null, null],
      ['hunk', null, null],
      ['delete', 1, null],
      ['add', null, 1]
    ])
  })
})
