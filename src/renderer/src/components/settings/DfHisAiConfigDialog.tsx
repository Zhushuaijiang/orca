import { useState, type JSX } from 'react'
import { Cpu } from 'lucide-react'
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

export type DfHisAiConfigState = {
  relayExecModel: string
  relayExecApiKey: string
  visionApiKey: string
  dfhisSkillPackUrl: string
}

export function createEmptyAiConfig(): DfHisAiConfigState {
  return {
    relayExecModel: '',
    relayExecApiKey: '',
    visionApiKey: '',
    dfhisSkillPackUrl: ''
  }
}

type DfHisAiConfigDialogProps = {
  value: DfHisAiConfigState
  hasRelayApiKey: boolean
  hasVisionApiKey: boolean
  disabled: boolean
  onSave: (value: DfHisAiConfigState) => void
}

export function DfHisAiConfigDialog({
  value,
  hasRelayApiKey,
  hasVisionApiKey,
  disabled,
  onSave
}: DfHisAiConfigDialogProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState<DfHisAiConfigState>(value)

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
          <Cpu className="size-4" />
          {translate('auto.components.settings.DfHisAiConfigDialog.button', 'AI model settings')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.settings.DfHisAiConfigDialog.title', 'AI model settings')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.DfHisAiConfigDialog.description',
              'Model aliases and API keys for relay exec, vision, and DFHIS skill pack distribution.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisAiConfigDialog.relayModel',
                'Relay exec model (kimi alias)'
              )}
            </span>
            <Input
              value={local.relayExecModel}
              onChange={(e) => setLocal((s) => ({ ...s, relayExecModel: e.target.value }))}
              placeholder="deepseek/deepseek-v4-flash"
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisAiConfigDialog.relayApiKey',
                'Relay exec model API key (optional)'
              )}
            </span>
            <Input
              type="password"
              value={local.relayExecApiKey}
              onChange={(e) => setLocal((s) => ({ ...s, relayExecApiKey: e.target.value }))}
              placeholder={
                hasRelayApiKey
                  ? translate(
                      'auto.components.settings.DfHisAiConfigDialog.relayKeyKeepHint',
                      '•••••• (leave empty to keep current)'
                    )
                  : 'sk-... (empty = relay uses k3 only)'
              }
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisAiConfigDialog.visionApiKey',
                'Vision API key (optional)'
              )}
            </span>
            <Input
              type="password"
              value={local.visionApiKey}
              onChange={(e) => setLocal((s) => ({ ...s, visionApiKey: e.target.value }))}
              placeholder={
                hasVisionApiKey
                  ? translate(
                      'auto.components.settings.DfHisAiConfigDialog.visionKeyKeepHint',
                      '•••••• (leave empty to keep current)'
                    )
                  : 'sk-... (empty = built-in default)'
              }
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisAiConfigDialog.skillPackUrl',
                'DFHIS skill pack URL'
              )}
            </span>
            <Input
              value={local.dfhisSkillPackUrl}
              onChange={(e) => setLocal((s) => ({ ...s, dfhisSkillPackUrl: e.target.value }))}
              placeholder="https://.../dfhis-skill-pack.json"
              disabled={disabled}
            />
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {translate('auto.components.settings.DfHisAiConfigDialog.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={handleSave}>
            {translate('auto.components.settings.DfHisAiConfigDialog.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
