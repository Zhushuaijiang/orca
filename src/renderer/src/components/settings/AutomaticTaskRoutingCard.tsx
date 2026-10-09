import { translate } from '@/i18n/i18n'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { AutomaticTaskRoutingSettings } from '../../../../shared/automatic-task-routing-types'
import { AuxiliaryModelRouteFields } from './AuxiliaryModelRouteFields'
import { Card, CardContent } from '../ui/card'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'

const TIERS = [
  {
    id: 'simple',
    title: 'Simple tasks',
    titleKey: 'auxiliary.automatic.simple',
    description: 'Wording, extraction, formatting and small mechanical changes.',
    descriptionKey: 'auxiliary.automatic.simpleDescription'
  },
  {
    id: 'standard',
    title: 'Standard tasks',
    titleKey: 'auxiliary.automatic.standard',
    description: 'Routine implementation, tests and code review.',
    descriptionKey: 'auxiliary.automatic.standardDescription'
  },
  {
    id: 'complex',
    title: 'Complex tasks',
    titleKey: 'auxiliary.automatic.complex',
    description: 'Architecture, migrations, cross-module debugging and ambiguous requirements.',
    descriptionKey: 'auxiliary.automatic.complexDescription'
  }
] as const

export function AutomaticTaskRoutingCard({
  value,
  settings,
  hostKey,
  onChange
}: {
  value: AutomaticTaskRoutingSettings | undefined
  settings: GlobalSettings
  hostKey: string
  onChange: (value: AutomaticTaskRoutingSettings) => void
}): React.JSX.Element {
  const keepComplex = value?.keepComplexInPrimary ?? !value?.tiers?.complex
  return (
    <Card>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="automatic-task-routing"
              checked={value?.enabled === true}
              onCheckedChange={(enabled) => onChange({ ...value, enabled })}
            />
            <Label htmlFor="automatic-task-routing">
              {translate('auxiliary.automatic.enabled', 'Automatically route coding tasks')}
            </Label>
          </div>
          <p className="text-sm text-muted-foreground">
            {translate(
              'auxiliary.automatic.description',
              'The primary agent classifies your request and delegates using these difficulty routes. Uncertain tasks stay with the primary agent. File changes use supervised workers.'
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auxiliary.automatic.classifier',
              'The Task classification auxiliary model makes the routing decision. Configure a fast model for that task. Changes here apply to all primary agents.'
            )}
          </p>
          {value?.enabled
            ? TIERS.map((tier) => (
                <div key={tier.id} className="space-y-3 border-t pt-4">
                  <div>
                    <h3 className="text-sm font-medium">{translate(tier.titleKey, tier.title)}</h3>
                    <p className="text-xs text-muted-foreground">
                      {translate(tier.descriptionKey, tier.description)}
                    </p>
                  </div>
                  {tier.id === 'complex' ? (
                    <div className="flex items-center gap-3">
                      <Switch
                        id="automatic-complex-primary"
                        checked={keepComplex}
                        onCheckedChange={(keepComplexInPrimary) =>
                          onChange({
                            ...value,
                            enabled: value?.enabled === true,
                            keepComplexInPrimary
                          })
                        }
                      />
                      <Label htmlFor="automatic-complex-primary">
                        {translate(
                          'auxiliary.automatic.keepComplex',
                          'Keep complex tasks in the primary agent'
                        )}
                      </Label>
                    </div>
                  ) : null}
                  {tier.id !== 'complex' || !keepComplex ? (
                    <AuxiliaryModelRouteFields
                      id={`automatic-tier-${tier.id}`}
                      route={value?.tiers?.[tier.id]}
                      inherited={settings.auxiliaryModels?.defaults}
                      settings={settings}
                      hostKey={hostKey}
                      guarded={false}
                      workflow={true}
                      onChange={(route) =>
                        onChange({
                          ...value,
                          enabled: value?.enabled === true,
                          tiers: { ...value?.tiers, [tier.id]: route }
                        })
                      }
                    />
                  ) : null}
                </div>
              ))
            : null}
        </div>
      </CardContent>
    </Card>
  )
}
