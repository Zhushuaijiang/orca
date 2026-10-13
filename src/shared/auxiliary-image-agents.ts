// Auxiliary image requests run through the agent's own image input, so only agents whose headless
// CLI accepts image files can execute the vision task.
export const AUXILIARY_IMAGE_AGENT_IDS = ['claude', 'openclaude', 'codex'] as const

export function auxiliaryAgentSupportsImages(agentId: string): boolean {
  return AUXILIARY_IMAGE_AGENT_IDS.some((id) => id === agentId)
}
