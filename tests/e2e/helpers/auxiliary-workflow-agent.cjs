const { appendFileSync, writeFileSync } = require('node:fs')
const { basename, join } = require('node:path')
const { pathToFileURL } = require('node:url')
const { randomUUID } = require('node:crypto')

const args = process.argv.slice(2)
const agent = basename(process.argv[1]).startsWith('claude') ? 'claude' : 'codex'
const sessionId = randomUUID()
const modelIndex = args.findIndex((value) => value === '--model' || value === '-m')
const model = modelIndex !== -1 ? args[modelIndex + 1] : undefined
const ledger = (event, extra = {}) =>
  appendFileSync(
    process.env.ORCA_E2E_AUXILIARY_LEDGER,
    `${JSON.stringify({ event, agent, args, model, pid: process.pid, at: Date.now(), ...extra })}\n`
  )
const implementation =
  "export function formatDisplayName(first, last) { if (typeof first !== 'string' || typeof last !== 'string') throw new TypeError('strings required'); return [first.trim(), last.trim()].filter(Boolean).join(' ') || 'Anonymous' }\n"

if (args.includes('app-server')) {
  process.exit(2)
}
if (args.includes('--help')) {
  process.stdout.write(`Usage: ${agent} [OPTIONS] [PROMPT]\n`)
  process.exit(0)
}

