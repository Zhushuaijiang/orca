import type { AgentLaunchExecution } from './agent-launch-executor'
import { automaticRoutingInstructions } from '../../shared/automatic-routing-instructions'

export function prepareAutomaticRoutingLaunch(
  execution: AgentLaunchExecution
): AgentLaunchExecution {
  const prompt = execution.intent.prompt
  if (prompt?.delivery !== 'submit' || !prompt.text) {
    return execution
  }
  const instruction = automaticRoutingInstructions(
    execution.runtime.getClientSettings()?.auxiliaryModels,
    execution.intent.agent
  )
  if (!instruction) {
    return execution
  }
  return {
    ...execution,
    intent: { ...execution.intent, prompt: { ...prompt, text: `${prompt.text}\n\n${instruction}` } }
  }
}
