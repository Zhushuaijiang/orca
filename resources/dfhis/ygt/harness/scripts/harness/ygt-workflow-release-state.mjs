import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const RETRYABLE_STAGES = new Set(['doctor', 'jenkins', 'rollout', 'smoke', 'report']);
const STAGE_ATTEMPTS = { doctor: 3, jenkins: 3, rollout: 3, smoke: 5, report: 2 };

export function releaseStatePath(repoDir, taskId, explicitPath) {
  return explicitPath
    ? resolve(explicitPath)
    : resolve(repoDir, '.ygt-runs', taskId, 'release-state.json');
}

export function createReleaseState({ action, project, repoDir, branch, taskId, stages }) {
  const now = Date.now();
  return {
    schemaVersion: 1,
    runId: taskId,
    action,
    project,
    repoDir: resolve(repoDir),
    branch,
    status: 'running',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    error: null,
    stages: Object.fromEntries(
      stages.map((name) => [name, { status: 'pending', attempts: 0, external: {}, error: null }])
    ),
    recovery: [],
  };
}

export async function loadReleaseState(filePath) {
  const state = JSON.parse(await readFile(filePath, 'utf8'));
  if (state.schemaVersion !== 1 || !state.stages) {
    throw new Error('Unsupported YGT release state schema.');
  }
  return state;
}

export async function saveReleaseState(filePath, state) {
  await mkdir(dirname(filePath), { recursive: true });
  state.updatedAt = Date.now();
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, filePath);
}

export function prepareReleaseResume(state, identity) {
  for (const key of ['project', 'repoDir', 'branch']) {
    const expected = key === 'repoDir' ? resolve(identity[key]) : identity[key];
    const actual = key === 'repoDir' ? resolve(state[key]) : state[key];
    if (actual !== expected) {
      throw new Error(`Cannot resume YGT release: ${key} changed (${actual} -> ${expected}).`);
    }
  }
  for (const [name, stage] of Object.entries(state.stages)) {
    if (stage.status === 'running' || stage.status === 'recovering') {
      stage.status = name === 'jenkins' && (stage.external.queueUrl || stage.external.buildUrl)
        ? 'recovering'
        : 'pending';
      state.recovery.push({ stage: name, action: 'interrupted-stage-recovered', at: Date.now() });
    } else if (stage.status === 'failed') {
      stage.status = 'pending';
      stage.attempts = 0;
      state.recovery.push({ stage: name, action: 'operator-resume', at: Date.now() });
    }
  }
  state.status = 'running';
  state.completedAt = null;
  state.error = null;
}

export function classifyReleaseError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b(401|403)\b|forbidden|unauthorized|credential|token|password/i.test(message)) {
    return { kind: 'authorization', retryable: false };
  }
  if (/ECONN(?:RESET|REFUSED)|ETIMEDOUT|fetch failed|HTTP 5\d\d|timed out|timeout|temporar/i.test(message)) {
    return { kind: 'transient', retryable: true };
  }
  if (/missing|not found|required|unknown|invalid/i.test(message)) {
    return { kind: 'configuration', retryable: false };
  }
  return { kind: 'verification', retryable: false };
}

function retryDelay(attempt, baseMs, random) {
  const jitter = 0.75 + random() * 0.5;
  return Math.round(Math.min(baseMs * 2 ** (attempt - 1), 60_000) * jitter);
}

export async function executeReleaseState(context, callbacks) {
  const { state, persist } = context;
  for (const name of Object.keys(state.stages)) {
    const stage = state.stages[name];
    if (stage.status === 'passed') {continue;}
    const maximum = Number(context.options.maxAttempts ?? STAGE_ATTEMPTS[name] ?? 1);
    while (stage.attempts < maximum) {
      stage.status = stage.status === 'recovering' ? 'recovering' : 'running';
      stage.attempts += 1;
      stage.startedAt = Date.now();
      stage.error = null;
      await persist();
      try {
        await callbacks.runStage(name, context);
        stage.status = 'passed';
        stage.completedAt = Date.now();
        await persist();
        break;
      } catch (error) {
        const failure = classifyReleaseError(error);
        stage.error = error instanceof Error ? error.message : String(error);
        stage.failureKind = failure.kind;
        const retry = RETRYABLE_STAGES.has(name) && failure.retryable && stage.attempts < maximum;
        stage.status = retry ? 'retrying' : 'failed';
        await persist();
        if (!retry) {
          if (name === 'smoke') {
            const rolledBack = await callbacks.rollback?.(context, error) === true;
            state.recovery.push({
              stage: name,
              action: rolledBack ? 'rollback-completed' : 'rollback-required',
              at: Date.now(),
            });
            await persist();
          }
          throw error;
        }
        const delayMs = retryDelay(
          stage.attempts,
          Number(context.options.retryBaseMs ?? 2_000),
          context.random ?? Math.random
        );
        state.recovery.push({ stage: name, action: 'retry-scheduled', delayMs, at: Date.now() });
        await persist();
        await (context.sleep ?? ((duration) => new Promise((resolve) => setTimeout(resolve, duration))))(delayMs);
      }
    }
  }
}
