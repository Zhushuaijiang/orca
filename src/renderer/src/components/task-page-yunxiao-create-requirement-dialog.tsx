import { LoaderCircle } from 'lucide-react'
import { useEffect, useState, type JSX } from 'react'
import { toast } from 'sonner'

import { GitHubMarkdownComposer } from '@/components/github/GitHubMarkdownComposer'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { getScreenSubmitShortcutLabel, isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import type {
  YunxiaoRequirementFieldOption,
  YunxiaoRequirementPriority
} from '../../../shared/types'
import { SearchableOptionSelect } from './task-page-yunxiao-option-select'

const FALLBACK_PRIORITIES: YunxiaoRequirementFieldOption[] = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'urgent', label: '紧急' }
]
const FALLBACK_BUSINESS_PRIORITIES: YunxiaoRequirementFieldOption[] = [
  { value: 'C类（评估处理）', label: 'C类（评估处理）' }
]
const FALLBACK_SYSTEMS: YunxiaoRequirementFieldOption[] = [{ value: '其他', label: '其他' }]
const FALLBACK_CUSTOMERS: YunxiaoRequirementFieldOption[] = [{ value: '东昉', label: '东昉' }]

type FieldOptions = {
  priorities: YunxiaoRequirementFieldOption[]
  businessPriorities: YunxiaoRequirementFieldOption[]
  systems: YunxiaoRequirementFieldOption[]
  customers: YunxiaoRequirementFieldOption[]
}

const FALLBACK_OPTIONS: FieldOptions = {
  priorities: FALLBACK_PRIORITIES,
  businessPriorities: FALLBACK_BUSINESS_PRIORITIES,
  systems: FALLBACK_SYSTEMS,
  customers: FALLBACK_CUSTOMERS
}

function firstOptionValue(options: YunxiaoRequirementFieldOption[]): string {
  return options[0]?.value ?? ''
}

type TaskPageYunxiaoCreateRequirementDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function TaskPageYunxiaoCreateRequirementDialog({
  open,
  onOpenChange,
  onCreated
}: TaskPageYunxiaoCreateRequirementDialogProps): JSX.Element {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<YunxiaoRequirementPriority>('low')
  const [businessPriority, setBusinessPriority] = useState(FALLBACK_BUSINESS_PRIORITIES[0].value)
  const [system, setSystem] = useState(FALLBACK_SYSTEMS[0].value)
  const [customer, setCustomer] = useState(FALLBACK_CUSTOMERS[0].value)
  const [options, setOptions] = useState<FieldOptions>(FALLBACK_OPTIONS)
  const [archiveAfterCreate, setArchiveAfterCreate] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    void window.api.yunxiao
      .listRequirementFieldOptions()
      .then((result) => {
        if (cancelled || !result.ok) {
          return
        }
        const nextOptions: FieldOptions = {
          priorities: result.priorities.length > 0 ? result.priorities : FALLBACK_PRIORITIES,
          businessPriorities:
            result.businessPriorities.length > 0
              ? result.businessPriorities
              : FALLBACK_BUSINESS_PRIORITIES,
          systems: result.systems.length > 0 ? result.systems : FALLBACK_SYSTEMS,
          customers: result.customers.length > 0 ? result.customers : FALLBACK_CUSTOMERS
        }
        setOptions(nextOptions)
        setPriority(result.defaults.priority)
        setBusinessPriority(
          result.defaults.businessPriority ?? firstOptionValue(nextOptions.businessPriorities)
        )
        setSystem(result.defaults.system ?? firstOptionValue(nextOptions.systems))
        setCustomer(result.defaults.customer ?? firstOptionValue(nextOptions.customers))
      })
      .catch(() => {
        // 拉取失败时用内置默认选项，不阻塞创建
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const handleCreate = async (): Promise<void> => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle || creating) {
      return
    }
    setCreating(true)
    try {
      const result = await window.api.yunxiao.createRequirement({
        title: trimmedTitle,
        description,
        priority,
        businessPriority,
        system,
        customer,
        archiveAfterCreate
      })
      if (!result.ok) {
        toast.error(
          result.error ||
            translate(
              'auto.components.TaskPage.ae3894e891',
              'Failed to create Yunxiao requirement.'
            )
        )
        return
      }
      const identifier =
        result.workItemId ?? translate('auto.components.TaskPage.14cb2e282f', 'Yunxiao requirement')
      toast.success(
        translate('auto.components.TaskPage.633c9bd347', 'Created {{value0}}', {
          value0: identifier
        }),
        {
          description: result.archiveMessage
            ? translate(
                'auto.components.TaskPage.f1a03a62c3',
                'Archived and dispatched to the Yunxiao requirement skill.'
              )
            : undefined,
          action: result.url
            ? {
                label: translate('auto.components.TaskPage.9c57663908', 'View'),
                onClick: () => window.open(result.url ?? '', '_blank')
              }
            : undefined
        }
      )
      setTitle('')
      setDescription('')
      setArchiveAfterCreate(true)
      onOpenChange(false)
      onCreated()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!creating) {
          onOpenChange(nextOpen)
        }
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        onKeyDown={(event) => {
          if (isScreenSubmitShortcut(event)) {
            event.preventDefault()
            void handleCreate()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.TaskPage.7c80f6a313', 'New Yunxiao requirement')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.TaskPage.c57bf5f830',
              'Submits through official Yunxiao MCP. After creation, Orca can archive it and dispatch it to the Yunxiao requirement skill.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {translate('auto.components.TaskPage.16cba35bee', 'Title')}
            </label>
            <Input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  void handleCreate()
                }
              }}
              placeholder={translate('auto.components.TaskPage.578f730c16', 'Short summary')}
              disabled={creating}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {translate('auto.components.TaskPage.7f3f7b4c18', 'Description (optional, markdown)')}
            </label>
            <GitHubMarkdownComposer
              value={description}
              onChange={setDescription}
              placeholder={translate('auto.components.TaskPage.34d97ca682', "What's going on?")}
              disabled={creating}
              minHeightClassName="min-h-40"
              onSubmitShortcut={() => void handleCreate()}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                {translate('auto.components.TaskPage.yunxiaoFieldPriority', 'Priority')}
              </label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as YunxiaoRequirementPriority)}
                disabled={creating}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.priorities.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                {translate(
                  'auto.components.TaskPage.yunxiaoFieldBusinessPriority',
                  'Business priority'
                )}
              </label>
              <Select
                value={businessPriority}
                onValueChange={setBusinessPriority}
                disabled={creating}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.businessPriorities.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                {translate('auto.components.TaskPage.yunxiaoFieldSystem', 'System')}
              </label>
              <SearchableOptionSelect
                value={system}
                options={options.systems}
                disabled={creating}
                onChange={setSystem}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                {translate('auto.components.TaskPage.yunxiaoFieldCustomer', 'Customer')}
              </label>
              <SearchableOptionSelect
                value={customer}
                options={options.customers}
                disabled={creating}
                onChange={setCustomer}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-foreground">
            <Checkbox
              checked={archiveAfterCreate}
              disabled={creating}
              onCheckedChange={(checked) => setArchiveAfterCreate(checked === true)}
            />
            {translate(
              'auto.components.TaskPage.72c283c5e8',
              'Archive and dispatch to the Yunxiao requirement skill after creation'
            )}
          </label>
          <p className="text-[10px] text-muted-foreground">
            {getScreenSubmitShortcutLabel()}{' '}
            {translate('auto.components.TaskPage.fc0d8a1fa4', 'to submit.')}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            {translate('auto.components.TaskPage.ff69a30681', 'Cancel')}
          </Button>
          <Button onClick={() => void handleCreate()} disabled={!title.trim() || creating}>
            {creating ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                {translate('auto.components.TaskPage.8ff6fdc368', 'Creating…')}
              </>
            ) : (
              translate('auto.components.TaskPage.56851d859e', 'Create requirement')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
