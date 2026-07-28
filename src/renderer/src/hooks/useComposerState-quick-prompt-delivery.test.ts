import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const HOOK_SOURCE = readFileSync(join(__dirname, 'useComposerState.ts'), 'utf8')

function sourceBetween(source: string, startPattern: string, endPattern: string): string {
  const start = source.indexOf(startPattern)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf(endPattern, start + startPattern.length)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('useComposerState quick prompt delivery', () => {
  it('sends composer prompt text through quick-create and folder-create startup paths', () => {
    const quickSection = sourceBetween(
      HOOK_SOURCE,
      'const { prompt: quickPrompt, draftPrompt: quickDraftPrompt } =',
      'const draftLaunchPlan ='
    )
    const folderSection = sourceBetween(
      HOOK_SOURCE,
      'const folderWorkspaceCreated = await submitFolderWorkspaceCreate({',
      'terminalWindowsShell:'
    )

    expect(quickSection).toContain(
      'resolveQuickCreateLinkedWorkItemPrompt(promptLinkedWorkItem, trimmedNote, agentPrompt)'
    )
    expect(folderSection).toContain('promptSeed: agentPrompt')
  })
})