if (process.env.ORCA_AUXILIARY_REQUEST === '1') {
  let prompt = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    prompt += chunk.toString()
  })
  process.stdin.on('end', () => {
    const task = /Auxiliary task: ([^.]+)\./.exec(prompt)?.[1]
    ledger('analysis', { task })
    const blocked = prompt.includes('E2E_UNRESOLVED_BUSINESS_RULE')
    const answer = /Code review|Task decomposition/.test(task ?? '')
      ? JSON.stringify({
          status: blocked ? 'needs_clarification' : 'ready_to_build',
          summary: 'Evidence reviewed',
          plan: ['Implement formatDisplayName', 'Run regression tests'],
          acceptanceCriteria: ['Reject non-strings', 'Trim and join names'],
          blockingQuestions: blocked ? ['Choose the missing business rule'] : []
        })
      : `${task}: Require strings, trim names, join nonempty names and use Anonymous for empty output.`
    process.stdout.write(answer)
  })
} else {
  ledger('interactive-start')
  const status = (state, prompt, message) =>
    process.stdout.write(
      `\x1b]9999;${JSON.stringify({
        state,
        prompt,
        agentType: agent,
        providerSession: { key: 'session_id', id: sessionId },
        ...(message ? { lastAssistantMessage: message } : {})
      })}\x07`
    )
  const ready = () =>
    process.stdout.write(
      `\x1b]0;${agent === 'codex' ? 'Codex Ready' : '✳ Claude Code'}\x07OpenAI Codex\nmodel: ${model}\ndirectory: e2e\n\x1b[?2004h\x1b[?2026h› \x1b[?2026l\x1b[?25h`
    )
  let working = false
  async function handle(prompt) {
    if (working) {
      return
    }
    if (
      !/Auxiliary task: (implementation|testing)|Orca Yunxiao review handoff|Yunxiao todo pool claim:|Orca 云效审核结果|Orca 需求审核第|Orca 需求最终审核结果/.test(
        prompt
      )
    ) {
      return
    }
    working = true
    status('working', prompt)
    try {
      if (prompt.includes('Orca 需求最终审核结果')) {
        ledger('final-review-received', { prompt })
        status('done', prompt, '三轮审核完成，等待用户最终确认。')
      } else if (prompt.includes('Orca 云效审核结果') || prompt.includes('Orca 需求审核第')) {
        ledger('repair-received', { prompt })
        if (prompt.includes('第 3/3')) {
          ledger('final-review-received', { prompt })
        }
        writeFileSync(join(process.cwd(), 'format-display-name.mjs'), implementation)
        writeFileSync(
          join(process.cwd(), 'repair-receipt.json'),
          JSON.stringify({ received: true, agent, reviewerMessage: prompt, verified: true })
        )
        status(
          'done',
          prompt,
          prompt.includes('第 3/3')
            ? '共同目标达成、双方证据充分，无剩余分歧。\nORCA_DISCUSSION_AGREEMENT: agreed'
            : '修复空值问题；仍需补充 null 输入回归证据，由对方复核。\nORCA_DISCUSSION_AGREEMENT: disputed'
        )
      } else if (prompt.includes('Orca Yunxiao review handoff')) {
        ledger('review-only')
        await new Promise((resolve) => setTimeout(resolve, 300))
        status(
          'done',
          prompt,
          prompt.includes('当前第 1/3')
            ? 'P1: format-display-name.mjs must return Anonymous when both trimmed names are empty. Original agent: fix this and run format-display-name.test.mjs.\nORCA_REVIEW_VERDICT: changes_requested'
            : prompt.includes('当前第 2/3')
              ? '采纳 Anonymous 修复；同意原智能体意见，尚缺 null 回归证据。\nORCA_REVIEW_VERDICT: changes_requested'
              : '原有分歧均已解决，需求目标、边界和回归证据充分。\nORCA_REVIEW_VERDICT: passed'
        )
      } else if (
        prompt.includes('Auxiliary task: implementation') ||
        prompt.includes('Auxiliary task: testing')
      ) {
        const task = prompt.includes('Auxiliary task: implementation')
          ? 'implementation'
          : 'testing'
        ledger('worker', { task })
        if (task === 'implementation') {
          writeFileSync(join(process.cwd(), 'format-display-name.mjs'), implementation)
        } else {
          writeFileSync(
            join(process.cwd(), 'format-display-name.test.mjs'),
            "import assert from 'node:assert/strict'; import {formatDisplayName} from './format-display-name.mjs'; assert.equal(formatDisplayName(' Ada ', ' Lovelace '), 'Ada Lovelace'); assert.equal(formatDisplayName('', ''), 'Anonymous'); assert.throws(() => formatDisplayName(null, ''), TypeError); console.log('DISPLAY_NAME_TESTS_PASSED');\n"
          )
        }
        const taskId = /--task-id ([\w-]+)/.exec(prompt)?.[1]
        const dispatchId = /--dispatch-id ([\w-]+)/.exec(prompt)?.[1]
        const handle = /orchestration send --from ([\w-]+)/.exec(prompt)?.[1]
        if (!taskId || !dispatchId || !handle) {
          throw new Error('Missing authoritative worker preamble')
        }
        const { runProcess } = await import(
          pathToFileURL(process.env.ORCA_E2E_CHILD_PROCESS_MODULE).href
        )
        const result = await runProcess({
          program: process.env.ORCA_E2E_NODE_BIN,
          args: [
            process.env.ORCA_E2E_CLI_ENTRY,
            'orchestration',
            'send',
            '--from',
            handle,
            '--type',
            'worker_done',
            '--subject',
            `${task} complete`,
            '--body',
            'The scoped task is complete. The fixture output is written. No work remains.',
            '--task-id',
            taskId,
            '--dispatch-id',
            dispatchId,
            '--outcome',
            'succeeded',
            '--json'
          ],
          env: {
            ...process.env,
            ORCA_USER_DATA_PATH: process.env.ORCA_E2E_USER_DATA_DIR,
            ORCA_DEV_CLI_INVOCATION: '1'
          }
        })
        ledger('worker-done', {
          task,
          code: result.code,
          stdout: result.stdout,
          stderr: result.stderr
        })
        if (result.code !== 0) {
          throw new Error('Worker completion refused')
        }
        status('done', prompt, `${task} completed`)
      } else {
        ledger('original-ready')
        await new Promise((resolve) => setTimeout(resolve, 300))
        status('done', prompt, 'Implementation is complete. Awaiting independent review.')
      }
    } catch (error) {
      ledger('failure', { message: String(error) })
      status('done', prompt, String(error))
    } finally {
      working = false
      ready()
    }
  }
  ready()
  const initial = args.find((arg) =>
    /Yunxiao todo pool claim:|Orca Yunxiao review handoff/.test(arg)
  )
  if (initial) {
    setTimeout(() => {
      void handle(initial)
    }, 700)
  }
  let input = ''
  process.stdin.setRawMode?.(true)
  process.stdin.on('data', (chunk) => {
    input += chunk.toString()
    if (input.includes('\r')) {
      const prompt = input.replaceAll('\x1b[200~', '').replaceAll('\x1b[201~', '')
      input = ''
      void handle(prompt)
    }
  })
  process.stdin.resume()
  setInterval(() => {}, 60_000)
}
