import React from 'react'
import { cn } from '@/lib/utils'

type DiffLineKind = 'add' | 'delete' | 'context' | 'hunk' | 'metadata'

export type GitLabMRFileDiffLine = {
  kind: DiffLineKind
  oldLine: number | null
  newLine: number | null
  marker: string
  text: string
}

const HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/

export function parseGitLabMRFileDiff(diff: string): GitLabMRFileDiffLine[] {
  const rows: GitLabMRFileDiffLine[] = []
  let oldLine: number | null = null
  let newLine: number | null = null
  const lines = diff.split(/\r?\n/)

  for (const [index, line] of lines.entries()) {
    if (line === '' && index === lines.length - 1) {
      continue
    }

    const hunkMatch = HUNK_HEADER_PATTERN.exec(line)
    if (hunkMatch) {
      oldLine = Number.parseInt(hunkMatch[1], 10)
      newLine = Number.parseInt(hunkMatch[2], 10)
      rows.push({
        kind: 'hunk',
        oldLine: null,
        newLine: null,
        marker: '',
        text: line
      })
      continue
    }

    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('\\')) {
      rows.push({
        kind: 'metadata',
        oldLine: null,
        newLine: null,
        marker: '',
        text: line
      })
      continue
    }

    if (line.startsWith('+')) {
      rows.push({
        kind: 'add',
        oldLine: null,
        newLine,
        marker: '+',
        text: line.slice(1)
      })
      if (newLine !== null) {
        newLine += 1
      }
      continue
    }

    if (line.startsWith('-')) {
      rows.push({
        kind: 'delete',
        oldLine,
        newLine: null,
        marker: '-',
        text: line.slice(1)
      })
      if (oldLine !== null) {
        oldLine += 1
      }
      continue
    }

    const text = line.startsWith(' ') ? line.slice(1) : line
    rows.push({
      kind: 'context',
      oldLine,
      newLine,
      marker: '',
      text
    })
    if (oldLine !== null) {
      oldLine += 1
    }
    if (newLine !== null) {
      newLine += 1
    }
  }

  return rows
}

function formatLineNumber(value: number | null): string {
  return value === null ? '' : String(value)
}

function diffRowClassName(kind: DiffLineKind): string {
  switch (kind) {
    case 'add':
      return 'bg-[color:color-mix(in_srgb,var(--git-decoration-added)_14%,transparent)]'
    case 'delete':
      return 'bg-[color:color-mix(in_srgb,var(--git-decoration-deleted)_14%,transparent)]'
    case 'hunk':
      return 'border-y border-border/40 bg-muted/45 text-muted-foreground'
    case 'metadata':
      return 'text-muted-foreground'
    case 'context':
    default:
      return 'hover:bg-muted/25'
  }
}

function markerClassName(kind: DiffLineKind): string {
  switch (kind) {
    case 'add':
      return 'text-[var(--git-decoration-added)]'
    case 'delete':
      return 'text-[var(--git-decoration-deleted)]'
    default:
      return 'text-muted-foreground'
  }
}

export function GitLabMRFileDiff({
  diff,
  fill = false
}: {
  diff: string
  fill?: boolean
}): React.JSX.Element {
  const lines = parseGitLabMRFileDiff(diff)

  return (
    <div
      className={cn(
        'overflow-auto bg-background scrollbar-sleek',
        fill ? 'min-h-0 flex-1' : 'max-h-96'
      )}
    >
      <div className="min-w-max py-1 font-mono text-[11px] leading-5 text-foreground">
        {lines.map((line, index) => (
          <div
            key={`${index}-${line.kind}-${line.oldLine ?? ''}-${line.newLine ?? ''}`}
            className={cn(
              'grid grid-cols-[48px_48px_24px_minmax(32rem,1fr)]',
              diffRowClassName(line.kind)
            )}
          >
            <span className="select-none border-r border-border/25 bg-background/35 px-2 text-right text-muted-foreground">
              {formatLineNumber(line.oldLine)}
            </span>
            <span className="select-none border-r border-border/25 bg-background/35 px-2 text-right text-muted-foreground">
              {formatLineNumber(line.newLine)}
            </span>
            <span
              className={cn(
                'select-none px-1 text-center font-semibold',
                markerClassName(line.kind)
              )}
            >
              {line.marker}
            </span>
            <span className="whitespace-pre pr-4">{line.text || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
