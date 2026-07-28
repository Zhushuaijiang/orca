import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const MODAL_SOURCE = readFileSync(join(__dirname, 'NewWorkspaceComposerModal.tsx'), 'utf8')

function sourceBetween(source: string, startPattern: string, endPattern: string): string {
  const start = source.indexOf(startPattern)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf(endPattern, start + startPattern.length)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('NewWorkspaceComposerModal initial prompt', () => {
  it('passes modal initialPrompt into quick composer state', () => {
    const modalDataType = sourceBetween(MODAL_SOURCE, 'type ComposerModalData = {', '}')
    const composerStateArgs = sourceBetween(MODAL_SOURCE, 'useComposerState({', 'persistDraft:')

    expect(modalDataType).toContain('initialPrompt?: string')
    expect(composerStateArgs).toContain('initialPrompt: modalData.initialPrompt ??')
    expect(composerStateArgs).not.toContain("initialPrompt: ''")
  })
})
