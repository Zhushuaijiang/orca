import { useState, type JSX } from 'react'
import { FolderTree } from 'lucide-react'
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

export type DfHisPathsConfigState = {
  hisCodeRoot: string
  hisWorkflowCatalogPath: string
  archiveWorkspacePath: string
  hisFactCardsRoot: string
  hisFactIndexPath: string
  ygtWorkspaceRoot: string
  projectIndexManifestPath: string
  projectCodeGraphPath: string
  projectKnowledgeIndexPath: string
}

export function createEmptyPathsConfig(): DfHisPathsConfigState {
  return {
    hisCodeRoot: '',
    hisWorkflowCatalogPath: '',
    archiveWorkspacePath: '',
    hisFactCardsRoot: '',
    hisFactIndexPath: '',
    ygtWorkspaceRoot: '',
    projectIndexManifestPath: '',
    projectCodeGraphPath: '',
    projectKnowledgeIndexPath: ''
  }
}

type DfHisPathsConfigDialogProps = {
  value: DfHisPathsConfigState
  disabled: boolean
  onSave: (value: DfHisPathsConfigState) => void
}

export function DfHisPathsConfigDialog({
  value,
  disabled,
  onSave
}: DfHisPathsConfigDialogProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState<DfHisPathsConfigState>(value)

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
          <FolderTree className="size-4" />
          {translate('auto.components.settings.DfHisPathsConfigDialog.button', 'Path settings')}
        </Button>
      </DialogTrigger>
      <DialogContent className="scrollbar-sleek max-h-[85vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.settings.DfHisPathsConfigDialog.title', 'Path settings')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.DfHisPathsConfigDialog.description',
              'Local workspace paths for HIS code, workflow catalog, and Yunxiao archive output.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisPathsConfigDialog.codeRoot',
                'Default code root'
              )}
            </span>
            <Input
              value={local.hisCodeRoot}
              onChange={(e) => setLocal((s) => ({ ...s, hisCodeRoot: e.target.value }))}
              placeholder="~/workspace/<project>/code"
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisPathsConfigDialog.ygtWorkspaceRoot',
                'YGT workspace root'
              )}
            </span>
            <Input
              value={local.ygtWorkspaceRoot}
              onChange={(e) => setLocal((s) => ({ ...s, ygtWorkspaceRoot: e.target.value }))}
              placeholder="~/workspace/<project>/ygt-workspace"
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisPathsConfigDialog.factCards',
                'HIS fact cards'
              )}
            </span>
            <Input
              value={local.hisFactCardsRoot}
              onChange={(e) => setLocal((s) => ({ ...s, hisFactCardsRoot: e.target.value }))}
              placeholder="~/knowledge/01-fact-cards"
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisPathsConfigDialog.projectIndexManifest',
                'Multi-project index manifest'
              )}
            </span>
            <Input
              value={local.projectIndexManifestPath}
              onChange={(e) =>
                setLocal((s) => ({ ...s, projectIndexManifestPath: e.target.value }))
              }
              placeholder="~/.cache/orca/project-index/manifest.json"
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisPathsConfigDialog.projectCodeGraph',
                'Multi-project code graph'
              )}
            </span>
            <Input
              value={local.projectCodeGraphPath}
              onChange={(e) => setLocal((s) => ({ ...s, projectCodeGraphPath: e.target.value }))}
              placeholder="~/.cache/orca/project-index/code-graph.json"
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisPathsConfigDialog.projectKnowledgeIndex',
                'Multi-project knowledge index'
              )}
            </span>
            <Input
              value={local.projectKnowledgeIndexPath}
              onChange={(e) =>
                setLocal((s) => ({ ...s, projectKnowledgeIndexPath: e.target.value }))
              }
              placeholder="~/.cache/orca/project-index/knowledge.json"
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisPathsConfigDialog.factIndex',
                'HIS fact index'
              )}
            </span>
            <Input
              value={local.hisFactIndexPath}
              onChange={(e) => setLocal((s) => ({ ...s, hisFactIndexPath: e.target.value }))}
              placeholder="~/.cache/orca/his-index/fact-cards.json"
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisPathsConfigDialog.workflowCatalog',
                'HIS workflow service catalog'
              )}
            </span>
            <Input
              value={local.hisWorkflowCatalogPath}
              onChange={(e) => setLocal((s) => ({ ...s, hisWorkflowCatalogPath: e.target.value }))}
              placeholder="~/workspace/his-workflow-catalog.json"
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              {translate(
                'auto.components.settings.DfHisPathsConfigDialog.archiveWorkspace',
                'Yunxiao archive workspace'
              )}
            </span>
            <Input
              value={local.archiveWorkspacePath}
              onChange={(e) => setLocal((s) => ({ ...s, archiveWorkspacePath: e.target.value }))}
              placeholder="~/workspace/yunxiao"
              disabled={disabled}
            />
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {translate('auto.components.settings.DfHisPathsConfigDialog.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={handleSave}>
            {translate('auto.components.settings.DfHisPathsConfigDialog.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
