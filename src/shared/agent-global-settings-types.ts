import type { NativeChatGlobalSettings } from './native-chat-appearance-settings'
import type { AuxiliaryModelSettings } from './auxiliary-model-types'

export type AgentGlobalSettings = NativeChatGlobalSettings & {
  auxiliaryModels?: AuxiliaryModelSettings
}
