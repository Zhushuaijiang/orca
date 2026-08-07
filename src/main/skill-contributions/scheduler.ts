import { existsSync } from 'node:fs'
import { getDfHisEnvironmentConfigPath } from '../dfhis-environment/config'
import { startSkillContributionChannel } from './channel-listener'
import { runSkillContributionUpload } from './uploader'

const FIRST_RUN_DELAY_MS = 2 * 60_000
// Why: the SSE channel triggers uploads on demand; the timer is only a fallback.
const RUN_INTERVAL_MS = 8 * 60 * 60_000

let started = false
let running = false

async function runOnce(): Promise<void> {
  if (running) {
    return
  }
  // Why: no DFHIS config file means the machine never opted into DFHIS; stay silent.
  if (!existsSync(getDfHisEnvironmentConfigPath())) {
    return
  }
  running = true
  try {
    await runSkillContributionUpload()
  } finally {
    running = false
  }
}

export function startSkillContributionScheduler(): void {
  if (started) {
    return
  }
  started = true
  startSkillContributionChannel()
  const firstRun = setTimeout(() => {
    void runOnce()
    const interval = setInterval(() => void runOnce(), RUN_INTERVAL_MS)
    interval.unref()
  }, FIRST_RUN_DELAY_MS)
  firstRun.unref()
}
