import type { GlobalSettingsBase } from './global-settings-base'
import type { AuxiliaryModelSettings } from './auxiliary-model-types'

export type AgentGlobalSettings = GlobalSettingsBase & {
  auxiliaryModels?: AuxiliaryModelSettings
}
