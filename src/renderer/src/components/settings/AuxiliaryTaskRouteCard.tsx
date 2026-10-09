import { useState } from 'react'
import type {
  AuxiliaryModelRoute,
  AuxiliaryTaskDefinition
} from '../../../../shared/auxiliary-model-types'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { resolveAuxiliaryModelRoute } from '../../../../shared/auxiliary-model-settings'
import { listCommitMessageAgentCapabilities } from '../../../../shared/commit-message-agent-spec'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { AuxiliaryModelRouteFields } from './AuxiliaryModelRouteFields'

export function AuxiliaryTaskRouteCard({
  task,
  route,
  inherited,
  settings,
  hostKey,
  onChange,
  onReset
}: {
  task: AuxiliaryTaskDefinition
  route?: AuxiliaryModelRoute
  inherited?: AuxiliaryModelRoute
  settings: GlobalSettings
  hostKey: string
  onChange: (route: AuxiliaryModelRoute) => void
  onReset: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const effective = resolveAuxiliaryModelRoute(
    { defaults: inherited, tasks: { [task.id]: route } },
    task.id
  )
  const agent = listCommitMessageAgentCapabilities().find(
    (entry) => entry.id === effective?.agentId
  )
  const summary =
    effective?.modelsByHost?.[hostKey] || effective?.agentId
      ? [
          agent?.label ?? effective?.agentId,
          effective?.modelsByHost?.[hostKey],
          effective?.thinkingByHost?.[hostKey]
        ]
          .filter(Boolean)
          .join(' · ')
      : translate('auxiliary.inherit', 'Use default')
  return (
    <Card id={`auxiliary-${task.id}`}>
      <CardContent>
        <Collapsible open={open} onOpenChange={setOpen}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-medium">
                {translate(`auxiliary.tasks.${task.id}.title`, task.title)}
              </h3>
              <p className="text-xs text-muted-foreground">
                {translate(`auxiliary.tasks.${task.id}.description`, task.description)}
              </p>
              <p className="truncate text-xs text-muted-foreground">{summary}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" onClick={onReset}>
                {translate('auxiliary.reset', 'Reset')}
              </Button>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {open
                    ? translate('auxiliary.collapse', 'Collapse')
                    : translate('auxiliary.change', 'Change')}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
          <CollapsibleContent>
            <div className="pt-4">
              <AuxiliaryModelRouteFields
                id={`auxiliary-${task.id}`}
                route={route}
                inherited={inherited}
                settings={settings}
                hostKey={hostKey}
                guarded={task.kind === 'guarded-review'}
                workflow={task.kind === 'workflow'}
                onChange={onChange}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
