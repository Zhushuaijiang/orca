import { join } from 'node:path'
import type { IncrementalAgentFixture } from './session-scanner-incremental-fixtures'
import { writeJsonlFile } from './session-scanner-test-fixtures'

const CODEBUDDY_SESSION_ID = 'dddddddd-eeee-4fff-8a0a-111111111111'

// Line builders for the incremental-parse differential tests, in CodeBuddy's
// real on-disk record shape: `type:'message'` with a top-level role/content,
// epoch-millis numeric timestamps, and OpenAI-style usage under providerData
// (inputTokens already includes cached_tokens).
export function codebuddyFixture(): IncrementalAgentFixture {
  const message = (role: 'user' | 'assistant', text: string, at: number) =>
    JSON.stringify({
      id: `${role}-record-${at}`,
      timestamp: at,
      type: 'message',
      role,
      content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }],
      providerData: role === 'assistant' ? { model: 'hy3' } : undefined,
      sessionId: CODEBUDDY_SESSION_ID,
      cwd: '/repo/app'
    })
  return {
    agent: 'codebuddy',
    fileName: `${CODEBUDDY_SESSION_ID}.jsonl`,
    seedLines: [
      message('user', 'codebuddy seed question', 1775008800000),
      JSON.stringify({
        timestamp: 1775008800123,
        type: 'summary',
        summary: 'codebuddy seed question',
        providerData: { source: 'initial-user-message' },
        sessionId: CODEBUDDY_SESSION_ID,
        cwd: '/repo/app'
      }),
      message('assistant', 'codebuddy seed answer', 1775008860000)
    ],
    appendLines: [
      message('user', 'codebuddy follow-up', 1775008900000),
      JSON.stringify({
        id: 'call-1',
        timestamp: 1775008901000,
        type: 'function_call',
        name: 'Bash',
        providerData: {
          model: 'hy3',
          usage: {
            requests: 1,
            inputTokens: 120,
            outputTokens: 30,
            totalTokens: 150,
            inputTokensDetails: [{ cached_tokens: 40 }],
            outputTokensDetails: [{ reasoning_tokens: 10 }]
          }
        },
        sessionId: CODEBUDDY_SESSION_ID,
        cwd: '/repo/app'
      }),
      message('assistant', 'codebuddy incremental answer', 1775008960000)
    ],
    truncatedLines: [
      message('user', 'codebuddy rewritten', 1775008800000),
      JSON.stringify({
        timestamp: 1775008800123,
        type: 'ai-title',
        aiTitle: 'CodeBuddy rewritten title',
        sessionId: CODEBUDDY_SESSION_ID,
        cwd: '/repo/app'
      })
    ]
  }
}

// One real-shaped transcript under <projects>/<encoded-cwd>/<sessionId>.jsonl
// for the scanner-wide fixture test.
export async function writeCodebuddyScannerFixture(projectsDir: string): Promise<void> {
  await writeJsonlFile(
    join(projectsDir, 'Users-demo-tmp-codebuddy', `${CODEBUDDY_SESSION_ID}.jsonl`),
    [
      {
        id: 'cb-user-1',
        timestamp: 1775008800000,
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'CodeBuddy vault title' }],
        sessionId: CODEBUDDY_SESSION_ID,
        cwd: '/tmp/codebuddy'
      },
      {
        id: 'cb-assistant-1',
        timestamp: 1775008860000,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'CodeBuddy reply' }],
        providerData: { model: 'hy3' },
        sessionId: CODEBUDDY_SESSION_ID,
        cwd: '/tmp/codebuddy'
      },
      {
        timestamp: 1775008865000,
        type: 'ai-title',
        aiTitle: 'CodeBuddy vault title',
        sessionId: CODEBUDDY_SESSION_ID,
        cwd: '/tmp/codebuddy'
      }
    ]
  )
}
