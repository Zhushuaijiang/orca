import { homedir } from 'node:os'
import { basename, join, type posix } from 'node:path'
import type { SkillDiscoverySource, SkillProvider, SkillSourceKind } from '../../shared/skills'
import type { AgentType } from '../../shared/agent-status-types'
import type { Repo } from '../../shared/types'
import type { TuiAgent } from '../../shared/types'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import {
  AGENT_SKILL_HOME_DIRECTORIES,
  UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY
} from '../../shared/agent-skill-home-directories'
import { TUI_AGENT_DISPLAY_NAMES } from '../../shared/tui-agent-display-names'
import {
  SKILL_INSTALL_PROVIDERS,
  type SkillInstallProviderId
} from '../../shared/skill-install-providers'
import type { SkillProviderRootOverrides } from './skill-provider-destinations'
import { stablePathId } from './skill-discovery-classification'
import {
  resolveDefaultHermesSkillsRoot,
  resolveEnvironmentHermesSkillsRoot,
  resolveEnvironmentSkillProviderRoots
} from './skill-provider-runtime-roots'

export type SkillScanRoot = Omit<SkillDiscoverySource, 'exists' | 'skippedReason'>

export {
  sortDiscoveredSkills,
  sortSkillDiscoverySources,
  sourceKindForSkill,
  sourceLabelForSkill,
  stablePathId
} from './skill-discovery-classification'
type SkillDiscoveryPathApi = Pick<typeof posix, 'basename' | 'join'>

function source(
  id: string,
  label: string,
  path: string,
  sourceKind: SkillSourceKind,
  providers: SkillProvider[],
  owner: AgentType | null
): SkillScanRoot {
  return { id, label, path, sourceKind, providers, owner }
}

// Why: Claude has its own SkillProvider tag; every other agent shares agent-skills.
function skillProvidersFor(id: SkillInstallProviderId): SkillProvider[] {
  return id === 'claude' ? ['claude'] : ['agent-skills']
}

function providerHomeSources(
  home: string,
  pathApi: SkillDiscoveryPathApi,
  overrides: SkillProviderRootOverrides
): SkillScanRoot[] {
  return SKILL_INSTALL_PROVIDERS.flatMap((provider) => {
    if (!provider.globalSegments) {
      return []
    }
    return [
      source(
        `home-${provider.id}`,
        `${provider.displayName} home`,
        overrides[provider.id] ?? pathApi.join(home, ...provider.globalSegments),
        'home',
        skillProvidersFor(provider.id),
        provider.id
      )
    ]
  })
}

function providerRepoSources(
  repoPath: string,
  repoLabel: string,
  pathApi: SkillDiscoveryPathApi
): SkillScanRoot[] {
  return SKILL_INSTALL_PROVIDERS.flatMap((provider) => {
    const segments = provider.workspaceSegments
    if (!segments) {
      return []
    }
    return [
      source(
        `repo-${provider.id}-${stablePathId(repoPath)}`,
        `${repoLabel} ${segments[0]}`,
        pathApi.join(repoPath, ...segments),
        'repo',
        skillProvidersFor(provider.id),
        provider.id
      )
    ]
  })
}

