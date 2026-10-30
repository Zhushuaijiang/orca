import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

// Mirrors load_dfhis_config in yunxiao-requirement-archiver/scripts/upload_yunxiao_attachment.py.
export function dfHisConfigPaths(env = process.env) {
  const paths = []
  if (env.ORCA_USER_DATA_PATH) {
    paths.push(path.join(env.ORCA_USER_DATA_PATH, 'dfhis-environment.json'))
  }
  const home = homedir()
  paths.push(
    path.join(home, 'Library', 'Application Support', 'orca-dev', 'dfhis-environment.json'),
    path.join(home, 'Library', 'Application Support', 'orca', 'dfhis-environment.json'),
    path.join(home, 'AppData', 'Roaming', 'orca-dev', 'dfhis-environment.json'),
    path.join(home, 'AppData', 'Roaming', 'orca', 'dfhis-environment.json'),
    path.join(home, 'AppData', 'Roaming', 'Orca', 'dfhis-environment.json')
  )
  return paths
}

export function loadDfHisEnvironmentConfig(env = process.env, paths = dfHisConfigPaths(env)) {
  for (const filePath of paths) {
    try {
      return JSON.parse(readFileSync(filePath, 'utf8'))
    } catch {
      continue
    }
  }
  return {}
}

// Resolution order: --rc-e2e/--no-rc-e2e > HIS_RC_E2E_GATE > dfhis-environment.json hisWorkflow.rcE2eGate > false.
export function resolveRcE2eGate(options = {}, env = process.env) {
  if (options.rcE2e === true) {
    return { enabled: true, source: 'cli' }
  }
  if (options.noRcE2e === true) {
    return { enabled: false, source: 'cli' }
  }
  const variable = String(env.HIS_RC_E2E_GATE ?? '')
    .trim()
    .toLowerCase()
  if (['1', 'true'].includes(variable)) {
    return { enabled: true, source: 'env' }
  }
  if (['0', 'false'].includes(variable)) {
    return { enabled: false, source: 'env' }
  }
  const config = loadDfHisEnvironmentConfig(env)
  if (typeof config?.hisWorkflow?.rcE2eGate === 'boolean') {
    return { enabled: config.hisWorkflow.rcE2eGate, source: 'config' }
  }
  return { enabled: false, source: 'default' }
}
