import type { DfHisEnvironmentPrerequisiteId } from '../../shared/dfhis-environment-types'
import type { TuiAgent } from '../../shared/types'
import {
  AGENT_SKILL_HOME_DIRECTORIES,
  UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY
} from '../../shared/agent-skill-home-directories'
import { TUI_AGENT_DISPLAY_NAMES } from '../../shared/tui-agent-display-names'
import type {
  BundledSkillPackDefinition,
  BundledSkillPackTarget
} from '../skill-packs/bundled-skill-pack-installer'

export const DFHIS_WORKFLOW_PACK_NAMES = [
  'yunxiao-requirement-archiver',
  'his-workflow-harness',
  'his-release-merge',
  'ui-spec-review',
  'ygt',
  'dfhis-company-environment',
  'requirement-delivery-flow',
  'yunxiao-contacts',
  'dfhis-yibao-dmdz',
  'skill-memory',
  'dfhis-ui-test-delivery'
] as const
export const BUNDLED_DFHIS_WORKFLOW_PACK_RELATIVE_PATH = 'dfhis'
export const MANIFEST_FILE_NAME = '.orca-dfhis-workflow-pack.json'

export type DfHisWorkflowPackName = (typeof DFHIS_WORKFLOW_PACK_NAMES)[number]

export type DfHisWorkflowPackTarget = BundledSkillPackTarget<
  DfHisEnvironmentPrerequisiteId,
  'agent-skills' | TuiAgent
>

function agentWorkflowPackTarget(
  agent: TuiAgent,
  relativeDirectory: readonly string[]
): DfHisWorkflowPackTarget {
  return {
    id: `dfhis-workflow-pack-${agent}`,
    providerTarget: agent,
    label: `DFHIS workflow pack for ${TUI_AGENT_DISPLAY_NAMES[agent]}`,
    relativeDirectory
  }
}

// Why: the original three rows keep their long-standing order; every other
// supported agent home follows, sorted by display name.
const PINNED_PROVIDER_TARGETS: readonly TuiAgent[] = ['codex', 'claude']

const agentWorkflowPackTargets = (
  Object.entries(AGENT_SKILL_HOME_DIRECTORIES) as [TuiAgent, readonly string[]][]
)
  .map(([agent, relativeDirectory]) => agentWorkflowPackTarget(agent, relativeDirectory))
  .sort((left, right) => {
    const leftRank = PINNED_PROVIDER_TARGETS.indexOf(left.providerTarget as TuiAgent)
    const rightRank = PINNED_PROVIDER_TARGETS.indexOf(right.providerTarget as TuiAgent)
    if (leftRank !== rightRank) {
      return (
        (leftRank === -1 ? PINNED_PROVIDER_TARGETS.length : leftRank) -
        (rightRank === -1 ? PINNED_PROVIDER_TARGETS.length : rightRank)
      )
    }
    return left.label.localeCompare(right.label)
  })

export const WORKFLOW_PACK_TARGETS: readonly DfHisWorkflowPackTarget[] = [
  {
    id: 'dfhis-workflow-pack-agent-skills',
    providerTarget: 'agent-skills',
    label: 'DFHIS workflow pack for universal agent skills',
    relativeDirectory: UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY
  },
  ...agentWorkflowPackTargets
]

export const DFHIS_BUNDLED_SKILL_PACK = {
  id: 'dfhis',
  label: 'DFHIS workflow pack',
  bundledResourcePath: BUNDLED_DFHIS_WORKFLOW_PACK_RELATIVE_PATH,
  manifestFileName: MANIFEST_FILE_NAME,
  skillNames: DFHIS_WORKFLOW_PACK_NAMES,
  targets: WORKFLOW_PACK_TARGETS
} satisfies BundledSkillPackDefinition<DfHisWorkflowPackName, DfHisWorkflowPackTarget>
