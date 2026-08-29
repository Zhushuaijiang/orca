import type { PreloadApi } from '../../../../preload/api-types'
import type {
  DfHisEnvironmentCheckResult,
  DfHisEnvironmentConfigInput,
  DfHisEnvironmentConfigSnapshot,
  DfHisEnvironmentInstallResult
} from '../../../../shared/dfhis-environment-types'
import { callRuntimeResult } from './web-runtime-calls'

export function createDfHisEnvironmentApi(): NonNullable<PreloadApi['dfhisEnvironment']> {
  return {
    getConfig: async () => {
      const { config } = await callRuntimeResult<{ config: DfHisEnvironmentConfigSnapshot }>(
        'dfhisEnvironment.getConfig',
        undefined,
        15_000
      )
      return config
    },
    check: async () => {
      const { check } = await callRuntimeResult<{ check: DfHisEnvironmentCheckResult }>(
        'dfhisEnvironment.check',
        undefined,
        120_000
      )
      return check
    },
    install: async (config?: DfHisEnvironmentConfigInput) => {
      const { result } = await callRuntimeResult<{ result: DfHisEnvironmentInstallResult }>(
        'dfhisEnvironment.install',
        config,
        600_000
      )
      return result
    }
  }
}
