import { describe, expect, it } from 'vitest'
import type { FileWithMtime } from './session-scanner-types'
import { parseCodebuddySessionContent } from './session-scanner-codebuddy-parser'

const SESSION_ID = 'ac5f27cc-7895-480f-91a5-334f114bb403'

function fileAt(path: string): FileWithMtime {
  return { path, mtimeMs: 1_786_093_061_000, modifiedAt: '2026-08-06T09:17:41.000Z' }
}

// Mirrors a real ~/.codebuddy/projects/<encoded-cwd>/<sessionId>.jsonl produced
// by CodeBuddy Code: message records with top-level role/content, epoch-millis
// timestamps, ai-title/summary records, and OpenAI-style providerData.usage.
const REAL_SHAPED_LINES = [
  JSON.stringify({
    id: '439bf69f-d8ee-4fca-a2eb-228495728a42',
    timestamp: 1786092993655,
    type: 'message',
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: '<system-reminder data-role="command-caveat">Caveat: local command output</system-reminder>'
      }
    ],
    providerData: { skipRun: true },
    sessionId: SESSION_ID,
    cwd: '/Users/demo/workspace/yunxiao'
  }),
  JSON.stringify({
    id: '71f44378-07e3-4ed2-8866-989c1cb55c32',
    timestamp: 1786092993700,
    type: 'message',
    role: 'user',
    content: [{ type: 'input_text', text: '你是谁？' }],
    sessionId: SESSION_ID,
    cwd: '/Users/demo/workspace/yunxiao'
  }),
  JSON.stringify({
    timestamp: 1786093052469,
    type: 'ai-title',
    aiTitle: 'Ask about assistant identity',
    sessionId: SESSION_ID,
    cwd: '/Users/demo/workspace/yunxiao'
  }),
  JSON.stringify({
    id: 'bd5237fe-eaa2-4023-9f84-36f1f9e9b8b7',
    timestamp: 1786093061853,
    type: 'reasoning',
    providerData: { model: 'hy3' },
    content: [],
    rawContent: [{ type: 'reasoning_text', text: 'The user asks who I am.' }],
    sessionId: SESSION_ID,
    cwd: '/Users/demo/workspace/yunxiao'
  }),
  JSON.stringify({
    id: 'e9acd0206d2643a3ae8f47d89d44b3ac',
    timestamp: 1786093061900,
    type: 'function_call',
    name: 'Bash',
    providerData: {
      model: 'hy3',
      usage: {
        requests: 1,
        inputTokens: 24178,
        outputTokens: 301,
        totalTokens: 24479,
        inputTokensDetails: [{ cached_tokens: 560 }],
        outputTokensDetails: [{ reasoning_tokens: 176 }]
      }
    },
    sessionId: SESSION_ID,
    cwd: '/Users/demo/workspace/yunxiao'
  }),
  JSON.stringify({
    id: '80119c54986945db9eea429393a1c191',
    timestamp: 1786093061873,
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text: '我是 CodeBuddy Code CLI 助手。' }],
    providerData: { model: 'hy3' },
    sessionId: SESSION_ID,
    cwd: '/Users/demo/workspace/yunxiao'
  }),
  JSON.stringify({
    timestamp: 1786093061872,
    type: 'summary',
    summary: '你是谁？',
    providerData: { source: 'initial-user-message' },
    sessionId: SESSION_ID,
    cwd: '/Users/demo/workspace/yunxiao'
  })
]

async function parseLines(lines: string[], fileName = `${SESSION_ID}.jsonl`) {
  return parseCodebuddySessionContent(
    fileAt(`/Users/demo/.codebuddy/projects/Users-demo-workspace-yunxiao/${fileName}`),
    `${lines.join('\n')}\n`,
    'darwin'
  )
}

describe('parseCodebuddySessionContent', () => {
  it('parses a real-shaped transcript into a vault session', async () => {
    const session = await parseLines(REAL_SHAPED_LINES)
    expect(session).toMatchObject({
      agent: 'codebuddy',
      sessionId: SESSION_ID,
      title: 'Ask about assistant identity',
      cwd: '/Users/demo/workspace/yunxiao',
      model: 'hy3',
      messageCount: 3,
      totalTokens: 24479
    })
    expect(session?.createdAt).toBe('2026-08-07T08:56:33.655Z')
    expect(session?.updatedAt).toBe('2026-08-07T08:57:41.900Z')
    expect(session?.resumeCommand).toBe(
      "cd '/Users/demo/workspace/yunxiao' && codebuddy --resume 'ac5f27cc-7895-480f-91a5-334f114bb403'"
    )
  })

  it('carves cached/reasoning tokens out of the reported totals', async () => {
    const session = await parseLines(REAL_SHAPED_LINES)
    expect(session?.tokenUsage).toEqual({
      input: 23618,
      cacheRead: 560,
      cacheWrite: 0,
      output: 125,
      reasoning: 176,
      total: 24479
    })
    expect(session?.tokenUsageByModel).toEqual({
      hy3: {
        input: 23618,
        cacheRead: 560,
        cacheWrite: 0,
        output: 125,
        reasoning: 176,
        total: 24479
      }
    })
  })

  it('previews user and assistant turns but not reasoning or tool records', async () => {
    const session = await parseLines(REAL_SHAPED_LINES)
    // The command-caveat turn is a hidden system-reminder block: no preview row.
    expect(session?.previewMessages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(session?.previewMessages[0].text).toBe('你是谁？')
    expect(session?.previewMessages[0].timestamp).toBe('2026-08-07T08:56:33.700Z')
  })

  it('falls back to the summary, then the first user prompt, when no ai-title exists', async () => {
    const withoutAiTitle = REAL_SHAPED_LINES.filter((line) => !line.includes('"ai-title"'))
    expect((await parseLines(withoutAiTitle))?.title).toBe('你是谁？')

    const bare = REAL_SHAPED_LINES.filter(
      (line) => !line.includes('"ai-title"') && !line.includes('"summary"')
    )
    expect((await parseLines(bare))?.title).toBe('你是谁？')
  })

  it('never titles from an injected command-caveat turn', async () => {
    const caveatOnly = [REAL_SHAPED_LINES[0]]
    const session = await parseLines(caveatOnly)
    expect(session?.title).toBe(`CodeBuddy ${SESSION_ID.slice(0, 8)}`)
  })

  it('falls back to the file name when records carry no session id', async () => {
    const anonymous = [
      JSON.stringify({ timestamp: 1786092993655, type: 'message', role: 'user', content: [] })
    ]
    const session = await parseLines(anonymous, 'not-a-session.jsonl')
    expect(session?.sessionId).toBe('not-a-session')
  })
})
