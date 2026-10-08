import type { StoreRuntimeState } from './store-runtime-state'
import type { Store } from './store'
import { LoadedStateAdaptationOperations } from './loaded-state-adaptation'
import { LoadedCohortMigrationOperations } from './loaded-cohort-migrations'
import { LoadedStateParsingOperations } from './loaded-state-parsing'
import { StateSerializationSecretHandlingOperations } from './state-serialization-secret-handling'
import {
  PrimaryStateWriteOperations,
  installPrimaryStateWriteOperationsContext
} from './primary-state-writes'
import {
  WriteSchedulingOperations,
  installWriteSchedulingOperationsContext
} from './write-scheduling'
import {
  WriteFlushBarrierOperations,
  installWriteFlushBarrierOperationsContext
} from './write-flush-barriers'
import { ProfilePreferences, installProfilePreferencesContext } from './profile-preferences'
import {
  RepoLifecycleOperations,
  installRepoLifecycleOperationsContext
} from './repo-lifecycle-operations'
import { TerminalBindingRecoveryOperations } from './terminal-binding-recovery'
import {
  SessionHostPartitionOperations,
  installSessionHostPartitionOperationsContext
} from './session-host-partitions'
import {
  SessionSnapshotOperations,
  installSessionSnapshotOperationsContext
} from './session-snapshot-operations'
import {
  MetadataLineageOperations,
  installMetadataLineageOperationsContext
} from './metadata-lineage-operations'
import {
  ProjectCollectionOperations,
  installProjectCollectionOperationsContext
} from './project-collection-operations'
import {
  AutomationPersistence,
  installAutomationPersistenceContext
} from './automation-persistence'
import {
  YunxiaoTodoPoolOperations,
  installYunxiaoTodoPoolOperationsContext
} from './yunxiao-todo-pool-operations'
import {
  YunxiaoTodoPoolClaimOperations,
  installYunxiaoTodoPoolClaimOperationsContext
} from './yunxiao-todo-pool-claims'
import {
  MobileTabSelectionPersistence,
  installMobileTabSelectionPersistenceContext
} from './mobile-tab-selection-persistence'
import {
  SparsePresetPersistence,
  installSparsePresetPersistenceContext
} from './sparse-preset-persistence'
import {
  PtyBindingPersistenceOperations,
  installPtyBindingPersistenceOperationsContext
} from './pty-binding-persistence'
import { SshProfileOperations, installSshProfileOperationsContext } from './ssh-profile-operations'
import {
  RetiredWorktreeNamePersistence,
  installRetiredWorktreeNamePersistenceContext
} from './retired-worktree-name-persistence'
import {
  SshLeaseRecoveryOperations,
  installSshLeaseRecoveryOperationsContext
} from './ssh-lease-recovery-operations'
import {
  OrcadSourceExportPersistence,
  installOrcadSourceExportPersistenceContext
} from '../migrating-orcad-catalog/orcad-source-export'
import {
  OrcadCatalogImportPersistence,
  installOrcadCatalogImportPersistenceContext
} from '../migrating-orcad-catalog/orcad-catalog-import'

export type StoreDomainOperations = WriteSchedulingOperations &
  PrimaryStateWriteOperations &
  ProjectCollectionOperations &
  RepoLifecycleOperations &
  MobileTabSelectionPersistence &
  SparsePresetPersistence &
  AutomationPersistence &
  MetadataLineageOperations &
  ProfilePreferences &
  SessionHostPartitionOperations &
  SessionSnapshotOperations &
  PtyBindingPersistenceOperations &
  SshProfileOperations &
  RetiredWorktreeNamePersistence &
  SshLeaseRecoveryOperations &
  OrcadSourceExportPersistence &
  OrcadCatalogImportPersistence &
  YunxiaoTodoPoolOperations &
  YunxiaoTodoPoolClaimOperations &
  WriteFlushBarrierOperations

export type StoreDomains = {
  adaptation: LoadedStateAdaptationOperations
  cohorts: LoadedCohortMigrationOperations
  loader: LoadedStateParsingOperations
  serialization: StateSerializationSecretHandlingOperations
  writes: PrimaryStateWriteOperations
  scheduling: WriteSchedulingOperations
  flushBarriers: WriteFlushBarrierOperations
  preferences: ProfilePreferences
  repos: RepoLifecycleOperations
  bindingRecovery: TerminalBindingRecoveryOperations
  sessions: SessionHostPartitionOperations
  sessionSnapshots: SessionSnapshotOperations
  metadata: MetadataLineageOperations
  projects: ProjectCollectionOperations
  automations: AutomationPersistence
  yunxiaoTodoPool: YunxiaoTodoPoolOperations
  yunxiaoTodoPoolClaims: YunxiaoTodoPoolClaimOperations
  mobileTabSelections: MobileTabSelectionPersistence
  sparsePresets: SparsePresetPersistence
  ptyBindings: PtyBindingPersistenceOperations
  sshProfiles: SshProfileOperations
  retiredWorktreeNames: RetiredWorktreeNamePersistence
  sshLeases: SshLeaseRecoveryOperations
  orcadSourceExport: OrcadSourceExportPersistence
  orcadCatalogImports: OrcadCatalogImportPersistence
}

