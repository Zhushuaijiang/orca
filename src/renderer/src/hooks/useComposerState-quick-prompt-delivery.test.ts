import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Why: the upstream merge split useComposerState.ts; the fork prompt-seed logic now lives in these modules.
const QUICK_CREATION_SOURCE = readFileSync(
  join(__dirname, 'composer-state/quick-creation-execution.ts'),
  'utf8'
)
const FOLDER_SUBMIT_SOURCE = readFileSync(
  join(__dirname, 'composer-state/folder-submit-orchestration.ts'),
  'utf8'
)

describe('useComposerState quick prompt delivery', () => {
  it('sends composer prompt text through quick-create and folder-create startup paths', () => {
    expect(QUICK_CREATION_SOURCE).toContain(
      'resolveQuickCreateLinkedWorkItemPrompt(promptLinkedWorkItem, trimmedNote, agentPrompt)'
    )
    expect(FOLDER_SUBMIT_SOURCE).toContain('promptSeed: agentPrompt')
  })
})
