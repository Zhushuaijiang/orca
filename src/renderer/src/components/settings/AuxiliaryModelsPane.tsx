import { AuxiliaryTaskRouteCard } from './AuxiliaryTaskRouteCard'
import { useEffect, useState } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { TuiAgent } from '../../../../shared/tui-agent'
import {
  AUXILIARY_TASKS,
  type AuxiliaryModelRoute,
  type AuxiliaryTaskId
} from '../../../../shared/auxiliary-model-types'
import {
  normalizeAuxiliaryModelSettings,
  resolveAuxiliaryModelRoute
} from '../../../../shared/auxiliary-model-settings'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { AuxiliaryModelRouteFields } from './AuxiliaryModelRouteFields'
import { AuxiliaryTaskRunner } from './AuxiliaryTaskRunner'
import { AutomaticTaskRoutingCard } from './AutomaticTaskRoutingCard'
import { AutomaticRoutingHistory } from './AutomaticRoutingHistory'
import { AutomaticRoutingPreview } from './AutomaticRoutingPreview'
import { useAuxiliaryExecutionHost } from './use-auxiliary-execution-host'
import { SearchableSetting } from './SearchableSetting'
import { getAuxiliaryModelSearchEntries } from './auxiliary-model-search'

export function AuxiliaryModelsPane({
  settings,
  updateSettings,
  onDirtyChange
}: {
  settings: GlobalSettings
  onDirtyChange?: (dirty: boolean) => void
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}): React.JSX.Element {
  const [draft, setDraft] = useState(() =>
    normalizeAuxiliaryModelSettings(settings.auxiliaryModels)
  )
  const [profile, setProfile] = useState<TuiAgent | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const hostKey = useAuxiliaryExecutionHost(settings)
  const entries = getAuxiliaryModelSearchEntries()
  const change = (task: AuxiliaryTaskId, route?: AuxiliaryModelRoute) =>
    setDraft((current) => {
      const tasks = { ...(profile ? current.byPrimaryAgent?.[profile] : current.tasks) }
      if (route) {
        tasks[task] = route
      } else {
        delete tasks[task]
      }
      return profile
        ? { ...current, byPrimaryAgent: { ...current.byPrimaryAgent, [profile]: tasks } }
        : { ...current, tasks }
    })
  const dirty =
    JSON.stringify(normalizeAuxiliaryModelSettings(draft)) !==
    JSON.stringify(normalizeAuxiliaryModelSettings(settings.auxiliaryModels))
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await updateSettings({ auxiliaryModels: normalizeAuxiliaryModelSettings(draft) })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex gap-2 bg-background py-2">
        <Button disabled={saving || !dirty} onClick={() => void save()}>
          {saving ? translate('auxiliary.saving', 'Saving…') : translate('auxiliary.save', 'Save')}
        </Button>
        <Button
          variant="ghost"
          disabled={saving || !dirty}
          onClick={() => setDraft(normalizeAuxiliaryModelSettings(settings.auxiliaryModels))}
        >
          {translate('auxiliary.discard', 'Discard changes')}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={() => setDraft({})}>
          {translate('auxiliary.resetAll', 'Reset all tasks')}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {translate(
          'auxiliary.explanation',
          'Assign an agent and model to each task. Repository overrides take priority. Model selections apply to the current execution host.'
        )}
      </p>
      <div className="space-y-2">
        <Label htmlFor="auxiliary-profile">
          {translate('auxiliary.profile', 'Apply when the primary agent is')}
        </Label>
        <Select
          value={profile ?? '__all'}
          disabled={saving}
          onValueChange={(value) => setProfile(isTuiAgent(value) ? value : null)}
        >
          <SelectTrigger id="auxiliary-profile">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">{translate('auxiliary.all', 'All agents')}</SelectItem>
            {getAgentCatalog().map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        {translate('auxiliary.host', 'Execution host')}: {hostKey}
      </p>

      <fieldset disabled={saving} className="space-y-4">
        <AutomaticTaskRoutingCard
          value={draft.automatic}
          settings={{ ...settings, auxiliaryModels: draft }}
          hostKey={hostKey}
          onChange={(automatic) => setDraft((current) => ({ ...current, automatic }))}
        />
        {!profile ? (
          <Card>
            <CardContent>
              <div className="space-y-3">
                <h3 className="text-sm font-medium">
                  {translate('auxiliary.default', 'Default auxiliary model')}
                </h3>
                <AuxiliaryModelRouteFields
                  id="auxiliary-default"
                  route={draft.defaults}
                  inherited={undefined}
                  settings={settings}
                  hostKey={hostKey}
                  guarded={false}
                  workflow={false}
                  onChange={(defaults) => setDraft((current) => ({ ...current, defaults }))}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}
        {AUXILIARY_TASKS.map((task, index) => (
          <SearchableSetting key={task.id} {...entries[index]}>
            <AuxiliaryTaskRouteCard
              task={task}
              route={profile ? draft.byPrimaryAgent?.[profile]?.[task.id] : draft.tasks?.[task.id]}
              inherited={
                profile
                  ? resolveAuxiliaryModelRoute({ ...draft, byPrimaryAgent: undefined }, task.id)
                  : draft.defaults
              }
              settings={settings}
              hostKey={hostKey}
              onChange={(route) => change(task.id, route)}
              onReset={() => change(task.id)}
            />
          </SearchableSetting>
        ))}
      </fieldset>
      <AuxiliaryTaskRunner
        settings={{
          ...settings,
          auxiliaryModels: draft,
          ...(profile ? { defaultTuiAgent: profile } : {})
        }}
        hostKey={hostKey}
      />
      <AutomaticRoutingHistory />
      <AutomaticRoutingPreview primaryAgent={profile ?? settings.defaultTuiAgent} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
