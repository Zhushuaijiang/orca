import type React from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { translate } from '@/i18n/i18n'
import type { AiVaultScope } from '../../../../shared/ai-vault-types'

// Why: match ToggleGroup's spacing+outline qualifiers so selected edges out-specify its border-l-0 collapse.
const VAULT_SCOPE_SELECTED_EDGE_CLASS =
  'data-[spacing=0]:data-[variant=outline]:aria-[checked=true]:border-l data-[spacing=0]:data-[variant=outline]:data-[state=on]:border-l'

const VAULT_SCOPE_TOGGLE_ITEM_CLASS = `h-7 min-h-7 min-w-0 flex-1 basis-0 shrink border border-transparent bg-transparent px-2.5 text-[11px] font-medium leading-none text-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-[checked=true]:border-foreground/20 aria-[checked=true]:bg-foreground/10 aria-[checked=true]:text-foreground aria-[checked=true]:shadow-xs aria-[checked=true]:hover:bg-foreground/15 aria-[checked=true]:hover:text-foreground data-[state=on]:border-foreground/20 data-[state=on]:bg-foreground/10 data-[state=on]:text-foreground data-[state=on]:shadow-xs data-[state=on]:hover:bg-foreground/15 data-[state=on]:hover:text-foreground ${VAULT_SCOPE_SELECTED_EDGE_CLASS} @max-[300px]/ai-vault:px-1.5`

export function VaultScopeSwitch({
  scope,
  workspaceAvailable,
  projectAvailable,
  onScopeChange
}: {
  scope: AiVaultScope
  workspaceAvailable: boolean
  projectAvailable: boolean
  onScopeChange: (scope: AiVaultScope) => void
}): React.JSX.Element {
  const workspaceLabel = translate(
    'auto.components.right.sidebar.AiVaultPanelControls.workspaceScope',
    'Workspace'
  )
  const projectLabel = translate(
    'auto.components.right.sidebar.AiVaultPanelControls.projectScope',
    'Project'
  )
  const allLabel = translate('auto.components.right.sidebar.AiVaultPanelControls.allScope', 'All')
  const yunxiaoLabel = translate(
    'auto.components.right.sidebar.AiVaultPanelControls.yunxiaoScope',
    'Yunxiao'
  )

  return (
    <ToggleGroup
      type="single"
      value={scope}
      onValueChange={(value) => {
        if (
          value === 'workspace' ||
          value === 'project' ||
          value === 'all' ||
          value === 'yunxiao'
        ) {
          onScopeChange(value)
        }
      }}
      variant="outline"
      className="h-7 w-full rounded-md border border-sidebar-border bg-sidebar-accent/35 shadow-xs"
      aria-label={translate(
        'auto.components.right.sidebar.AiVaultPanelControls.scopeAriaLabel',
        'Session History scope: {{value0}}',
        {
          value0:
            scope === 'workspace'
              ? translate(
                  'auto.components.right.sidebar.AiVaultPanelControls.currentWorkspaceLower',
                  'current workspace'
                )
              : scope === 'project'
                ? translate(
                    'auto.components.right.sidebar.AiVaultPanelControls.currentProjectLower',
                    'current project'
                  )
                : scope === 'yunxiao'
                  ? translate(
                      'auto.components.right.sidebar.AiVaultPanelControls.yunxiaoSessionsLower',
                      'yunxiao sessions'
                    )
                  : translate(
                      'auto.components.right.sidebar.AiVaultPanelControls.allSessionsLower',
                      'all sessions'
                    )
        }
      )}
    >
      <ToggleGroupItem
        value="workspace"
        disabled={!workspaceAvailable}
        className={VAULT_SCOPE_TOGGLE_ITEM_CLASS}
      >
        {workspaceLabel}
      </ToggleGroupItem>
      <ToggleGroupItem
        value="project"
        disabled={!projectAvailable}
        className={VAULT_SCOPE_TOGGLE_ITEM_CLASS}
      >
        {projectLabel}
      </ToggleGroupItem>
      <ToggleGroupItem value="all" className={VAULT_SCOPE_TOGGLE_ITEM_CLASS}>
        {allLabel}
      </ToggleGroupItem>
      <ToggleGroupItem value="yunxiao" className={VAULT_SCOPE_TOGGLE_ITEM_CLASS}>
        {yunxiaoLabel}
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
