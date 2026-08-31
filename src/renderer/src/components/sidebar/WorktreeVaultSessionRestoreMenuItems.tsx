import { RotateCcw } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { aiVaultAgentLabel, type AiVaultSession } from '../../../../shared/ai-vault-types'

export function WorktreeVaultSessionRestoreMenuItems({
  canRestoreSession,
  isDeleting,
  onRestoreSession,
  onRestoreSpecificSession,
  sessions
}: {
  canRestoreSession: boolean
  isDeleting: boolean
  onRestoreSession: () => void
  onRestoreSpecificSession: (session: AiVaultSession) => void
  sessions: AiVaultSession[]
}): React.JSX.Element {
  if (sessions.length > 1) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={isDeleting || !canRestoreSession}>
          <RotateCcw className="size-3.5" />
          {translate(
            'auto.components.sidebar.WorktreeContextMenu.restoreSession',
            'Restore Session'
          )}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-72">
          {sessions.map((session) => (
            <DropdownMenuItem
              key={session.id}
              onSelect={() => onRestoreSpecificSession(session)}
              title={session.title || session.sessionId}
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-mono text-sm">{session.sessionId}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {aiVaultAgentLabel(session.agent)} · {session.modifiedAt}
                </span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    )
  }
  return (
    <DropdownMenuItem onSelect={onRestoreSession} disabled={isDeleting || !canRestoreSession}>
      <RotateCcw className="size-3.5" />
      {translate('auto.components.sidebar.WorktreeContextMenu.restoreSession', 'Restore Session')}
    </DropdownMenuItem>
  )
}
