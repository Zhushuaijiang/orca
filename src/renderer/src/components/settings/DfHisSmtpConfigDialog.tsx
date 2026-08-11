import { useState, type JSX } from 'react'
import { Mail } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
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

export type DfHisSmtpConfigState = {
  smtpHost: string
  smtpPort: string
  smtpUser: string
  smtpPassword: string
  smtpFromName: string
  emailCc: string
}

export function createEmptySmtpConfig(): DfHisSmtpConfigState {
  return {
    smtpHost: '',
    smtpPort: '',
    smtpUser: '',
    smtpPassword: '',
    smtpFromName: '',
    emailCc: ''
  }
}

type DfHisSmtpConfigDialogProps = {
  value: DfHisSmtpConfigState
  hasPassword: boolean
  disabled: boolean
  onSave: (value: DfHisSmtpConfigState) => void
}

export function DfHisSmtpConfigDialog({
  value,
  hasPassword,
  disabled,
  onSave
}: DfHisSmtpConfigDialogProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState<DfHisSmtpConfigState>(value)

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
          <Mail className="size-4" />
          {translate(
            'auto.components.settings.DfHisSmtpConfigDialog.button',
            'SMTP email settings'
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.settings.DfHisSmtpConfigDialog.title',
              'SMTP email settings'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.DfHisSmtpConfigDialog.description',
              'Used by the requirement quality audit skill to send notification emails. Saved to the same dfhis-environment.json.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-2 space-y-1.5">
              <span className="text-xs font-medium text-foreground">
                {translate('auto.components.settings.DfHisSmtpConfigDialog.host', 'SMTP host')}
              </span>
              <Input
                value={local.smtpHost}
                onChange={(e) => setLocal((s) => ({ ...s, smtpHost: e.target.value }))}
                placeholder="smtp.exmail.qq.com"
                disabled={disabled}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">
                {translate('auto.components.settings.DfHisSmtpConfigDialog.port', 'Port')}
              </span>
              <Input
                value={local.smtpPort}
                onChange={(e) => setLocal((s) => ({ ...s, smtpPort: e.target.value }))}
                placeholder="465"
                disabled={disabled}
              />
            </label>
          </div>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisSmtpConfigDialog.user',
                'SMTP user (from email)'
              )}
            </span>
            <Input
              value={local.smtpUser}
              onChange={(e) => setLocal((s) => ({ ...s, smtpUser: e.target.value }))}
              placeholder="sender@example.com"
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisSmtpConfigDialog.password',
                'SMTP password'
              )}
            </span>
            <Input
              type="password"
              value={local.smtpPassword}
              onChange={(e) => setLocal((s) => ({ ...s, smtpPassword: e.target.value }))}
              placeholder={
                hasPassword
                  ? translate(
                      'auto.components.settings.DfHisSmtpConfigDialog.passwordKeepHint',
                      '•••••• (leave empty to keep current)'
                    )
                  : ''
              }
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate('auto.components.settings.DfHisSmtpConfigDialog.fromName', 'From name')}
            </span>
            <Input
              value={local.smtpFromName}
              onChange={(e) => setLocal((s) => ({ ...s, smtpFromName: e.target.value }))}
              placeholder="HIS需求质量审核"
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisSmtpConfigDialog.cc',
                'CC recipients (comma-separated)'
              )}
            </span>
            <Input
              value={local.emailCc}
              onChange={(e) => setLocal((s) => ({ ...s, emailCc: e.target.value }))}
              placeholder="pm@example.com, dev@example.com"
              disabled={disabled}
            />
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {translate('auto.components.settings.DfHisSmtpConfigDialog.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={handleSave}>
            {translate('auto.components.settings.DfHisSmtpConfigDialog.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
