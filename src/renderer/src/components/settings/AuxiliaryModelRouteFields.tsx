import type { AuxiliaryModelRoute } from '../../../../shared/auxiliary-model-types'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  getCommitMessageModel,
  listCommitMessageAgentCapabilities
} from '../../../../shared/commit-message-agent-spec'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import { getAgentSessionOptionLaunchCatalog } from '../../../../shared/agent-session-option-launch'
import { translate } from '@/i18n/i18n'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'

type Props = {
  route: AuxiliaryModelRoute | undefined
  inherited: AuxiliaryModelRoute | undefined
  settings: GlobalSettings
  hostKey: string
  guarded: boolean
  workflow: boolean
  id: string
  onChange: (route: AuxiliaryModelRoute) => void
}

export function AuxiliaryModelRouteFields({
  route,
  inherited,
  settings,
  hostKey,
  guarded,
  workflow,
  id,
  onChange
}: Props): React.JSX.Element {
  const agents = listCommitMessageAgentCapabilities().filter(
    (agent) =>
      !settings.disabledTuiAgents?.includes(agent.id) &&
      (!guarded || ['claude', 'openclaude', 'kimi'].includes(agent.id)) &&
      (!workflow || Boolean(getAgentSessionOptionLaunchCatalog(agent.id)?.modelApply.launchArgs))
  )
  const parent = route?.agentId && route.agentId !== inherited?.agentId ? undefined : inherited
  const selectedAgent = route?.agentId ?? parent?.agentId ?? settings.defaultTuiAgent
  const agentId = selectedAgent === 'blank' ? null : selectedAgent
  const capability = agents.find((agent) => agent.id === agentId)
  const models = [
    ...(capability?.models ?? []),
    ...(agentId
      ? (settings.sourceControlAi?.discoveredModelsByAgentByHost?.[hostKey]?.[agentId] ?? [])
      : [])
  ].filter((model, index, all) => all.findIndex((candidate) => candidate.id === model.id) === index)
  const modelId = route?.modelsByHost?.[hostKey] ?? ''
  const effectiveModelId =
    modelId || parent?.modelsByHost?.[hostKey] || capability?.defaultModelId || ''
  const model =
    models.find((candidate) => candidate.id === effectiveModelId) ??
    (agentId ? getCommitMessageModel(agentId, effectiveModelId) : undefined)
  const updateModel = (value: string) => {
    const modelsByHost = { ...route?.modelsByHost }
    if (value.trim()) {
      modelsByHost[hostKey] = value.trim()
    } else {
      delete modelsByHost[hostKey]
    }
    const thinkingByHost = { ...route?.thinkingByHost }
    delete thinkingByHost[hostKey]
    onChange({ ...route, ...(agentId ? { agentId } : {}), modelsByHost, thinkingByHost })
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-agent`}>{translate('auxiliary.agent', 'Agent')}</Label>
          <Select
            value={route?.agentId ?? '__inherit'}
            onValueChange={(value) =>
              onChange({
                ...route,
                agentId: isTuiAgent(value) ? value : undefined,
                modelsByHost: undefined,
                thinkingByHost: undefined
              })
            }
          >
            <SelectTrigger id={`${id}-agent`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__inherit">
                {translate('auxiliary.inherit', 'Use default')}
              </SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-model`}>{translate('auxiliary.model', 'Model')}</Label>
          <Select
            value={modelId || '__inherit'}
            disabled={!capability}
            onValueChange={(value) => updateModel(value === '__inherit' ? '' : value)}
          >
            <SelectTrigger id={`${id}-model`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__inherit">
                {translate('auxiliary.inherit', 'Use default')}
              </SelectItem>
              {models.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.label}
                </SelectItem>
              ))}
              {modelId && !models.some((entry) => entry.id === modelId) ? (
                <SelectItem value={modelId}>{modelId}</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>
      </div>
      {capability?.modelSource === 'dynamic' ? (
        <div className="space-y-2">
          <Label htmlFor={`${id}-custom-model`}>
            {translate('auxiliary.customModel', 'Exact model ID (optional)')}
          </Label>
          <Input
            id={`${id}-custom-model`}
            value={modelId}
            placeholder={effectiveModelId}
            onChange={(event) => updateModel(event.target.value)}
          />
        </div>
      ) : null}
      {model?.thinkingLevels?.length ? (
        <div className="space-y-2">
          <Label htmlFor={`${id}-thinking`}>
            {translate('auxiliary.thinking', 'Reasoning effort')}
          </Label>
          <Select
            value={route?.thinkingByHost?.[hostKey] ?? '__inherit'}
            onValueChange={(value) => {
              const thinkingByHost = { ...route?.thinkingByHost }
              if (value === '__inherit') {
                delete thinkingByHost[hostKey]
              } else {
                thinkingByHost[hostKey] = value
              }
              onChange({
                ...route,
                ...(agentId ? { agentId } : {}),
                modelsByHost: { ...route?.modelsByHost, [hostKey]: effectiveModelId },
                thinkingByHost
              })
            }}
          >
            <SelectTrigger id={`${id}-thinking`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__inherit">
                {translate('auxiliary.inherit', 'Use default')}
              </SelectItem>
              {model.thinkingLevels.map((level) => (
                <SelectItem key={level.id} value={level.id}>
                  {level.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {!guarded && !workflow ? (
        <div className="flex items-center gap-2">
          <Switch
            id={`${id}-fallback`}
            checked={route?.fallbackToDefault ?? inherited?.fallbackToDefault ?? false}
            onCheckedChange={(fallbackToDefault) => onChange({ ...route, fallbackToDefault })}
          />
          <Label htmlFor={`${id}-fallback`}>
            {translate(
              'auxiliary.fallback',
              'Retry with the original task model if generation fails'
            )}
          </Label>
        </div>
      ) : null}
    </div>
  )
}
