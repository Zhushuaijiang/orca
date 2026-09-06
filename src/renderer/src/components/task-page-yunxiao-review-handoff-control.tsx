import type { JSX } from 'react'

import AgentCombobox from '@/components/agent/AgentCombobox'
import { Switch } from '@/components/ui/switch'
import { translate } from '@/i18n/i18n'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { useAppStore } from '@/store'
import type { AutomationYunxiaoReviewHandoff } from '../../../shared/automations-types'
import { isTuiAgentEnabled } from '../../../shared/tui-agent-selection'

type TaskPageYunxiaoReviewHandoffControlProps = {
  reviewHandoff: AutomationYunxiaoReviewHandoff
  onReviewHandoffChange: (next: AutomationYunxiaoReviewHandoff) => void
}

export function TaskPageYunxiaoReviewHandoffControl({
  onReviewHandoffChange,
  reviewHandoff
}: TaskPageYunxiaoReviewHandoffControlProps): JSX.Element {
  const disabledTuiAgents = useAppStore((state) => state.settings?.disabledTuiAgents)
  const defaultTuiAgent = useAppStore((state) => state.settings?.defaultTuiAgent ?? null)
  const agents = getAgentCatalog().filter(
    (agent) => isTuiAgentEnabled(agent.id, disabledTuiAgents) || agent.id === reviewHandoff.agentId
  )

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-background/70 px-2 py-0.5">
      <Switch
        checked={reviewHandoff.enabled}
        onCheckedChange={(enabled) =>
          onReviewHandoffChange({ ...reviewHandoff, enabled: enabled === true })
        }
        aria-label={translate('auto.components.TaskPage.yunxiaoReviewHandoff', 'Review handoff')}
        className="h-3.5 w-6"
        thumbClassName="size-2.5 data-[state=checked]:translate-x-2.5"
      />
      <span className="whitespace-nowrap text-[11px] text-muted-foreground">
        {translate('auto.components.TaskPage.yunxiaoReviewHandoff', 'Review handoff')}
      </span>
      <AgentCombobox
        agents={agents}
        value={reviewHandoff.agentId}
        onValueChange={(agentId) => {
          if (agentId) {
            onReviewHandoffChange({ ...reviewHandoff, agentId })
          }
        }}
        defaultAgent={defaultTuiAgent}
        allowNarrowTrigger
        triggerClassName="h-7 w-[148px] min-w-0 border-border/50 bg-background/80 text-xs"
      />
    </div>
  )
}
