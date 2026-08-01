import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  classifyReleaseError,
  createReleaseState,
  executeReleaseState,
  loadReleaseState,
  prepareReleaseResume,
  saveReleaseState
} from '../../resources/dfhis/ygt/harness/scripts/harness/ygt-workflow-release-state.mjs'

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function createState(stages = ['doctor', 'jenkins', 'smoke']) {
  return createReleaseState({
    action: 'full',
    project: 'df-ygt-main',
    repoDir: '/workspace/df-ygt-main',
    branch: 'feature/test',
    taskId: 'ygt-test',
    stages
  })
}

describe('YGT durable release state', () => {
  it('atomically persists release state and Jenkins external references', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ygt-release-state-'))
    temporaryDirectories.push(directory)
    const filePath = path.join(directory, 'release-state.json')
    const state = createState()
    state.stages.jenkins.external.queueUrl = 'http://jenkins/queue/item/1/'
    await saveReleaseState(filePath, state)
    await expect(loadReleaseState(filePath)).resolves.toMatchObject({
      runId: 'ygt-test',
      stages: { jenkins: { external: { queueUrl: 'http://jenkins/queue/item/1/' } } }
    })
  })

  it('retries transient infrastructure failures but stops on authorization gates', async () => {
    expect(classifyReleaseError(new Error('fetch failed ECONNRESET'))).toEqual({
      kind: 'transient',
      retryable: true
    })
    expect(classifyReleaseError(new Error('HTTP 403 Forbidden'))).toEqual({
      kind: 'authorization',
      retryable: false
    })
    const state = createState(['doctor'])
    let attempts = 0
    await executeReleaseState(
      {
        state,
        options: { retryBaseMs: 0 },
        persist: async () => {},
        sleep: async () => {},
        random: () => 0.5
      },
      {
        runStage: async () => {
          attempts += 1
          if (attempts < 3) {
            throw new Error('HTTP 503 temporary failure')
          }
        }
      }
    )
    expect(attempts).toBe(3)
    expect(state.stages.doctor.status).toBe('passed')
    expect(state.recovery).toHaveLength(2)
  })

  it('resumes interrupted Jenkins monitoring without resetting external identity', () => {
    const state = createState()
    state.stages.doctor.status = 'passed'
    state.stages.jenkins.status = 'running'
    state.stages.jenkins.external.buildUrl = 'http://jenkins/job/ygt/42/'
    prepareReleaseResume(state, {
      project: state.project,
      repoDir: state.repoDir,
      branch: state.branch
    })
    expect(state.stages.doctor.status).toBe('passed')
    expect(state.stages.jenkins.status).toBe('recovering')
    expect(state.stages.jenkins.external.buildUrl).toContain('/42/')
  })

  it('refuses to resume on another branch', () => {
    const state = createState()
    expect(() =>
      prepareReleaseResume(state, {
        project: state.project,
        repoDir: state.repoDir,
        branch: 'main'
      })
    ).toThrow('branch changed')
  })

  it('records a rollback gate after final smoke failure', async () => {
    const state = createState(['smoke'])
    await expect(
      executeReleaseState(
        {
          state,
          options: { maxAttempts: 1 },
          persist: async () => {}
        },
        {
          runStage: async () => {
            throw new Error('Smoke failed: HTTP 503')
          },
          rollback: async () => false
        }
      )
    ).rejects.toThrow('Smoke failed')
    expect(state.recovery.at(-1)).toMatchObject({ action: 'rollback-required' })
  })
})
