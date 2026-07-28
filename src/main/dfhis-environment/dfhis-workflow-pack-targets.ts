import type { DfHisEnvironmentPrerequisiteId } from '../../shared/dfhis-environment-types'

export const DFHIS_WORKFLOW_PACK_NAMES = [
  'yunxiao-requirement-archiver',
  'his-release-merge'
] as const
export const BUNDLED_DFHIS_WORKFLOW_PACK_RELATIVE_PATH = 'dfhis'
export const MANIFEST_FILE_NAME = '.orca-dfhis-workflow-pack.json'

export type DfHisWorkflowPackName = (typeof DFHIS_WORKFLOW_PACK_NAMES)[number]

export type DfHisWorkflowPackTarget = {
  id: DfHisEnvironmentPrerequisiteId
  providerTarget: 'agent-skills' | 'codex' | 'claude'
  label: string
  relativeDirectory: string[]
}

type WorkflowPackTargetDefinition = readonly [
  DfHisEnvironmentPrerequisiteId,
  DfHisWorkflowPackTarget['providerTarget'],
  string,
  readonly string[]
]

const WORKFLOW_PACK_TARGET_DEFINITIONS: readonly WorkflowPackTargetDefinition[] = [
  [
    'dfhis-workflow-pack-agent-skills',
    'agent-skills',
    'DFHIS workflow pack for universal agent skills',
    ['.agents', 'skills']
  ],
  ['dfhis-workflow-pack-codex', 'codex', 'DFHIS workflow pack for Codex', ['.codex', 'skills']],
  ['dfhis-workflow-pack-claude', 'claude', 'DFHIS workflow pack for Claude', ['.claude', 'skills']]
]

export const WORKFLOW_PACK_TARGETS: readonly DfHisWorkflowPackTarget[] =
  WORKFLOW_PACK_TARGET_DEFINITIONS.map(([id, providerTarget, label, directory]) => ({
    id,
    providerTarget,
    label,
    relativeDirectory: [...directory]
  }))