export const STORE_DOMAIN_OPERATION_CLASSES = [
  WriteSchedulingOperations,
  PrimaryStateWriteOperations,
  ProjectCollectionOperations,
  RepoLifecycleOperations,
  MobileTabSelectionPersistence,
  SparsePresetPersistence,
  AutomationPersistence,
  YunxiaoTodoPoolOperations,
  YunxiaoTodoPoolClaimOperations,
  MetadataLineageOperations,
  ProfilePreferences,
  SessionHostPartitionOperations,
  SessionSnapshotOperations,
  PtyBindingPersistenceOperations,
  SshProfileOperations,
  RetiredWorktreeNamePersistence,
  SshLeaseRecoveryOperations,
  OrcadSourceExportPersistence,
  OrcadCatalogImportPersistence,
  WriteFlushBarrierOperations
] as const

export function installStoreDomainContexts(target: Store, domains: StoreDomains): void {
  installWriteSchedulingOperationsContext(target, domains.scheduling)
  installPrimaryStateWriteOperationsContext(target, domains.writes)
  installProjectCollectionOperationsContext(target, domains.projects)
  installRepoLifecycleOperationsContext(target, domains.repos)
  installMobileTabSelectionPersistenceContext(target, domains.mobileTabSelections)
  installSparsePresetPersistenceContext(target, domains.sparsePresets)
  installAutomationPersistenceContext(target, domains.automations)
  installYunxiaoTodoPoolOperationsContext(target, domains.yunxiaoTodoPool)
  installYunxiaoTodoPoolClaimOperationsContext(target, domains.yunxiaoTodoPoolClaims)
  installMetadataLineageOperationsContext(target, domains.metadata)
  installProfilePreferencesContext(target, domains.preferences)
  installSessionHostPartitionOperationsContext(target, domains.sessions)
  installSessionSnapshotOperationsContext(target, domains.sessionSnapshots)
  installPtyBindingPersistenceOperationsContext(target, domains.ptyBindings)
  installSshProfileOperationsContext(target, domains.sshProfiles)
  installRetiredWorktreeNamePersistenceContext(target, domains.retiredWorktreeNames)
  installSshLeaseRecoveryOperationsContext(target, domains.sshLeases)
  installOrcadSourceExportPersistenceContext(target, domains.orcadSourceExport)
  installOrcadCatalogImportPersistenceContext(target, domains.orcadCatalogImports)
  installWriteFlushBarrierOperationsContext(target, domains.flushBarriers)
}

export function createStoreDomains(runtime: StoreRuntimeState): StoreDomains {
  const adaptation = new LoadedStateAdaptationOperations(runtime)
  const cohorts = new LoadedCohortMigrationOperations(runtime)
  const loader = new LoadedStateParsingOperations(runtime, cohorts)
  const serialization = new StateSerializationSecretHandlingOperations(runtime)
  const writes = new PrimaryStateWriteOperations(runtime, serialization)
  const scheduling = new WriteSchedulingOperations(runtime, writes)
  const flushBarriers = new WriteFlushBarrierOperations(runtime, writes)
  const preferences = new ProfilePreferences(runtime, scheduling)
  const repos = new RepoLifecycleOperations(runtime, scheduling)
  const bindingRecovery = new TerminalBindingRecoveryOperations(runtime)
  const sessions = new SessionHostPartitionOperations(runtime, scheduling, bindingRecovery)
  const sessionSnapshots = new SessionSnapshotOperations(
    runtime,
    sessions,
    bindingRecovery,
    scheduling
  )
  const metadata = new MetadataLineageOperations(runtime, scheduling, sessions)
  const projects = new ProjectCollectionOperations(runtime, repos, scheduling, metadata)
  const yunxiaoTodoPool = new YunxiaoTodoPoolOperations(runtime, scheduling)
  const yunxiaoTodoPoolClaims = new YunxiaoTodoPoolClaimOperations(
    runtime,
    scheduling,
    yunxiaoTodoPool
  )
  const automations = new AutomationPersistence(
    runtime,
    flushBarriers,
    preferences,
    yunxiaoTodoPoolClaims
  )
  const mobileTabSelections = new MobileTabSelectionPersistence(runtime, scheduling)
  const sparsePresets = new SparsePresetPersistence(runtime, scheduling)
  const ptyBindings = new PtyBindingPersistenceOperations(runtime, sessions)
  const sshProfiles = new SshProfileOperations(runtime, scheduling, repos)
  const retiredWorktreeNames = new RetiredWorktreeNamePersistence(runtime, scheduling)
  const sshLeases = new SshLeaseRecoveryOperations(
    runtime,
    flushBarriers,
    bindingRecovery,
    scheduling
  )
  const orcadCatalogImports = new OrcadCatalogImportPersistence(runtime, repos, scheduling)
  return {
    adaptation,
    cohorts,
    loader,
    serialization,
    writes,
    scheduling,
    flushBarriers,
    preferences,
    repos,
    bindingRecovery,
    sessions,
    sessionSnapshots,
    metadata,
    projects,
    automations,
    yunxiaoTodoPool,
    yunxiaoTodoPoolClaims,
    mobileTabSelections,
    sparsePresets,
    ptyBindings,
    sshProfiles,
    retiredWorktreeNames,
    sshLeases,
    // Read-only: holds the runtime state and nothing that writes.
    orcadSourceExport: new OrcadSourceExportPersistence(runtime),
    orcadCatalogImports
  }
}
