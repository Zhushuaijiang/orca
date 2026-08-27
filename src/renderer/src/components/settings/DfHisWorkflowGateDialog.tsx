import { useState, type JSX } from 'react'
import { Workflow } from 'lucide-react'
import { Button } from '../ui/button'
import { Switch } from '../ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '../ui/dialog'
import { translate } from '@/i18n/i18n'

export type DfHisWorkflowGateState = {
  rcE2eGate: boolean
}

export function createEmptyWorkflowGateConfig(): DfHisWorkflowGateState {
  return { rcE2eGate: false }
}

type DfHisWorkflowGateDialogProps = {
  value: DfHisWorkflowGateState
  disabled: boolean
  onSave: (value: DfHisWorkflowGateState) => void
}

export function DfHisWorkflowGateDialog({
  value,
  disabled,
  onSave
}: DfHisWorkflowGateDialogProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState<DfHisWorkflowGateState>(value)

  function handleOpenChange(nextOpen: boolean): void {
    if (nextOpen) {
      setLocal(value)
    }
    setOpen(nextOpen)
  }

  function handleSave(): void {
    onSave(local)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <Workflow className="size-4" />
          {translate(
            'auto.components.settings.DfHisWorkflowGateDialog.button',
            'Requirement delivery workflow'
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.settings.DfHisWorkflowGateDialog.title',
              'Requirement delivery workflow'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.DfHisWorkflowGateDialog.description',
              'Gates for HIS requirement delivery. Saved as hisWorkflow in dfhis-environment.json.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <span className="text-xs font-medium text-foreground">
                {translate(
                  'auto.components.settings.DfHisWorkflowGateDialog.rcE2eGate',
                  'Run RC acceptance flow (merge to RC → Jenkins 152 → Docker e2e → upload evidence)'
                )}
              </span>
              <p className="text-xs leading-5 text-muted-foreground">
                {translate(
                  'auto.components.settings.DfHisWorkflowGateDialog.rcE2eGateHint',
                  'When on, delivery must merge to the latest RC branch, compile on Jenkins 152, run the Docker sandbox e2e, and upload screenshots/videos to Yunxiao attachments.'
                )}
              </p>
            </div>
            <Switch
              checked={local.rcE2eGate}
              onCheckedChange={(checked) => setLocal({ rcE2eGate: checked })}
              disabled={disabled}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {translate('auto.components.settings.DfHisWorkflowGateDialog.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={handleSave}>
            {translate('auto.components.settings.DfHisWorkflowGateDialog.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
