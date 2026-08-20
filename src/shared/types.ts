// Thin re-export facade over the per-domain shared modules.
// Upstream split the old monolithic barrel; keep every historic export name
// working for the ~54 files that still import from here.

export type { WorkspaceSource as WorkspaceCreateTelemetrySource } from './workspace-source'
export type { TaskProvider } from './task-providers'
export type {
  GitBranchChangeStatus,
  GitConflictKind,
  GitConflictOperation,
  GitConflictResolutionStatus,
  GitConflictStatusSource,
  GitFileStatus,
  GitStagingArea,
  GitStatusEntry,
  GitStatusResult,
  GitSubmoduleStatus,
  GitUncommittedEntry,
  GitUpstreamStatus
} from './git-status-types'
export type { ForkSyncMode, GitForkSyncExpectedUpstream, GitForkSyncResult } from './git-fork-sync'
export type {
  GitLabAssignableUser,
  GitLabAuthDiagnostic,
  GitLabCommentResult,
  GitLabDiscussionResolveResult,
  GitLabIssueInfo,
  GitLabIssueState,
  GitLabIssueUpdate,
  GitLabJobTraceResult,
  GitLabRateLimitBucket,
  GitLabRateLimitSnapshot,
  GitLabMRApprovalRule,
  GitLabMRApprovalState,
  GitLabMRFile,
  GitLabMRInlineCommentInput,
  GitLabMRReviewersUpdateResult,
  GitLabMRUpdate,
  GitLabPagedResult,
  GitLabPipelineJob,
  GitLabProjectRef,
  GitLabProjectSettings,
  GitLabRetryJobResult,
  GitLabReaction,
  GitLabTodo,
  GitLabTodoTargetType,
  GitLabViewer,
  GitLabWorkItem,
  GitLabWorkItemDetails,
  GetGitLabRateLimitResult,
  ListMergeRequestsResult,
  MRCheckDetail,
  MRComment,
  MRInfo,
  MRListState,
  MRMergeableState,
  MRState
} from './gitlab-types'
export type {
  JiraAuthType,
  JiraComment,
  JiraConnectArgs,
  JiraConnectionStatus,
  JiraCreateField,
  JiraCreateFieldAllowedValue,
  JiraCreateIssueArgs,
  JiraCreateIssueResult,
  JiraIssue,
  JiraIssueFilter,
  JiraIssueType,
  JiraIssueUpdate,
  JiraMutationResult,
  JiraPriority,
  JiraProject,
  JiraProjectStatusOrder,
  JiraSite,
  JiraSiteSelection,
  JiraStatus,
  JiraTransition,
  JiraUser,
  JiraViewer
} from './jira-types'
export type {
  YunxiaoArchiveRequirementArgs,
  YunxiaoArchiveRequirementResult,
  YunxiaoCreateRequirementArgs,
  YunxiaoListWorkItemsArgs,
  YunxiaoListWorkItemsResult,
  YunxiaoRequirementFieldOption,
  YunxiaoRequirementFieldOptionsResult,
  YunxiaoRequirementPriority,
  YunxiaoRequirementContractDecision,
  YunxiaoRequirementContractOwner,
  YunxiaoRequirementContractQuestion,
  YunxiaoRequirementContractQuestionOption,
  YunxiaoRequirementContractSnapshot,
  YunxiaoRequirementContractStatus,
  YunxiaoRequirementDesignAlternative,
  YunxiaoRequirementGateOutcome,
  YunxiaoRequirementImplementationPlanSnapshot,
  YunxiaoRequirementMethodologyGate,
  YunxiaoRequirementResult,
  YunxiaoRequirementReviewCheck,
  YunxiaoRequirementReviewTier,
  YunxiaoRequirementRiskProfile,
  YunxiaoRequirementVerificationEvidence,
  YunxiaoTodoPoolAddArgs,
  YunxiaoTodoPoolItem,
  YunxiaoTodoPoolStatus,
  YunxiaoTodoPoolUpdateArgs,
  YunxiaoWorkItem,
  YunxiaoWorkItemCategory,
  YunxiaoWorkItemFacet,
  YunxiaoWorkItemFilters,
  YunxiaoWorkItemPerson,
  YunxiaoWorkItemSprint
} from './yunxiao-types'
export type { YunxiaoRequirementReviewExpectation } from './yunxiao-requirement-review-policy'
export type { YunxiaoRequirementCompletionGate } from './yunxiao-requirement-review-policy'

