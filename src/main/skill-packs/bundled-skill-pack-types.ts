import type { DfHisEnvironmentPrerequisiteId } from '../../shared/dfhis-environment-types'

export type BundledSkillPackTarget<
  PrerequisiteId extends string = string,
  ProviderTarget extends string = string
> = {
  id: PrerequisiteId
  providerTarget: ProviderTarget
  label: string
  relativeDirectory: readonly string[]
}

export type BundledSkillPackDefinition<
  SkillName extends string = string,
  Target extends BundledSkillPackTarget = BundledSkillPackTarget
> = {
  id: string
  label: string
  bundledResourcePath: string
  manifestFileName: string
  skillNames: readonly SkillName[]
  targets: readonly Target[]
}

export type EnvironmentBundledSkillPackDefinition = BundledSkillPackDefinition<
  string,
  BundledSkillPackTarget<DfHisEnvironmentPrerequisiteId, string>
>

export type BundledSkillPackManifest = {
  schemaVersion: 1
  skillPackId?: string
  source?: 'app-bundle'
  packageHash: string
  providerTarget: string
  installedAt: string
  orcaVersion: string
}