export function buildSkillDiscoverySources(
  args: {
    homeDir?: string
    cwd?: string
    repos?: Repo[]
    includeCwd?: boolean
    pathApi?: SkillDiscoveryPathApi
    providerRootOverrides?: SkillProviderRootOverrides
  } = {}
): SkillScanRoot[] {
  const pathApi = args.pathApi ?? { basename, join }
  const home = args.homeDir ?? homedir()
  const cwd = args.cwd ?? process.cwd()
  const providerRootOverrides =
    args.providerRootOverrides ?? (args.pathApi ? {} : resolveEnvironmentSkillProviderRoots())
  // Read HERMES_HOME only on this process's host; a custom path adapter describes another host with POSIX Hermes defaults.
  const hermesSkillsRoot = args.pathApi
    ? pathApi.join(home, '.hermes', 'skills')
    : (resolveEnvironmentHermesSkillsRoot() ?? resolveDefaultHermesSkillsRoot({ homeDir: home }))
  const roots: SkillScanRoot[] = [
    // Why: Codex reads `.agents/skills` today; this legacy home still holds older installs.
    source(
      'home-codex',
      'Codex home',
      pathApi.join(home, '.codex', 'skills'),
      'home',
      ['codex'],
      'codex'
    ),
    source(
      'home-agents',
      'Agent skills home',
      pathApi.join(home, ...UNIVERSAL_AGENT_SKILL_HOME_DIRECTORY),
      'home',
      ['agent-skills'],
      null
    ),
    source(
      'codex-plugin-cache',
      'Codex plugin cache',
      pathApi.join(home, '.codex', 'plugins', 'cache'),
      'plugin',
      ['codex', 'agent-skills'],
      'codex'
    ),
    // Provider home roots also receive global npx installs; canonical roots alone miss them.
    ...providerHomeSources(home, pathApi, providerRootOverrides),
    // Why: discovery-only agent folders; installs for these agents go to the canonical root.
    source(
      'home-opencode',
      'OpenCode home',
      pathApi.join(home, '.config', 'opencode', 'skills'),
      'home',
      ['agent-skills'],
      'opencode'
    ),
    source(
      'home-pi',
      'Pi home',
      pathApi.join(home, '.pi', 'agent', 'skills'),
      'home',
      ['agent-skills'],
      'pi'
    ),
    source(
      'home-omp',
      'OMP home',
      pathApi.join(home, '.omp', 'agent', 'skills'),
      'home',
      ['agent-skills'],
      'omp'
    ),
    source(
      'home-qoder',
      'Qoder home',
      pathApi.join(home, '.qoder', 'skills'),
      'home',
      ['agent-skills'],
      'qoder'
    ),
    source('home-hermes', 'Hermes home', hermesSkillsRoot, 'home', ['agent-skills'], 'hermes'),
    // Codex/Claude above keep their dedicated providers and scan order; grok and
    // hermes keep their override/env-aware roots. Every other agent with a
    // dedicated root in AGENT_SKILL_HOME_DIRECTORIES is scanned generically.
    ...(Object.entries(AGENT_SKILL_HOME_DIRECTORIES) as [TuiAgent, readonly string[]][])
      // Main's provider registry already emitted these roots (with its overrides);
      // the generic pass only adds agents it does not cover.
      .filter(
        ([agent]) =>
          agent !== 'codex' &&
          agent !== 'hermes' &&
          agent !== 'opencode' &&
          agent !== 'pi' &&
          agent !== 'omp' &&
          !SKILL_INSTALL_PROVIDERS.some(
            (provider) => provider.id === agent && provider.globalSegments !== null
          )
      )
      .map(([agent, relativeDirectory]) =>
        source(
          `home-${agent}`,
          `${TUI_AGENT_DISPLAY_NAMES[agent]} home`,
          pathApi.join(home, ...relativeDirectory),
          'home',
          ['agent-skills'],
          agent
        )
      ),
    // Why: prime-agent keeps a dedicated root absent from AGENT_SKILL_HOME_DIRECTORIES.
    source(
      'home-prime-agent',
      'Prime Agent home',
      pathApi.join(home, '.prime', 'agent', 'skills'),
      'home',
      ['agent-skills'],
      'prime-agent'
    ),
    // Why: Muse installs to `.agents/skills` but also reads XDG config home.
    source(
      'home-muse',
      'Muse home',
      pathApi.join(home, '.config', 'muse', 'skills'),
      'home',
      ['agent-skills'],
      'muse'
    )
  ]

  const projectPaths = new Set<string>()
  for (const repo of args.repos ?? []) {
    // Why: runtime-owned repos can have no legacy connectionId while their
    // paths are meaningful only on a remote host.
    if (getRepoExecutionHostId(repo) !== LOCAL_EXECUTION_HOST_ID) {
      continue
    }
    projectPaths.add(repo.path)
  }
  if (args.includeCwd !== false) {
    projectPaths.add(cwd)
  }

  for (const repoPath of projectPaths) {
    const label = `Repo ${pathApi.basename(repoPath)}`
    roots.push(
      source(
        `repo-agents-${stablePathId(repoPath)}`,
        `${label} .agents`,
        pathApi.join(repoPath, '.agents', 'skills'),
        'repo',
        ['agent-skills'],
        null
      ),
      ...providerRepoSources(repoPath, label, pathApi),
      // OpenCode and Qoder also read their own project folders; they install into the canonical root above.
      source(
        `repo-qoder-${stablePathId(repoPath)}`,
        `${label} .qoder`,
        pathApi.join(repoPath, '.qoder', 'skills'),
        'repo',
        ['agent-skills'],
        'qoder'
      ),
      source(
        `repo-opencode-${stablePathId(repoPath)}`,
        `${label} .opencode`,
        pathApi.join(repoPath, '.opencode', 'skills'),
        'repo',
        ['agent-skills'],
        'opencode'
      )
    )
  }

  return roots
}