export type { ShellHydrationFailureReason, PathSource } from './shell-path-hydration-types'
export type { RepoKind, IssueSourcePreference, ExternalWorktreeVisibility, Repo, BaseRefDefaultResult, BaseRefSearchResult } from './repo-types'
export type { ProjectProviderIdentity, Project, ProjectUpdateArgs, ProjectHostSetupState, ProjectHostSetupMethod, RepoProjectHostSetupMethod, ProjectHostSetup, ProjectHostSetupExistingFolderArgs, ProjectHostSetupCreateArgs, ProjectHostSetupCloneArgs, ProjectHostSetupUpdateArgs, ProjectHostSetupDeleteArgs, ProjectHostSetupResult, ProjectHostSetupCreateResult, ProjectHostSetupUpdateResult, ProjectHostSetupDeleteResult } from './project-types'
export type { ProjectGroupCreatedFrom, ProjectGroup, NestedRepoScanOptions, NestedRepoCandidate, NestedRepoScanResult, ProjectGroupImportMode, ProjectGroupImportProjectResult, ProjectGroupImportResult } from './project-group-types'
export type { WorkspaceScope, WorkspaceKey, FolderWorkspace, FolderWorkspaceLinkedTask } from './folder-workspace-types'
export type { WorkspaceLinkedItem, GitWorktreeInfo, WorktreeHeadIdentity, WorkspaceStatus, WorkspaceStatusDefinition, Worktree, CliWorkspaceProvenance, WorkspaceCreatorProvenance, AutomationWorkspaceProvenance, AutomationWorkspaceProvenanceRequest, GitPushTarget, GitHubPrStartPoint, WorktreeOwnership, DetectedWorktreeListSource, DetectedWorktree, DetectedWorktreeListResult } from './worktree/types'
export type { SetupRunPolicy, SetupAgentStartupPolicy, HookCommandSourcePolicy, OrcaHooks, OrcaWorktreeDefaults, OrcaDefaultTabTemplate, OrcaVmRecipe, OrcaVmRecipeDiagnostic, RepoHookSettings, PersistedTrustedOrcaHookEntry, PersistedTrustedOrcaHookRepo, PersistedTrustedOrcaHooks } from './orca-yaml-hook-types'
export type { SetupDecision, WorktreeCreateTimingPhase, WorktreeCreateTiming, CreateSparseCheckoutRequest, SparsePreset, CreateWorktreeArgs, CreateWorktreeResult, WorktreeCreateBaseFallback, PreservedWorktreeBranch, RemoveWorktreeResult, ForceDeleteWorktreeBranchResult } from './worktree/create-types'
export type { WorktreeMeta } from './worktree/meta-types'
export type { WorktreeLineageOrigin, WorktreeLineageCaptureConfidence, WorktreeLineageCaptureSource, WorktreeLineageCapture, WorktreeLineage, WorkspaceLineage, WorktreeLineageWarningCode, WorktreeLineageWarning } from './worktree/lineage-types'
export type { DiffCommentSource, DiffReviewScope, MobileDiffReviewFileState, MobileDiffReviewState, DiffComment } from './diff-comment-types'
export type { TabGroupSplitDirection, TabGroupLayoutNode, TabContentType, WorkspaceVisibleTabType, CtrlTabOrderMode, Tab, TabGroup } from './tab-types'
export type { TerminalTab, TerminalPaneSplitDirection, TerminalPaneLayoutNode, TerminalLayoutSnapshot } from './terminal-tab-types'
export type { BrowserHistoryEntry, BrowserLoadError, BrowserCertificateFailure, BrowserCertificateProceedFailureReason, BrowserCertificateProceedResult, BrowserViewportPresetId, BrowserViewportOverride, BrowserPage, BrowserWorkspace, BrowserTab, BrowserSessionProfileScope, BrowserSessionUserAgentMode, BrowserSessionProfileCreateOptions, BrowserSessionProfileSource, BrowserSessionProfile, BrowserCookieImportSummary, BrowserCookieImportResult } from './browser-workspace-types'
export type { PersistedOpenFile, WorkspaceSessionState, WorkspaceSessionPatch } from './workspace-session-state-types'
export type { PRState, IssueState, CheckStatus, PRMergeableState, PRReviewDecision, PRConflictSummary, GitHubRepositoryIdentity, GitHubPRMergeMethod, GitHubPRMergeMethodSettings, GitHubPRStackEntry, GitHubPRStack, PRInfo, IssueInfo, GitHubViewer, GitHubAssignableUser, ProviderCheckSummary, GitHubPRReviewSummary, GitHubPRFileViewedState, GitHubPRFile, GitHubPRFileContents, GitHubOwnerRepo } from './github/pull-request-types'
export type { PRRefreshErrorType, PRRefreshUpstreamErrorType, PRRefreshOutcome, GitHubPRRefreshReason, GitHubPRRefreshEnqueueResult, GitHubPRRefreshAlias, GitHubPRRefreshCandidate, GitHubPRRefreshSkippedReason, GitHubPRRefreshEvent } from './github/pull-request-refresh-types'
export type { PRCheckDetail, PRCheckAnnotation, PRCheckStep, PRCheckJob, PRCheckRunDetails, GitHubRerunPRChecksResult } from './github/check-types'
export type { GitHubReactionContent, GitHubReaction, PRComment, GitHubIssueTimelineTarget, GitHubIssueTimelineItem, GitHubCommentResult, GitHubPRReviewCommentInput } from './github/comment-types'
export type { GitHubWorkItem, GitHubWorkItemDetails, ListWorkItemsResult } from './github/work-item-types'
export type { LinearViewer, LinearWorkspace, LinearWorkspaceSelection, LinearWorkspaceSelector, LinearConcreteWorkspaceId, LinearWorkspaceError, LinearCollectionResult, LinearConnectionStatus, LinearWorkflowState, LinearLabel, LinearMember, LinearTeam } from './linear/workspace-types'
export type { LinearIssue, LinearIssueChildSummary, LinearComment } from './linear/issue-types'
export type { LinearProjectSummary, LinearProjectStatusSummary, LinearProjectMemberSummary, LinearProjectMilestoneSummary, LinearProjectResourceSummary, LinearProjectUpdateSummary, LinearProjectDetail, LinearCustomViewModel, LinearCustomViewSummary } from './linear/project-types'
export type { GitHubCreateIssueFields, GitHubCreateIssueResult, GitHubIssueCloseReason, GitHubIssueUpdate, GitHubPullRequestStateUpdate, LinearIssueUpdate } from './issue-mutation-types'
export type { ClassifiedError } from './classified-error'
export type { GitHubRateLimitBucket, GitHubRateLimitSnapshot, GetRateLimitResult } from './github/rate-limit-types'
export type { WorktreeSetupLaunch, WorktreeStartupLaunch, WorktreeDefaultTabsLaunch, SetupScriptLaunchMode, SetupSplitDirection } from './worktree/launch-types'
export type { LocalBaseRefRefreshResult, LocalBaseRefUpdateSuggestion, WorktreeBaseStatusKind, WorktreeBaseStatusEvent, WorktreeRemoteBranchConflictEvent } from './worktree/base-ref-drift-types'
export type { ChangelogRelease, ChangelogData, UpdateCheckOptions, UpdateSource, LinuxRootPackageType, LinuxPackageInstallFailureReason, LinuxPackageInstallRecovery, LinuxPackageCommandUnavailableReason, LinuxPackageInstallInstructions, UpdateStatus, ReleaseBuildListResult } from './update-status-types'
export type { NotificationSettings, NotificationEventSource, NotificationDispatchRequest, NotificationDispatchResult, NotificationDismissResult, NotificationSoundResult, NotificationSoundDataResult, NotificationSoundPathResult, NotificationPermissionStatusResult, NotificationDeliveryProbeResult } from './notification-settings-types'
export type { CodexManagedAccount, CodexManagedAccountSummary, CodexSystemDefaultIdentity, CodexRateLimitAccountsState, CodexManagedAccountRuntimeSelection, ClaudeManagedAccount, ClaudeManagedAccountSummary, ClaudeRateLimitAccountsState, ClaudeManagedAccountRuntimeSelection } from './managed-account-types'
export type { TuiAgent } from './tui-agent'
export type { TaskViewPresetId, OpenInApplication, SourceControlViewMode, SourceControlGroupOrder, LeftSidebarAppearanceMode, BranchPrefixStrategy, FloatingTerminalCwdRequest, AgentDashboardMode, WorktreeCardProperty, WorktreeCardMode, AgentActivityDisplayMode, StatusBarItem, FloatingTerminalTriggerLocation, TaskResumeState, RightSidebarTab, ActiveRightSidebarTab, RightSidebarExplorerView, ProjectOrderBy, WorkspaceHostScope, VisibleWorkspaceHostIds, WorkspaceHostOrder, ManualRepoOrderEntry, TopLevelView } from './ui-chrome-types'
export type { TerminalColorOverrides } from './terminal-color-overrides'
export type { TerminalQuickCommandScope, TerminalQuickCommandAction, TerminalQuickCommandBase, TerminalCommandQuickCommand, TerminalAgentQuickCommand, TerminalQuickCommand } from './terminal-quick-command-types'
export type { HostSettingOverrides } from './host-setting-overrides'
export type { GlobalSettings, OrcaWorkspaceLayout, GhosttyImportPreview } from './global-settings-types'
export type { CommitMessageAiModelCapability, CommitMessageAiSettings } from './commit-message-ai-types'
export type { DiscoveryStatusEmitted, OnboardingOutcome, OnboardingChecklistState, OnboardingState } from './onboarding-state-types'
export type { PersistedUIState } from './persisted-ui-state-types'
export type { CustomPet, SpriteAnimation } from './pet-types'
export { PET_SIZE_MIN, PET_SIZE_MAX, PET_SIZE_DEFAULT } from './pet-types'
export type { LegacyPaneKeyAliasEntry, PersistedMobileClientTabSelection, PersistedMobileClientTabSelections, PersistedState } from './persisted-state-types'
export type { FilesystemPathFlavor, DirEntry, MarkdownDocument, FsChangeEvent, FsChangedPayload } from './filesystem-entry-types'
export type { GitBranchChangeEntry, GitBranchCompareSummary, GitBranchCompareResult, GitCommitCompareSummary, GitCommitCompareResult, GitDiffTextResult, GitDiffBinaryResult, GitDiffResult } from './git-diff-compare-types'
export type { SearchMatch, SearchFileResult, SearchResult, SearchOptions } from './code-search-types'
export type { StatsSummary, UsageValues, ProcessMemoryMetric, HostAvailableMemorySource, AppMemory, SessionMemory, WorktreeMemory, HostMemory, MemorySnapshot } from './process-stats-types'
