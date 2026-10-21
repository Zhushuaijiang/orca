import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect } from './helpers/orca-app'
import {
  test,
  auxiliaryModels,
  commands,
  ledger,
  ledgerPath,
  cliEntry
} from './helpers/auxiliary-workflow-fixture'
import { FAKE_AGENT_WINDOWS_SHELL } from './helpers/fake-agent-command-override'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { waitForActivePaneHookDescriptor } from './helpers/terminal'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { runProcess } from '../../src/shared/child-process/run-process'

test('discusses, dispatches task models, settles workers and returns review to the original terminal', async ({
  orcaPage,
  electronApp,
  testRepoPath
}, testInfo) => {
  test.setTimeout(240_000)
  await waitForSessionReady(orcaPage)
  const worktreeId = await waitForActiveWorktree(orcaPage)
  const pane = await waitForActivePaneHookDescriptor(orcaPage)
  const profile = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  const client = new RuntimeClient(profile, 30_000, null, null)
  let callerHandle: string | undefined
  await orcaPage.evaluate(
    async ({ models, commands, shell }) => {
      const store = window.__store
      if (!store) {
        throw new Error('Store unavailable')
      }
      await store.getState().updateSettings({
        defaultTuiAgent: 'codex',
        auxiliaryModels: models,
        agentCmdOverrides: commands,
        terminalWindowsShell: shell
      })
    },
    { models: auxiliaryModels, commands, shell: FAKE_AGENT_WINDOWS_SHELL }
  )
  const invoke = async (args: string[]) => {
    const result = await runProcess({
      program: process.execPath,
      args: [cliEntry, ...args],
      env: {
        ...process.env,
        ORCA_USER_DATA_PATH: profile,
        ...(callerHandle ? { ORCA_TERMINAL_HANDLE: callerHandle } : {}),
        ORCA_DEV_CLI_INVOCATION: '1'
      },
      timeoutMs: 60_000
    })
    expect(result.code, result.stderr || result.stdout).toBe(0)
    return JSON.parse(result.stdout)
  }
  const blocked = await runProcess({
    program: process.execPath,
    args: [
      cliEntry,
      'auxiliary',
      'discuss',
      '--prompt',
      'E2E_UNRESOLVED_BUSINESS_RULE',
      '--primary-agent',
      'codex',
      '--worktree',
      `id:${worktreeId}`,
      '--json'
    ],
    env: { ...process.env, ORCA_USER_DATA_PATH: profile },
    timeoutMs: 60_000
  })
  expect(blocked.code).toBe(1)
  expect(JSON.parse(blocked.stdout).result.status).toBe('needs_clarification')
  expect(ledger().filter((event) => event.event === 'worker')).toHaveLength(0)
  expect(existsSync(path.join(testRepoPath, 'format-display-name.mjs'))).toBe(false)
  const discussion = await invoke([
    'auxiliary',
    'discuss',
    '--prompt',
    'Implement formatDisplayName: string arguments only; trim and join names; empty result is Anonymous; reject null. No external decisions remain.',
    '--primary-agent',
    'codex',
    '--worktree',
    `id:${worktreeId}`,
    '--json'
  ])
  expect(discussion.result.status).toBe('ready_to_build')
  expect(
    discussion.result.stages.map((entry: { answer: { modelId: string } }) => entry.answer.modelId)
  ).toEqual(['haiku', 'gpt-6.1-sol', 'gpt-6.1-sol', 'gpt-6.1-sol'])
  const coordinator = await client.call<{ terminal: { handle: string } }>('terminal.resolvePane', {
    paneKey: pane.paneKey
  })
  const handle = coordinator.result.terminal.handle
  callerHandle = handle
  const created = await client.call<{ run: { id: string } }>('orchestration.runCreate', {
    objective: 'Auxiliary requirement workflow E2E',
    from: handle
  })
  for (const task of ['implementation', 'testing']) {
    const started = await invoke([
      'auxiliary',
      'run',
      task,
      '--prompt',
      `Target: format-display-name.mjs and format-display-name.test.mjs in this test workspace. Change: ${task}. Constraints: no other files or external actions. Ownership: this task owns these two files until settlement. Acceptance: strict string inputs, trimmed display name and regression tests.`,
      '--primary-agent',
      'codex',
      '--worktree',
      `id:${worktreeId}`,
      '--from',
      handle,
      '--run',
      created.result.run.id,
      '--json'
    ])
    expect(started.result.state).toBe('ready')
    const dispatchId = started.result.dispatchId
    await expect
      .poll(
        () =>
          ledger().filter(
            (event) => event.event === 'worker-done' && event.task === task && event.code === 0
          ).length,
        { timeout: 30_000 }
      )
      .toBe(1)
    await invoke(['orchestration', 'worker-release', '--dispatch', dispatchId, '--json'])
    const delivery = await invoke(['orchestration', 'check', '--terminal', handle, '--json'])
    if (delivery.result.deliveryId) {
      await invoke([
        'orchestration',
        'check',
        '--terminal',
        handle,
        '--ack',
        delivery.result.deliveryId,
        '--json'
      ])
    }
  }
  expect(
    ledger().find((event) => event.event === 'worker' && event.task === 'implementation')?.args
  ).toEqual(expect.arrayContaining(['--model', 'sonnet', '--effort', 'high']))
  expect(
    ledger().find((event) => event.event === 'worker' && event.task === 'testing')?.args
  ).toEqual(expect.arrayContaining(['--model', 'sonnet', '--effort', 'medium']))
  const beforeReview = await runProcess({
    program: process.execPath,
    args: [path.join(testRepoPath, 'format-display-name.test.mjs')],
    cwd: testRepoPath
  })
  expect(beforeReview.code, beforeReview.stderr).toBe(0)
  writeFileSync(
    path.join(testRepoPath, 'format-display-name.mjs'),
    "export function formatDisplayName(first, last) { return [first.trim(), last.trim()].filter(Boolean).join(' ') }\n"
  )
  await client.call('yunxiao.addTodoPoolItems', {
    items: [
      {
        id: 'e2e-requirement',
        serialNumber: 'DFHIS-99999999',
        title: 'Isolated auxiliary workflow fixture',
        category: 'Req',
        typeName: '需求',
        statusId: 'todo',
        statusName: '待处理',
        customer: null,
        priority: null,
        assignee: null,
        participants: [],
        sprint: null,
        updatedAt: null,
        url: null
      }
    ]
  })
  const automation = await client.call<{ automation: { id: string } }>('automation.create', {
    name: 'E2E review return',
    prompt: 'This is a local test fixture. Do not contact Yunxiao or any external service.',
    agentId: 'claude',
    workspaceMode: 'existing',
    workspace: `id:${worktreeId}`,
    reuseSession: false,
    timezone: 'UTC',
    rrule: 'FREQ=HOURLY',
    dtstart: Date.now() + 86_400_000,
    enabled: false,
    yunxiaoTodoPool: {
      kind: 'yunxiao-todo-pool',
      statuses: ['queued'],
      batchSize: 1
    }
  })
  await client.call('automation.runNow', { id: automation.result.automation.id })
  try {
    await expect
      .poll(() => ledger().filter((event) => event.event === 'repair-received').length, {
        timeout: 45_000
      })
      .toBeGreaterThanOrEqual(2)
  } catch (error) {
    console.log(
      'Review return diagnostics:',
      JSON.stringify(
        (await client.call('automation.runs', { automationId: automation.result.automation.id }))
          .result
      )
    )
    console.log(
      'Renderer terminal diagnostics:',
      await orcaPage.evaluate(() =>
        JSON.stringify({
          statuses: window.__store?.getState().agentStatusByPaneKey,
          tabs: window.__store?.getState().tabsByWorktree
        })
      )
    )
    throw error
  }
  await expect
    .poll(() => ledger().filter((event) => event.event === 'final-review-received').length, {
      timeout: 45_000
    })
    .toBe(1)
  expect(ledger().filter((event) => event.event === 'review-only')).toHaveLength(3)
  expect(ledger().filter((event) => event.event === 'failure')).toHaveLength(0)
  const receipt = JSON.parse(readFileSync(path.join(testRepoPath, 'repair-receipt.json'), 'utf8'))
  expect(receipt.received).toBe(true)
  expect(receipt.agent).toBe('claude')
  expect(ledger().filter((event) => event.event === 'repair-received')).toHaveLength(3)
  expect(receipt.verified).toBe(true)
  const originalTab = orcaPage.getByText('DFHIS-99999999', { exact: false }).first()
  await originalTab.click()
  await orcaPage
    .locator('.xterm:visible')
    .first()
    .click({ button: 'right', position: { x: 180, y: 60 } })
  await expect(
    orcaPage.getByRole('menuitem', { name: /Confirm discussion consensus|确认讨论共识/ })
  ).toBeVisible()
  await orcaPage
    .getByRole('menuitem', { name: /Confirm discussion consensus|确认讨论共识/ })
    .click()
  await expect(orcaPage.getByText(/^(Requirement review confirmed|需求审核已确认)$/)).toBeVisible()
  const repaired = await runProcess({
    program: process.execPath,
    args: [path.join(testRepoPath, 'format-display-name.test.mjs')],
    cwd: testRepoPath
  })
  expect(repaired.code, repaired.stderr).toBe(0)
  const reclaimable = await invoke([
    'orchestration',
    'worker-list',
    '--run',
    created.result.run.id,
    '--terminal-state',
    'reclaimable',
    '--json'
  ])
  expect(reclaimable.result.workers).toHaveLength(0)
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((window) => window.isVisible())
    )
  ).toBe(false)
  await orcaPage.screenshot({ path: testInfo.outputPath('workflow-completed.png') })
  await testInfo.attach('discussion', {
    body: JSON.stringify(discussion, null, 2),
    contentType: 'application/json'
  })
  await testInfo.attach('actor-ledger', {
    body: readFileSync(ledgerPath),
    contentType: 'application/jsonl'
  })
})
