/* eslint-disable max-lines -- Why: the preload contract is intentionally centralized in one declaration file so renderer and preload stay in lockstep when IPC surfaces change. */
import type {
  CreateHostedReviewArgs,
  CreateHostedReviewResult,
  HostedReviewCreationEligibility,
  HostedReviewCreationEligibilityArgs,
  HostedReviewForBranchArgs,
  HostedReviewInfo,
  HostedReviewProvider
} from '../shared/hosted-review'
import type { NativeFileDropPayload } from '../shared/native-file-drop'
import type { ComputerAwakeStatus } from '../shared/computer-awake-mode'
import type { BrowserFindSource } from '../shared/browser-find-source'
import type {
  DashboardRevealAgentArgs,
  DashboardSleepWorkspaceArgs,
  DashboardSnapshot,
  DashboardSpawnAgentArgs
} from '../shared/dashboard-snapshot'
import type {
  TerminalPreviewConnectResult,
  TerminalPreviewDataPayload
} from '../shared/terminal-preview'
import type {
  TerminalTabCloseRequest,
  TerminalTabCloseResponse
} from '../shared/terminal-tab-close'
import type { TerminalTabCreateReply } from '../shared/terminal-reveal-identity'
import type {
  LocalLogTailChangedPayload,
  LocalLogTailReadArgs,
  LocalLogTailReadResult,
  LocalLogTailWatchArgs
} from '../shared/local-log-tail-types'
import type { ReadClipboardTextOptions } from '../shared/clipboard-text'
import type { AppIdentity } from '../shared/app-identity'
import type { ReleaseChannel } from '../shared/release-channel'
import type {
  ForgetRemovedWorktreesForExecutionHostArgs,
  ForgetRemovedWorktreesForExecutionHostResult,
  HostQualifiedKnownWorktreeResult,
  HostQualifiedDetectedWorktreeResult,
  LegacyDetectedWorktreeRequest,
  ListKnownWorktreesForExecutionHostArgs,
  ListDetectedWorktreesArgs,
  ProviderRequestId
} from '../shared/detected-worktree-provider-contract'
import type {
  HostRepoCatalogSnapshot,
  ListReposForExecutionHostArgs
} from '../shared/host-repo-catalog-contract'
import type {
  HostLineageSnapshot,
  ListDesktopLineageForHostArgs
} from '../shared/host-lineage-contract'
import type {
  WriteTerminalRenderDesyncEvidenceArgs,
  WriteTerminalRenderDesyncEvidenceResult
} from '../shared/terminal-render-desync-evidence'
import type { MobileRelayStatus } from '../shared/mobile-relay-status'
import type { MobilePairingConnectionMode } from '../shared/mobile-pairing-connection-mode'
import type { RuntimePairingReach } from '../shared/runtime-pairing-reach'
import type { MobileRelayMintFailure } from '../shared/mobile-relay-mint-failure'
import type { VerifyAndAddRuntimeEnvironmentResult } from '../shared/remote-pairing-verification'
import type {
  SshMutationExpectation,
  SshConnectionState,
  SshConfigHostListArgs,
  SshConfigHostListResult,
  SshConfigHostResolution,
  SshConfigImportResult,
  SshTargetAddResult,
  SshTarget,
  PortForwardEntry,
  EnrichedDetectedPort
} from '../shared/ssh-types'
import type {
  CreateLocalOrcaProfileArgs,
  CreateLocalOrcaProfileResult,
  CreateCloudLinkedOrcaProfileArgs,
  CreateCloudLinkedOrcaProfileResult,
  ConnectCurrentOrcaProfileResult,
  FindOrcaProfileProjectsByPathArgs,
  FindOrcaProfileProjectsByPathResult,
  OrcaProfileListResult,
  OrcaProfileAuthStatus,
  RefreshCurrentOrcaProfileAuthResult,
  SelectOrcaProfileOrgArgs,
  SelectOrcaProfileOrgResult,
  SignOutCurrentOrcaProfileResult,
  SwitchOrcaProfileArgs,
  SwitchOrcaProfileResult,
  TransferOrcaProfileProjectArgs,
  TransferOrcaProfileProjectResult,
  OrcaProfileOrgInviteRevokeArgs,
  OrcaProfileOrgMemberChangeRoleArgs,
  OrcaProfileOrgMemberInviteArgs,
  OrcaProfileOrgMemberMutationResult,
  OrcaProfileOrgMemberRemoveArgs,
  OrcaProfileOrgMembersListArgs,
  OrcaProfileOrgMembersListResult
} from '../shared/orca-profiles'
import type { TerminalPaneSplitSource } from '../shared/feature-education-telemetry'
import type { TaskSourceContext } from '../shared/task-source-context'
import type { LinearIssueAttributeFilter } from '../shared/linear-issue-attribute-filter'
import type { ProjectExecutionRuntimeResolution } from '../shared/project-execution-runtime'
import type { StartupCommandDelivery } from '../shared/codex-startup-delivery'
import type {
  AgentProviderSessionMetadata,
  SleepingAgentLaunchConfig
} from '../shared/agent-session-resume'
import type {
  PluginPanelActionOutcome,
  PluginPanelEntry
} from '../shared/plugins/plugin-panel-bridge'
import type { PluginConsentRequest } from '../shared/plugins/plugin-consent-request'
import type { PluginLanguagePackRegistration } from '../shared/plugins/plugin-language-pack-artifact'
import type { PluginChangeEvent } from '../shared/plugins/plugin-change-event'
import type { PluginManifest } from '../shared/plugins/plugin-manifest'
import type { PluginMarketplaceGitSource } from '../shared/plugins/plugin-marketplace'
import type {
  LocalhostWorktreeLabelResult,
  LocalhostWorktreeLabelRoute
} from '../shared/localhost-worktree-labels'
import type {
  FolderWorkspacePathStatus,
  FolderWorkspacePathStatusRequest
} from '../shared/folder-workspace-path-status'
import type {
  BaseRefDefaultResult,
  BaseRefSearchResult,
  BrowserCookieImportResult,
  BrowserCertificateFailure,
  BrowserCertificateProceedResult,
  BrowserLoadError,
  BrowserSessionProfile,
  BrowserSessionProfileCreateOptions,
  BrowserSessionProfileScope,
  BrowserSessionProfileSource,
  BrowserViewportOverride,
  ClaudeRateLimitAccountsState,
  ClassifiedError,
  CodexRateLimitAccountsState,
  CreateWorktreeArgs,
  CreateWorktreeResult,
  CustomPet,
  DetectedWorktreeListResult,
  DirEntry,
  FilesystemPathFlavor,
  ForceDeleteWorktreeBranchResult,
  FsChangedPayload,
  GhosttyImportPreview,
  GlobalSettings,
  GitBranchCompareResult,
  GitCommitCompareResult,
  GitConflictOperation,
  GitDiffResult,
  GitForkSyncExpectedUpstream,
  GitForkSyncResult,
  GitPushTarget,
  GitStagingArea,
  GitStatusResult,
  GitUpstreamStatus,
  GitHubAssignableUser,
  GitHubCreateIssueResult,
  GitHubPRFile,
  GitHubPRFileContents,
  GitHubPrStartPoint,
  GitHubPRReviewCommentInput,
  GitHubCommentResult,
  GitHubOwnerRepo,
  GitHubWorkItem,
  GitHubWorkItemDetails,
  GitHubViewer,
  GitLabAssignableUser,
  GitLabAuthDiagnostic,
  GitLabCommentResult,
  GitLabDiscussionResolveResult,
  GitLabIssueInfo,
  GitLabIssueUpdate,
  GitLabJobTraceResult,
  GitLabMRInlineCommentInput,
  GitLabMRReviewersUpdateResult,
  GitLabMRUpdate,
  GitLabProjectRef,
  GitLabRetryJobResult,
  YunxiaoArchiveRequirementArgs,
  YunxiaoArchiveRequirementResult,
  YunxiaoCreateRequirementArgs,
  YunxiaoListWorkItemsArgs,
  YunxiaoListWorkItemsResult,
  YunxiaoRequirementFieldOptionsResult,
  YunxiaoRequirementResult,
  YunxiaoTodoPoolAddArgs,
  YunxiaoTodoPoolItem,
  YunxiaoTodoPoolUpdateArgs,
  GitLabTodo,
  GitLabViewer,
  GitLabWorkItem,
  GitLabWorkItemDetails,
  GetGitLabRateLimitResult,
  ListMergeRequestsResult,
  MRInfo,
  MRListState,
  ListWorkItemsResult,
  IssueInfo,
  JiraComment,
  JiraConnectionStatus,
  JiraCreateField,
  JiraCreateIssueArgs,
  JiraIssue,
  JiraIssueFilter,
  JiraIssueType,
  JiraProjectStatusOrder,
  JiraIssueUpdate,
  JiraPriority,
  JiraProject,
  JiraSiteSelection,
  JiraTransition,
  JiraUser,
  JiraViewer,
  LinearViewer,
  LinearCollectionResult,
  LinearConnectionStatus,
  LinearCustomViewModel,
  LinearCustomViewSummary,
  LinearWorkspaceSelection,
  LinearIssue,
  LinearIssueUpdate,
  LinearComment,
  LinearWorkflowState,
  LinearLabel,
  LinearMember,
  LinearProjectDetail,
  LinearProjectSummary,
  LinearTeam,
  MarkdownDocument,
  FloatingTerminalCwdRequest,
  GitHubIssueUpdate,
  GitHubReactionContent,
  GitHubPRRefreshCandidate,
  GitHubPRRefreshEnqueueResult,
  GitHubPRRefreshEvent,
  GitHubPRRefreshReason,
  GetRateLimitResult,
  NotificationDispatchRequest,
  NotificationDispatchResult,
  NotificationDeliveryProbeResult,
  NotificationDismissResult,
  NotificationPermissionStatusResult,
  NotificationSoundResult,
  OnboardingState,
  OrcaHooks,
  PathSource,
  PersistedUIState,
  PRCheckDetail,
  PRCheckRunDetails,
  PRComment,
  PRInfo,
  PRRefreshOutcome,
  Project,
  ProjectUpdateArgs,
  Repo,
  ProjectGroup,
  ProjectHostSetup,
  ProjectHostSetupCreateArgs,
  ProjectHostSetupCreateResult,
  ProjectHostSetupDeleteArgs,
  ProjectHostSetupDeleteResult,
  ProjectHostSetupExistingFolderArgs,
  ProjectHostSetupResult,
  ProjectHostSetupUpdateArgs,
  ProjectHostSetupUpdateResult,
  FolderWorkspace,
  ProjectGroupImportResult,
  ProjectGroupImportMode,
  ShellHydrationFailureReason,
  SparsePreset,
  SearchOptions,
  NestedRepoScanResult,
  SearchResult,
  StatsSummary,
  MemorySnapshot,
  TuiAgent,
  ReleaseBuildListResult,
  UpdateCheckOptions,
  UpdateStatus,
  Worktree,
  WorktreeBaseStatusEvent,
  WorktreeHeadIdentity,
  WorktreeLineage,
  WorkspaceLineage,
  WorktreeMeta,
  WorktreeRemoteBranchConflictEvent,
  RemoveWorktreeResult,
  WorktreeDefaultTabsLaunch,
  WorktreeSetupLaunch,
  WorktreeStartupLaunch,
  WorkspaceSessionPatch,
  WorkspaceSessionState,
  LinuxPackageInstallInstructions
} from '../shared/types'
import type { PtyModelRestoreNeededEvent } from '../shared/pty-model-restore-marker'
import type { PtyListedSession } from '../shared/pty-listed-session'
import type {
  PtyRendererDeliveryHealthReply,
  PtyRendererDeliveryStateReport
} from '../shared/pty-renderer-delivery-health'
import type { TerminalViewAttributes } from '../shared/terminal-view-attributes'
import type { PtyMainDeliveryDiagnostics } from '../shared/pty-delivery-diagnostics'
import type {
  WarpThemeImportPreview,
  WarpThemeImportSource
} from '../shared/terminal-custom-themes'

import type { SetupScriptImportCandidate } from '../shared/setup-script-imports'
import type { GitHistoryOptions, GitHistoryResult } from '../shared/git-history'
import type { PublicKnownRuntimeEnvironment } from '../shared/runtime-environments'
import type { EphemeralVmRecipeDoctorResult } from '../shared/ephemeral-vm-recipes'
import type { EphemeralVmRecipeResultWarning } from '../shared/ephemeral-vm-recipe-diagnostics'
import type { EphemeralVmRuntimeRecord } from '../shared/ephemeral-vm-runtimes'
import type { RuntimeAccessGrant } from '../shared/runtime-access-grants'
import type { RuntimeRpcResponse } from '../shared/runtime-rpc-envelope'
import type { ExecutionHostId } from '../shared/execution-host'
import type { FeatureInteractionId } from '../shared/feature-interactions'
import type {
  AddIssueCommentBySlugArgs,
  ClearProjectItemFieldArgs,
  DeleteIssueCommentBySlugArgs,
  GetProjectViewTableArgs,
  GetProjectViewTableResult,
  GitHubProjectCommentMutationResult,
  GitHubProjectMutationResult,
  ListAccessibleProjectsArgs,
  ListAccessibleProjectsResult,
  ListAssignableUsersBySlugArgs,
  ListAssignableUsersBySlugResult,
  ListIssueTypesBySlugArgs,
  ListIssueTypesBySlugResult,
  ListLabelsBySlugArgs,
  ListLabelsBySlugResult,
  ListProjectViewsArgs,
  ListProjectViewsResult,
  ProjectWorkItemDetailsBySlugArgs,
  ProjectWorkItemDetailsBySlugResult,
  ResolveProjectRefArgs,
  ResolveProjectRefResult,
  UpdateIssueBySlugArgs,
  UpdateIssueCommentBySlugArgs,
  UpdateIssueTypeBySlugArgs,
  UpdatePullRequestBySlugArgs,
  UpdateProjectItemFieldArgs
} from '../shared/github-project-types'
import type {
  RichMarkdownContextMenuCommandPayload,
  RichMarkdownContextMenuTableTarget
} from '../shared/rich-markdown-context-menu'
import type {
  BrowserSetGrabModeArgs,
  BrowserSetGrabModeResult,
  BrowserAwaitGrabSelectionArgs,
  BrowserGrabResult,
  BrowserCancelGrabArgs,
  BrowserCaptureSelectionScreenshotArgs,
  BrowserCaptureSelectionScreenshotResult,
  BrowserExtractHoverArgs,
  BrowserExtractHoverResult
} from '../shared/browser-grab-types'
import type {
  BrowserContextMenuDismissedEvent,
  BrowserContextMenuRequestedEvent,
  BrowserDownloadFinishedEvent,
  BrowserDownloadProgressEvent,
  BrowserDownloadRequestedEvent,
  BrowserPermissionDeniedEvent,
  BrowserPopupEvent
} from '../shared/browser-guest-events'
import type { ElectronAPI } from '@electron-toolkit/preload'
import type {
  ClaudeAccountsApi,
  CodexAccountsApi,
  CodexConfigSyncApi,
  GrokAccountsApi,
  MinimaxCredentialsApi
} from './api/agent-account-api'
import type { AgentHooksApi, HooksApi } from './api/agent-hook-api'
import type { SkillsApi } from './api/agent-skill-api'
import type { AgentAwakeApi, AgentStatusApi, AgentTrustApi } from './api/agent-status-api'
import type {
  ClaudeUsageApi,
  CodexUsageApi,
  OpenCodeUsageApi,
  RateLimitsApi
} from './api/agent-usage-api'
import type { AiVaultApi } from './api/ai-vault-api'
import type { AppApi, E2EApi, PlatformApi } from './api/app-api'
import type { AutomationsApi } from './api/automation-api'
import type { BrowserApi } from './api/browser-api'
import type { CliApi } from './api/cli-install-api'
import type { CrashReportsApi, FeedbackApi } from './api/crash-report-api'
import type { DashboardApi, TerminalPreviewApi } from './api/dashboard-api'
import type { EmulatorApi } from './api/emulator-api'
import type { EphemeralVmApi } from './api/ephemeral-vm-api'
import type { ExportApi, FilesystemApi } from './api/filesystem-api'
import type { GitInspectionApi } from './api/git-inspection-api'
import type { GitOperationApi } from './api/git-operation-api'
import type { GithubPullRequestApi } from './api/github-pull-request-api'
import type { GithubWorkItemApi } from './api/github-work-item-api'
import type { GitLabApi } from './api/gitlab-api'
import type { BitbucketApi, HostedReviewApi } from './api/hosted-review-api'
import type { JiraApi } from './api/jira-api'
import type { LinearApi } from './api/linear-api'
import type { MobileApi } from './api/mobile-api'
import type { NativeChatApi } from './api/native-chat-api'
import type { OnboardingApi, StarNagApi } from './api/onboarding-api'
import type { OrcaProfileApi } from './api/orca-profile-api'
import type {
  CommitMessageAgentCapability,
  CommitMessageModelCapability
} from '../shared/commit-message-agent-spec'
import type { ResolvedSourceControlAiGenerationParams } from '../shared/source-control-ai'
import type { SourceControlAiSettings } from '../shared/source-control-ai-types'
import type {
  ShellOpenExternalEditorRequest,
  ShellOpenExternalEditorResult,
  ShellOpenLocalPathResult
} from '../shared/shell-open-types'
import type { SkillDiscoveryResult, SkillDiscoveryTarget } from '../shared/skills'
import type {
  SkillFreshnessInventory,
  SkillUpdateRun,
  SkillUpdateStartResult
} from '../shared/skill-freshness'
import type {
  DfHisEnvironmentConfigInput,
  DfHisEnvironmentConfigSnapshot,
  DfHisEnvironmentCheckResult,
  DfHisEnvironmentInstallResult
} from '../shared/dfhis-environment-types'
import type {
  CrashReportBreadcrumbData,
  CrashReportCopyDiagnosticsArgs,
  CrashReportRecord,
  CrashReportSubmitArgs,
  CrashReportSubmitResult,
  ReactErrorBoundaryReportArgs,
  ReactErrorBoundaryReportResult
} from '../shared/crash-reporting'
import type { RendererHeapStatistics } from '../shared/renderer-heap-statistics'

export type {
  ShellOpenExternalEditorRequest,
  ShellOpenExternalEditorResult,
  ShellOpenLocalPathResult
} from '../shared/shell-open-types'

type RuntimeEnvironmentSubscriptionHandle = {
  unsubscribe: () => void
  sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => void
}
import type {
  RuntimeMobileMarkdownRequest,
  RuntimeMobileMarkdownResponse
} from '../shared/mobile-markdown-document'
import type {
  DeveloperPermissionId,
  DeveloperPermissionRequestResult,
  DeveloperPermissionState,
  LocalNetworkConnectionTestResult
} from '../shared/developer-permissions-types'
import type {
  ComputerUsePermissionId,
  ComputerUsePermissionResetResult,
  ComputerUsePermissionSetupResult,
  ComputerUsePermissionStatusResult
} from '../shared/computer-use-permissions-types'
import type { ClaudeUsageBreakdownKind, ClaudeUsageSnapshot } from '../shared/claude-usage-types'
import type {
  CodexRateLimitResetResult,
  GrokAccountStatus,
  RateLimitRuntimeTarget,
  RateLimitState
} from '../shared/rate-limit-types'
import type {
  SpeechErrorEvent,
  SpeechLifecycleEvent,
  SpeechModelManifest,
  SpeechModelState,
  SpeechTranscriptEvent
} from '../shared/speech-types'
import type {
  WorkspaceSpaceAnalyzeResult,
  WorkspaceSpaceScanProgress
} from '../shared/workspace-space-types'
import type {
  WorkspacePortAdvertisedUrlChangedEvent,
  WorkspacePortKillRequest,
  WorkspacePortKillResult,
  WorkspacePortScanRequest,
  WorkspacePortScanResult
} from '../shared/workspace-ports'
import type { GhAuthDiagnostic } from '../shared/github-auth-types'
import type { CodexUsageBreakdownKind, CodexUsageSnapshot } from '../shared/codex-usage-types'
import type {
  OpenCodeUsageBreakdownKind,
  OpenCodeUsageSnapshot
} from '../shared/opencode-usage-types'
import type {
  AiVaultDeleteSessionArgs,
  AiVaultDeleteSessionResult
} from '../shared/ai-vault-session-deletion'
import type {
  AiVaultFirstUserPromptArgs,
  AiVaultFirstUserPromptResult,
  AiVaultListArgs,
  AiVaultListResult,
  AiVaultSession,
  AiVaultSubagentListArgs,
  AiVaultSubagentListResult
} from '../shared/ai-vault-types'
import type {
  AiVaultSessionTitlesArgs,
  AiVaultSessionTitlesResult
} from '../shared/ai-vault-session-title'
import type {
  AiVaultPrepareSessionResumeArgs,
  AiVaultPrepareSessionResumeResult
} from '../shared/ai-vault-resume-preparation'
import type {
  AgentType,
  NativeChatMessage,
  NativeChatTurnLifecycle
} from '../shared/native-chat-types'
import type { TelemetryConsentState } from '../shared/telemetry-consent-types'
import type { AgentKind, LaunchSource, RequestKind } from '../shared/telemetry-events'
import type { AppStarSource } from '../shared/gh-star-source'
import type {
  RemoteWorkspaceChangedEvent,
  RemoteWorkspaceConnectedClient,
  RemoteWorkspacePatchResult,
  RemoteWorkspaceSnapshot
} from '../shared/remote-workspace-types'
import type {
  Automation,
  AutomationCreateInput,
  AutomationDispatchRequest,
  AutomationDispatchResult,
  ExternalAutomationCreateInput,
  ExternalAutomationActionInput,
  ExternalAutomationManager,
  ExternalAutomationRunsInput,
  ExternalAutomationRunsPage,
  ExternalAutomationUpdateInput,
  AutomationRun,
  AutomationPrecheckResult,
  AutomationUpdateInput
} from '../shared/automations-types'
import type {
  WorkspaceCleanupDismissArgs,
  WorkspaceCleanupLocalProcessArgs,
  WorkspaceCleanupLocalProcessResult,
  WorkspaceCleanupScanArgs,
  WorkspaceCleanupScanProgress,
  WorkspaceCleanupScanResult
} from '../shared/workspace-cleanup'
import type { KeybindingActionId, KeybindingFileSnapshot } from '../shared/keybindings'

type GitLabRepoSelectorArgs = {
  repoPath: string
  repoId?: string | null
  sourceContext?: TaskSourceContext | null
}

type GitHubRepoSelectorArgs = {
  repoPath: string
  repoId?: string | null
  sourceContext?: TaskSourceContext | null
}

export type BrowserApi = {
  registerGuest: (args: {
    browserPageId: string
    workspaceId: string
    worktreeId: string
    sessionProfileId?: string | null
    webContentsId: number
  }) => Promise<boolean>
  isGuestRegistered: (args: { browserPageId: string; webContentsId: number }) => Promise<boolean>
  repairGuestRegistration: (args: {
    browserPageId: string
    workspaceId: string
    worktreeId: string
    sessionProfileId?: string | null
    webContentsId: number
  }) => Promise<boolean>
  unregisterGuest: (args: { browserPageId: string }) => Promise<void>
  openDevTools: (args: { browserPageId: string }) => Promise<boolean>
  setViewportOverride: (args: {
    browserPageId: string
    override: BrowserViewportOverride | null
  }) => Promise<boolean>
  setAnnotationViewportBridge: (args: BrowserSetAnnotationViewportBridgeArgs) => Promise<boolean>
  onGuestLoadFailed: (
    callback: (args: { browserPageId: string; loadError: BrowserLoadError }) => void
  ) => () => void
  onCertificateFailureChanged: (
    callback: (event: { browserPageId: string; failure: BrowserCertificateFailure | null }) => void
  ) => () => void
  proceedCertificate: (args: {
    browserPageId: string
    challengeId: string
  }) => Promise<BrowserCertificateProceedResult>
  onPermissionDenied: (callback: (event: BrowserPermissionDeniedEvent) => void) => () => void
  onPopup: (callback: (event: BrowserPopupEvent) => void) => () => void
  onDownloadRequested: (callback: (event: BrowserDownloadRequestedEvent) => void) => () => void
  onDownloadProgress: (callback: (event: BrowserDownloadProgressEvent) => void) => () => void
  onDownloadFinished: (callback: (event: BrowserDownloadFinishedEvent) => void) => () => void
  onContextMenuRequested: (
    callback: (event: BrowserContextMenuRequestedEvent) => void
  ) => () => void
  onContextMenuDismissed: (
    callback: (event: BrowserContextMenuDismissedEvent) => void
  ) => () => void
  onNavigationUpdate: (
    callback: (event: { browserPageId: string; url: string; title: string }) => void
  ) => () => void
  onActivateView: (
    callback: (data: { worktreeId?: string; browserPageId?: string }) => void
  ) => () => void
  onPaneFocus: (
    callback: (data: { worktreeId: string | null; browserPageId: string }) => void
  ) => () => void
  onOpenLinkInOrcaTab: (
    callback: (event: { browserPageId: string; url: string }) => void
  ) => () => void
  cancelDownload: (args: { downloadId: string }) => Promise<boolean>
  setGrabMode: (args: BrowserSetGrabModeArgs) => Promise<BrowserSetGrabModeResult>
  awaitGrabSelection: (args: BrowserAwaitGrabSelectionArgs) => Promise<BrowserGrabResult>
  cancelGrab: (args: BrowserCancelGrabArgs) => Promise<boolean>
  captureSelectionScreenshot: (
    args: BrowserCaptureSelectionScreenshotArgs
  ) => Promise<BrowserCaptureSelectionScreenshotResult>
  extractHoverPayload: (args: BrowserExtractHoverArgs) => Promise<BrowserExtractHoverResult>
  onGrabModeToggle: (callback: (browserPageId: string) => void) => () => void
  onGrabActionShortcut: (
    callback: (args: { browserPageId: string; key: 'c' | 's' }) => void
  ) => () => void
  sessionListProfiles: () => Promise<BrowserSessionProfile[]>
  sessionCreateProfile: (
    args: {
      scope: BrowserSessionProfileScope
      label: string
    } & BrowserSessionProfileCreateOptions
  ) => Promise<BrowserSessionProfile | null>
  sessionDeleteProfile: (args: { profileId: string }) => Promise<boolean>
  sessionImportCookies: (args: { profileId: string }) => Promise<BrowserCookieImportResult>
  sessionResolvePartition: (args: { profileId: string | null }) => Promise<string | null>
  sessionDetectBrowsers: () => Promise<DetectedBrowserInfo[]>
  sessionImportFromBrowser: (args: {
    profileId: string
    browserFamily: string
    browserProfile?: string
  }) => Promise<BrowserCookieImportResult>
  sessionClearDefaultCookies: () => Promise<boolean>
  notifyActiveTabChanged: (args: { browserPageId: string }) => Promise<boolean>
}

export type EmulatorApi = {
  onPaneFocus: (callback: (data: { worktreeId: string }) => void) => () => void
  onAutoAttach: (
    callback: (data: {
      worktreeId: string
      info: { deviceUdid: string; streamUrl: string; wsUrl: string; axUrl?: string }
    }) => void
  ) => () => void
  startFrameStream: (args: { streamUrl: string; streamKey?: string }) => Promise<{
    streamId: string
  }>
  stopFrameStream: (args: { streamId: string }) => Promise<void>
  onFrameStreamFrame: (
    callback: (data: { streamId: string; bytes: ArrayBuffer }) => void
  ) => () => void
  onFrameStreamError: (
    callback: (data: { streamId: string; message: string }) => void
  ) => () => void
  startVideoStream: (args: { deviceId: string; streamId: string }) => Promise<{ streamId: string }>
  stopVideoStream: (args: { streamId: string }) => Promise<void>
  onVideoStreamMeta: (
    callback: (data: {
      streamId: string
      deviceId: string
      meta: { codecId: string; width: number; height: number }
    }) => void
  ) => () => void
  onVideoStreamFrame: (
    callback: (data: {
      streamId: string
      deviceId: string
      config: boolean
      keyFrame: boolean
      bytes: ArrayBuffer
    }) => void
  ) => () => void
}

export type DetectedBrowserProfileInfo = {
  name: string
  directory: string
}

export type DetectedBrowserInfo = {
  family: BrowserSessionProfileSource['browserFamily']
  label: string
  profiles: DetectedBrowserProfileInfo[]
  selectedProfile: string
}

export type PreflightStatus = {
  git: { installed: boolean }
  gh: { installed: boolean; authenticated: boolean }
  /** Optional — older preload payloads predating GitLab support omit it; consumers gate on `glab?.installed`. */
  glab?: { installed: boolean; authenticated: boolean }
  bitbucket?: { configured: boolean; authenticated: boolean; account: string | null }
  azureDevOps?: {
    configured: boolean
    authenticated: boolean
    account: string | null
    baseUrl: string | null
    tokenConfigured: boolean
  }
  gitea?: {
    configured: boolean
    authenticated: boolean
    account: string | null
    baseUrl: string | null
    tokenConfigured: boolean
  }
}

export type RefreshAgentsResult = {
  agents: string[]
  addedPathSegments: string[]
  shellHydrationOk: boolean
  /** Drives agent_picks `on_path:false` triage (dashboard 1562016). `'shell_hydrate'` = detection saw the user's
   *  full shell PATH; `'sync_seed_only'` = hydration failed and detection ran against the `patchPackagedProcessPath` seed list. */
  pathSource: PathSource
  /** Classified hydration outcome: `'none'` on success, else a failure mode when `shellHydrationOk` is false. */
  pathFailureReason: ShellHydrationFailureReason
}

export type PreflightRuntimeContext = {
  wslDistro?: string | null
  wslDefault?: boolean
  projectRuntime?: ProjectExecutionRuntimeResolution
}

export type PreflightApi = {
  check: (args?: PreflightRuntimeContext & { force?: boolean }) => Promise<PreflightStatus>
  detectAgents: (args?: PreflightRuntimeContext) => Promise<string[]>
  refreshAgents: (args?: PreflightRuntimeContext) => Promise<RefreshAgentsResult>
  detectRemoteAgents: (args: { connectionId: string }) => Promise<string[]>
  detectRemoteWindowsTerminalCapabilities: (args: { connectionId: string }) => Promise<{
    wslAvailable: boolean
    wslDistros: string[]
    pwshAvailable: boolean
    gitBashAvailable: boolean
    hostPlatform: NodeJS.Platform | null
  }>
}

// Mirror of daemon's `DaemonSessionInfo` (src/main/daemon/types.ts); not imported — preload can't depend on main-only protocol types.
export type PtyManagementSession = {
  sessionId: string
  state: 'created' | 'spawning' | 'running' | 'exiting' | 'exited'
  shellState: 'pending' | 'ready' | 'timed_out' | 'unsupported'
  isAlive: boolean
  pid: number | null
  cwd: string | null
  cols: number
  rows: number
  createdAt: number
  protocolVersion: number
}

// 'severed': macOS can no longer attribute daemon terminals to Orca, so Accessibility/
// Automation grants silently stop applying until the daemon is restarted (STA-3491).
export type PtyManagementMacTccAttributionHealth = 'intact' | 'severed' | 'unknown'

export type PtyManagementApi = {
  // `degraded`: daemon is alive but can't spawn fresh PTYs, so new terminals run locally without daemon persistence.
  listSessions: () => Promise<{ sessions: PtyManagementSession[]; degraded: boolean }>
  killAll: () => Promise<{
    killedCount: number
    remainingCount: number
    killedSessionIds?: string[]
  }>
  killOne: (args: { sessionId: string }) => Promise<{ success: boolean }>
  restart: () => Promise<{ success: boolean }>
  macTccAttribution: () => Promise<{ health: PtyManagementMacTccAttributionHealth }>
}

export type ExportApi = {
  htmlToPdf: (args: {
    html: string
    title: string
  }) => Promise<
    { success: true; filePath: string } | { success: false; cancelled?: boolean; error?: string }
  >
}

export type StatsApi = {
  getSummary: () => Promise<StatsSummary>
}

// Diagnostics IPC payloads; mirror the runtime types in `src/main/observability/{index,bundle}.ts`.
export type DiagnosticsStatusPayload = {
  readonly localFileEnabled: boolean
  readonly bundleEnabled: boolean
  readonly traceFilePath: string
  readonly traceFamilySize: number
  readonly disabledReason?:
    | 'do_not_track'
    | 'orca_telemetry_disabled'
    | 'orca_diagnostics_disabled'
    | 'ci'
}
export type DiagnosticsBundlePayload = {
  readonly bundleSubmissionId: string
  readonly bytes: number
  readonly spanCount: number
}
export type DiagnosticsUploadPayload =
  | {
      readonly ticketId: string
    }
  | {
      readonly canceled: true
    }

export type MemoryApi = {
  getSnapshot: () => Promise<MemorySnapshot>
}

type UsageProviderSnapshot = {
  scanState: unknown
  summary: { scope: string; range: string }
  daily: unknown[]
  modelBreakdown: unknown[]
  recentSessions: unknown[]
}

type UsageQueryArgs<Snapshot extends UsageProviderSnapshot> = Pick<
  Snapshot['summary'],
  'scope' | 'range'
>

type UsageProviderApi<Snapshot extends UsageProviderSnapshot, BreakdownKind> = {
  getScanState: () => Promise<Snapshot['scanState']>
  setEnabled: (args: { enabled: boolean }) => Promise<Snapshot['scanState']>
  refresh: (args?: { force?: boolean }) => Promise<Snapshot['scanState']>
  getSnapshot: (args: UsageQueryArgs<Snapshot> & { limit?: number }) => Promise<Snapshot>
  getSummary: (args: UsageQueryArgs<Snapshot>) => Promise<Snapshot['summary']>
  getDaily: (args: UsageQueryArgs<Snapshot>) => Promise<Snapshot['daily']>
  getBreakdown: (
    args: UsageQueryArgs<Snapshot> & { kind: BreakdownKind }
  ) => Promise<Snapshot['modelBreakdown']>
  getRecentSessions: (
    args: UsageQueryArgs<Snapshot> & { limit?: number }
  ) => Promise<Snapshot['recentSessions']>
}

export type ClaudeUsageApi = UsageProviderApi<ClaudeUsageSnapshot, ClaudeUsageBreakdownKind>

export type CodexUsageApi = UsageProviderApi<CodexUsageSnapshot, CodexUsageBreakdownKind>

export type OpenCodeUsageApi = UsageProviderApi<OpenCodeUsageSnapshot, OpenCodeUsageBreakdownKind>

export type AiVaultApi = {
  listSessions: (args?: AiVaultListArgs) => Promise<AiVaultListResult>
  resolveSessionTitles: (args: AiVaultSessionTitlesArgs) => Promise<AiVaultSessionTitlesResult>
  /** Requirement-id lookup over the incremental codex/kimi transcript index. */
  searchYunxiaoSessions: (args: { yunxiaoId: string }) => Promise<{ sessions: AiVaultSession[] }>
  cancelListSessions: (args: { requestToken: string }) => Promise<void>
  prepareSessionResume: (
    args: AiVaultPrepareSessionResumeArgs
  ) => Promise<AiVaultPrepareSessionResumeResult>
  /** Lists the Task subagent transcripts of one session, on demand. */
  listSubagentSessions: (args: AiVaultSubagentListArgs) => Promise<AiVaultSubagentListResult>
  /** Full first user prompt for copy/reuse (re-parses one transcript). */
  getFirstUserPrompt: (args: AiVaultFirstUserPromptArgs) => Promise<AiVaultFirstUserPromptResult>
  /** Moves a deletable session's transcript to the OS trash; local sessions only. */
  deleteSession: (args: AiVaultDeleteSessionArgs) => Promise<AiVaultDeleteSessionResult>
  /** Fires when any app window regains OS focus; returns an unsubscribe. */
  onWindowFocused: (callback: () => void) => () => void
}

// notFound marks a not-yet-on-disk miss (retry-worthy) vs a real read/parse error (#8401).
export type NativeChatReadSessionResult =
  | {
      messages: NativeChatMessage[]
      lifecycle?: NativeChatTurnLifecycle
    }
  | { error: string; notFound?: true }

/** Messages appended to a live-tailed transcript since the previous emit. */
export type NativeChatAppendedMessages = NativeChatMessage[]

export type NativeChatSubscriptionFrame =
  | {
      type: 'snapshot'
      messages: NativeChatMessage[]
      hasMore: boolean
      error?: string
      lifecycle?: NativeChatTurnLifecycle
    }
  | {
      type: 'replacement'
      messages: NativeChatMessage[]
      hasMore: boolean
      lifecycle?: NativeChatTurnLifecycle
    }
  | {
      type: 'appended'
      messages: NativeChatMessage[]
      lifecycle?: NativeChatTurnLifecycle
    }

/** Wire payload for the `nativeChat:appended` push channel. */
export type NativeChatAppendedPayload = {
  subscriptionId: string
  frame: NativeChatSubscriptionFrame
}

export type NativeChatSubscribeArgs = {
  /** Unique per-caller id, echoed on every append so multiple live panes in
   *  one renderer don't cross-talk. */
  subscriptionId: string
  agent: AgentType
  sessionId: string
  /** Authoritative transcript path from the agent hook (providerSession). */
  transcriptPath?: string
  /** First snapshot size; later readSession calls grow this for pagination. */
  limit?: number
}

export type NativeChatApi = {
  /** Read the on-disk transcript for an agent + session id, windowed to the most recent `limit`
   *  turns. `transcriptPath` is the hook-reported authoritative path, preferred over the id glob. */
  readSession: (
    agent: AgentType,
    sessionId: string,
    limit?: number,
    transcriptPath?: string
  ) => Promise<NativeChatReadSessionResult>
  /** Live-tail a transcript. The first frame is a bounded race-safe snapshot;
   *  later frames contain only newly appended messages. */
  subscribe: (
    args: NativeChatSubscribeArgs,
    onFrame: (frame: NativeChatSubscriptionFrame) => void
  ) => () => void
}

export type AppApi = {
  /** Returns the app identity currently exposed to native chrome and the titlebar. */
  getIdentity: () => Promise<AppIdentity>
  /** Returns a URL base for feature-wall assets. In dev this is Vite /@fs;
   *  in packaged builds this is file:// resources. Renderer appends filenames. */
  getFeatureWallAssetBaseUrl: () => Promise<string>
  /** Relaunches the app (app.relaunch() + app.exit(0)) for settings that need a full restart to apply. */
  relaunch: () => Promise<void>
  /** Restarts Orca through the normal quit pipeline so daemon-backed terminal
   *  sessions survive and can reattach after the new process starts. */
  restart: () => Promise<void>
  /** Reloads the current app renderer through main so expected renderer
   *  teardown can be classified before Electron emits process-gone events. */
  reload: () => Promise<void>
  /** Stages the renderer's final state synchronously before unload. */
  stageBeforeUnloadSync: (args: {
    sessions: { state: WorkspaceSessionState; hostId?: ExecutionHostId }[]
    ui: Partial<PersistedUIState>
  }) => void
  /** Resolves once the last staged checkpoint is durably written; rejects if that
   *  write failed, so a reload/restart can abort instead of losing the snapshot. */
  awaitBeforeUnloadCheckpoint: () => Promise<void>
  /** Resolves when the daemon PTY provider and hook receiver have either
   *  started or failed open for the first BrowserWindow. */
  awaitFirstWindowStartupServices: () => Promise<void>
  /** Reconciles legacy worker authority around persisted terminal reconnect. */
  recoverLegacyWorkerTerminalsForRendererStartup: () => Promise<void>
  /** Emits a startup benchmark marker when ORCA_STARTUP_DIAGNOSTICS is enabled. */
  startupDiagnostic: (event: string, details?: Record<string, unknown>) => Promise<void>
  /** macOS active input mode, or layout ID when no IME is selected (e.g. `com.apple.keylayout.PolishPro`).
   *  Distinguishes CJK IMEs and Option-layer-composing layouts that look like US QWERTY (issue #1205).
   *  Returns null on non-Darwin or when the defaults read fails. */
  getKeyboardInputSourceId: () => Promise<string | null>
  /** Updates the macOS Dock unread badge. No-op on Windows/Linux. */
  setUnreadDockBadgeCount: (count: number) => Promise<void>
  /** Resolves the launch directory for global Floating Terminal tabs. */
  getFloatingTerminalCwd: (args?: FloatingTerminalCwdRequest) => Promise<string>
  /** Resolves Orca's app-owned directory for auto-created Floating Workspace
   *  markdown notes. */
  getFloatingMarkdownDirectory: () => Promise<string>
  /** Opens a native picker for markdown documents, rooted in the floating
   *  workspace, and authorizes the selected file for editor reads/writes. */
  pickFloatingMarkdownDocument: () => Promise<MarkdownDocument | null>
  /** Opens a native directory picker and authorizes the selected directory
   *  for Floating Workspace markdown file creation. */
  pickFloatingWorkspaceDirectory: () => Promise<string | null>
  /** Persists flag-gated terminal render evidence under app-owned userData. */
  writeTerminalRenderDesyncEvidence: (
    args: WriteTerminalRenderDesyncEvidenceArgs
  ) => Promise<WriteTerminalRenderDesyncEvidenceResult>
}

/** Panel contribution as surfaced by the main-process plugin service. */
export type PluginHostPanel = {
  id: string
  title: string
  /** Lucide icon name declared in the plugin manifest. */
  icon?: string
  tabKey: `plugin:${string}`
}

/** `pending` = awaiting (re-)consent; `idle` = enabled, worker not running
 *  (lazy); `restarting` = waiting for supervised backoff; `errored` = crashed past the restart budget or failed to start;
 *  `invalid` = unreadable manifest. */
export type PluginHostStatus =
  | 'running'
  | 'restarting'
  | 'idle'
  | 'pending'
  | 'disabled'
  | 'errored'
  | 'invalid'

/** Wire shape of plugins:list — must stay assignable from the main-process
 *  projection in src/main/plugins/plugin-list-projection.ts. */
export type PluginHostListEntry = {
  pluginKey: string
  consentFingerprint: string | null
  name: string
  version: string
  publisher: string
  description?: string
  status: PluginHostStatus
  needsReconsent: boolean
  error?: string
  isDev: boolean
  official: boolean
  bundled: boolean
  capabilities: { kind: string; description: string }[]
  panels: PluginHostPanel[]
  commands: {
    id: string
    title: string
    context: 'global' | 'worktree'
    handler: { type: 'built-in'; action: string } | { type: 'worker' }
    keybindings: { key: string; when: 'global' | 'worktree' }[]
  }[]
  hasWorker: boolean
  vmRecipes?: {
    id: string
    name: string
    description?: string
    commands: {
      phase: 'create' | 'suspend' | 'resume' | 'destroy'
      command: string
    }[]
  }[]
  restarts: number
  blockedByKillList?: { reason: string; advisoryUrl?: string }
  source?: {
    kind: 'local-path' | 'git' | 'marketplace' | 'bundled'
    reference: string
    resolvedCommit: string | null
    contentHash: string
    marketplace?: { reference: string; resolvedCommit: string }
  }
}

export type PluginHostLogLine = { ts: number; level: 'info' | 'warn' | 'error'; line: string }

export type PluginHostInstallSource =
  | { kind: 'local-path'; path: string }
  | { kind: 'git'; url: string; ref: string }

export type PluginHostInstallResult =
  | {
      ok: true
      pluginKey: string
      version: string
      contentHash: string
      consentFingerprint: string
      resolvedCommit: string | null
    }
  | { ok: false; error: string }

export type PluginMarketplaceHostSourceState = {
  id: string
  source: PluginMarketplaceGitSource
  addedAt: number
  marketplace: {
    name: string
    owner: string
    resolvedCommit: string
    fetchedAt: number
  } | null
  stale: boolean
  official: boolean
  error?: string
}

export type PluginMarketplaceHostListing = {
  marketplaceSourceId: string
  marketplaceName: string
  marketplaceOwner: string
  marketplaceCommit: string
  pluginKey: string
  source: PluginMarketplaceGitSource
  description?: string
  categories: string[]
  official: boolean
  bundled: boolean
  blockedByKillList?: { reason: string; advisoryUrl?: string }
}

export type PluginMarketplaceHostInstallPreview = {
  marketplaceSourceId: string
  marketplaceName: string
  marketplaceOwner: string
  marketplaceCommit: string
  pluginKey: string
  source: PluginMarketplaceGitSource
  resolvedCommit: string
  contentHash: string
  consentFingerprint: string
  manifest: PluginManifest
  official: boolean
  bundled: boolean
  blockedByKillList?: { reason: string; advisoryUrl?: string }
}

export type PreloadApi = {
  app: AppApi
  orcaProfiles: OrcaProfileApi
  platform: PlatformApi
  e2e: E2EApi
  repos: RepositoryApi
  projects: ProjectsApi
  projectGroups: ProjectGroupsApi
  folderWorkspaces: FolderWorkspacesApi
  sparsePresets: SparsePresetsApi
  worktrees: WorktreeApi
  workspaceCleanup: WorkspaceCleanupApi
  workspaceSpace: WorkspaceSpaceApi
  workspacePorts: WorkspacePortsApi
  pty: PtyApi
  feedback: FeedbackApi
  crashReports: CrashReportsApi
  export: ExportApi
  gh: {
    viewer: () => Promise<GitHubViewer | null>
    repoSlug: (args: {
      repoPath: string
      repoId?: string
    }) => Promise<{ owner: string; repo: string; host?: string } | null>
    repoUpstream: (args: {
      repoPath: string
      repoId?: string
    }) => Promise<{ owner: string; repo: string; host?: string } | null>
    prForBranch: (args: {
      repoPath: string
      repoId?: string
      branch: string
      linkedPRNumber?: number | null
      fallbackPRNumber?: number | null
      acceptMergedFallbackPR?: boolean
      currentHeadOid?: string | null
    }) => Promise<PRInfo | null>
    refreshPRNow: (args: { candidate: GitHubPRRefreshCandidate }) => Promise<PRRefreshOutcome>
    enqueuePRRefresh: (args: {
      candidate: GitHubPRRefreshCandidate
      reason: GitHubPRRefreshReason
      priority?: number
    }) => Promise<GitHubPRRefreshEnqueueResult | false>
    reportVisiblePRRefreshCandidates: (args: {
      candidates: GitHubPRRefreshCandidate[]
      generation: number
    }) => Promise<boolean>
    onPRRefreshEvent: (callback: (event: GitHubPRRefreshEvent) => void) => () => void
    issue: (args: {
      repoPath: string
      repoId?: string
      sourceContext?: TaskSourceContext | null
      number: number
    }) => Promise<IssueInfo | null>
    workItem: (args: {
      repoPath: string
      repoId?: string
      sourceContext?: TaskSourceContext | null
      number: number
      type?: 'issue' | 'pr'
    }) => Promise<Omit<GitHubWorkItem, 'repoId'> | null>
    workItemByOwnerRepo: (args: {
      repoPath: string
      repoId?: string
      owner: string
      repo: string
      host?: string
      number: number
      type: 'issue' | 'pr'
    }) => Promise<Omit<GitHubWorkItem, 'repoId'> | null>
    workItemDetails: (
      args: GitHubRepoSelectorArgs & {
        number: number
        type?: 'issue' | 'pr'
      }
    ) => Promise<GitHubWorkItemDetails | null>
    notifyWorkItemMutated: (args: {
      repoPath: string
      repoId?: string
      type: 'issue' | 'pr'
      number: number
    }) => Promise<boolean>
    prFileContents: (
      args: GitHubRepoSelectorArgs & {
        prNumber: number
        prRepo?: GitHubOwnerRepo | null
        path: string
        oldPath?: string
        status: GitHubPRFile['status']
        headSha: string
        baseSha: string
      }
    ) => Promise<GitHubPRFileContents>
    listIssues: (args: {
      repoPath: string
      repoId?: string
      limit?: number
    }) => Promise<IssueInfo[]>
    createIssue: (args: {
      repoPath: string
      repoId?: string
      sourceContext?: TaskSourceContext | null
      title: string
      body: string
      labels?: string[]
      assignees?: string[]
    }) => Promise<GitHubCreateIssueResult>
    countWorkItems: (args: { repoPath: string; repoId?: string; query?: string }) => Promise<number>
    listWorkItems: (args: {
      repoPath: string
      repoId?: string
      limit?: number
      query?: string
      page?: number
      noCache?: boolean
    }) => Promise<ListWorkItemsResult<Omit<GitHubWorkItem, 'repoId'>>>
    prChecks: (
      args: GitHubRepoSelectorArgs & {
        prNumber: number
        headSha?: string
        prRepo?: GitHubOwnerRepo | null
        noCache?: boolean
      }
    ) => Promise<PRCheckDetail[]>
    prCheckDetails: (args: {
      repoPath: string
      repoId?: string
      sourceContext?: TaskSourceContext | null
      checkRunId?: number
      workflowRunId?: number
      checkName?: string
      url?: string | null
      prRepo?: GitHubOwnerRepo | null
    }) => Promise<PRCheckRunDetails | null>
    rerunPRChecks: (
      args: GitHubRepoSelectorArgs & {
        prNumber: number
        headSha?: string
        failedOnly?: boolean
        prRepo?: GitHubOwnerRepo | null
      }
    ) => Promise<{ ok: true; count: number } | { ok: false; error: string }>
    prComments: (args: {
      repoPath: string
      repoId?: string
      sourceContext?: TaskSourceContext | null
      prNumber: number
      prRepo?: GitHubOwnerRepo | null
      noCache?: boolean
    }) => Promise<PRComment[]>
    setPRCommentReaction: (args: {
      repoPath: string
      repoId?: string
      sourceContext?: TaskSourceContext | null
      reactionSubjectId: string
      content: GitHubReactionContent
      reacted: boolean
      prRepo?: GitHubOwnerRepo | null
    }) => Promise<boolean>
    resolveReviewThread: (args: {
      repoPath: string
      repoId?: string
      sourceContext?: TaskSourceContext | null
      threadId: string
      resolve: boolean
      prRepo?: GitHubOwnerRepo | null
    }) => Promise<boolean>
    setPRFileViewed: (
      args: GitHubRepoSelectorArgs & {
        prNumber: number
        prRepo?: GitHubOwnerRepo | null
        pullRequestId: string
        path: string
        viewed: boolean
      }
    ) => Promise<boolean>
    updatePRTitle: (args: {
      repoPath: string
      repoId?: string
      prNumber: number
      title: string
      prRepo?: GitHubOwnerRepo | null
    }) => Promise<boolean>
    mergePR: (
      args: GitHubRepoSelectorArgs & {
        prNumber: number
        method?: 'merge' | 'squash' | 'rebase'
        prRepo?: GitHubOwnerRepo | null
      }
    ) => Promise<{ ok: true } | { ok: false; error: string }>
    setPRAutoMerge: (
      args: GitHubRepoSelectorArgs & {
        prNumber: number
        enabled: boolean
        method?: 'merge' | 'squash' | 'rebase'
        prRepo?: GitHubOwnerRepo | null
      }
    ) => Promise<{ ok: true } | { ok: false; error: string }>
    updatePRState: (
      args: GitHubRepoSelectorArgs & {
        prNumber: number
        updates: { state: 'open' | 'closed' }
        prRepo?: GitHubOwnerRepo | null
      }
    ) => Promise<{ ok: true } | { ok: false; error: string }>
    requestPRReviewers: (
      args: GitHubRepoSelectorArgs & {
        prNumber: number
        reviewers: string[]
        prRepo?: GitHubOwnerRepo | null
      }
    ) => Promise<{ ok: true } | { ok: false; error: string }>
    removePRReviewers: (
      args: GitHubRepoSelectorArgs & {
        prNumber: number
        reviewers: string[]
        prRepo?: GitHubOwnerRepo | null
      }
    ) => Promise<{ ok: true } | { ok: false; error: string }>
    updateIssue: (
      args: GitHubRepoSelectorArgs & {
        number: number
        updates: GitHubIssueUpdate
      }
    ) => Promise<{ ok: true } | { ok: false; error: string }>
    addIssueComment: (
      args: GitHubRepoSelectorArgs & {
        number: number
        body: string
        /** Why: scopes the cross-window cache invalidation so a PR and issue sharing the same number don't evict each other. */
        type?: 'issue' | 'pr'
        prRepo?: GitHubOwnerRepo | null
      }
    ) => Promise<GitHubCommentResult>
    addPRReviewCommentReply: (
      args: GitHubRepoSelectorArgs & {
        prNumber: number
        commentId: number
        body: string
        threadId?: string
        path?: string
        line?: number
        prRepo?: GitHubOwnerRepo | null
      }
    ) => Promise<GitHubCommentResult>
    addPRReviewComment: (
      args: GitHubPRReviewCommentInput & {
        repoId?: string
        sourceContext?: TaskSourceContext | null
      }
    ) => Promise<GitHubCommentResult>
    listLabels: (args: {
      repoPath: string
      repoId?: string
      sourceContext?: TaskSourceContext | null
    }) => Promise<string[]>
    listAssignableUsers: (args: {
      repoPath: string
      repoId?: string
      sourceContext?: TaskSourceContext | null
    }) => Promise<GitHubAssignableUser[]>
    /** Subscribe to local-mutation broadcasts so the work-item-drawer cache can invalidate across windows. Returns an unsubscribe. */
    onWorkItemMutated: (
      callback: (payload: {
        repoPath: string
        repoId?: string
        type: 'issue' | 'pr'
        number: number
      }) => void
    ) => () => void
    checkOrcaStarred: () => Promise<boolean | null>
    starOrca: (source: AppStarSource) => Promise<boolean>
    /**
     * GitHub API rate-limit snapshot. Does NOT consume quota (the
     * `rate_limit` endpoint is exempt). Cached 30s server-side — pass
     * `force: true` to bust after a known-expensive op.
     */
    rateLimit: (args?: { force?: boolean }) => Promise<GetRateLimitResult>
    /** Explains scope_missing ProjectV2 failures — notably a shell `GITHUB_TOKEN` shadowing the keyring credential, where `gh auth refresh` is a no-op. */
    diagnoseAuth: (args?: { host?: string }) => Promise<GhAuthDiagnostic>
    // ── ProjectV2 (GitHub Projects) ─────────────────────────────────
    listAccessibleProjects: (
      args?: ListAccessibleProjectsArgs
    ) => Promise<ListAccessibleProjectsResult>
    resolveProjectRef: (args: ResolveProjectRefArgs) => Promise<ResolveProjectRefResult>
    listProjectViews: (args: ListProjectViewsArgs) => Promise<ListProjectViewsResult>
    getProjectViewTable: (args: GetProjectViewTableArgs) => Promise<GetProjectViewTableResult>
    projectWorkItemDetailsBySlug: (
      args: ProjectWorkItemDetailsBySlugArgs
    ) => Promise<ProjectWorkItemDetailsBySlugResult>
    updateProjectItemField: (
      args: UpdateProjectItemFieldArgs
    ) => Promise<GitHubProjectMutationResult>
    clearProjectItemField: (args: ClearProjectItemFieldArgs) => Promise<GitHubProjectMutationResult>
    updateIssueBySlug: (args: UpdateIssueBySlugArgs) => Promise<GitHubProjectMutationResult>
    updatePullRequestBySlug: (
      args: UpdatePullRequestBySlugArgs
    ) => Promise<GitHubProjectMutationResult>
    addIssueCommentBySlug: (
      args: AddIssueCommentBySlugArgs
    ) => Promise<GitHubProjectCommentMutationResult>
    updateIssueCommentBySlug: (
      args: UpdateIssueCommentBySlugArgs
    ) => Promise<GitHubProjectMutationResult>
    deleteIssueCommentBySlug: (
      args: DeleteIssueCommentBySlugArgs
    ) => Promise<GitHubProjectMutationResult>
    listLabelsBySlug: (args: ListLabelsBySlugArgs) => Promise<ListLabelsBySlugResult>
    listAssignableUsersBySlug: (
      args: ListAssignableUsersBySlugArgs
    ) => Promise<ListAssignableUsersBySlugResult>
    listIssueTypesBySlug: (args: ListIssueTypesBySlugArgs) => Promise<ListIssueTypesBySlugResult>
    updateIssueTypeBySlug: (args: UpdateIssueTypeBySlugArgs) => Promise<GitHubProjectMutationResult>
  }
  hostedReview: {
    forBranch: (args: HostedReviewForBranchArgs) => Promise<HostedReviewInfo | null>
    getCreationEligibility: (
      args: HostedReviewCreationEligibilityArgs
    ) => Promise<HostedReviewCreationEligibility>
    create: (args: CreateHostedReviewArgs) => Promise<CreateHostedReviewResult>
  }
  // ── GitLab — parallel to gh, MR/issue surface only in v1 ────────
  // Shapes mirror gh.* except where GitLab's API differs (MR states, host-qualified project path, `glab api -i` paging).
  gl: {
    viewer: () => Promise<GitLabViewer | null>
    diagnoseAuth: () => Promise<GitLabAuthDiagnostic>
    rateLimit: (args?: {
      force?: boolean
      host?: string | null
    }) => Promise<GetGitLabRateLimitResult>
    projectSlug: (args: GitLabRepoSelectorArgs) => Promise<GitLabProjectRef | null>
    mrForBranch: (
      args: GitLabRepoSelectorArgs & {
        branch: string
        linkedMRIid?: number | null
      }
    ) => Promise<MRInfo | null>
    mr: (args: GitLabRepoSelectorArgs & { iid: number }) => Promise<MRInfo | null>
    listMRs: (
      args: GitLabRepoSelectorArgs & {
        state?: MRListState
        page?: number
        perPage?: number
        query?: string
      }
    ) => Promise<ListMergeRequestsResult>
    /** Combined MR + issue list filtered by state. Issues are skipped
     *  when state is 'merged' (issues don't merge). */
    listWorkItems: (
      args: GitLabRepoSelectorArgs & {
        state?: MRListState
        page?: number
        perPage?: number
        query?: string
      }
    ) => Promise<ListMergeRequestsResult>
    issue: (args: GitLabRepoSelectorArgs & { number: number }) => Promise<GitLabIssueInfo | null>
    listIssues: (
      args: GitLabRepoSelectorArgs & {
        state?: 'opened' | 'closed' | 'all'
        assignee?: string
        limit?: number
      }
    ) => Promise<{ items: GitLabWorkItem[]; error?: ClassifiedError }>
    createIssue: (
      args: GitLabRepoSelectorArgs & {
        title: string
        body: string
      }
    ) => Promise<{ ok: true; number: number; url: string } | { ok: false; error: string }>
    updateIssue: (
      args: GitLabRepoSelectorArgs & {
        number: number
        updates: GitLabIssueUpdate
      }
    ) => Promise<{ ok: true } | { ok: false; error: string }>
    addIssueComment: (
      args: GitLabRepoSelectorArgs & {
        number: number
        body: string
      }
    ) => Promise<GitLabCommentResult>
    listLabels: (args: GitLabRepoSelectorArgs) => Promise<string[]>
    listAssignableUsers: (args: GitLabRepoSelectorArgs) => Promise<GitLabAssignableUser[]>
    /** Cross-project user-scoped todos (gitlab.com/dashboard/todos). */
    todos: (args: GitLabRepoSelectorArgs) => Promise<GitLabTodo[]>
    /** Aggregated dialog payload — body + discussions + pipeline jobs. */
    workItemDetails: (
      args: GitLabRepoSelectorArgs & {
        iid: number
        type: 'issue' | 'mr'
      }
    ) => Promise<GitLabWorkItemDetails | null>
    closeMR: (
      args: GitLabRepoSelectorArgs & {
        iid: number
      }
    ) => Promise<{ ok: true } | { ok: false; error: string }>
    reopenMR: (
      args: GitLabRepoSelectorArgs & {
        iid: number
      }
    ) => Promise<{ ok: true } | { ok: false; error: string }>
    mergeMR: (
      args: GitLabRepoSelectorArgs & {
        iid: number
        method?: 'merge' | 'squash' | 'rebase'
      }
    ) => Promise<{ ok: true } | { ok: false; error: string }>
    updateMR: (
      args: GitLabRepoSelectorArgs & {
        iid: number
        updates: GitLabMRUpdate
      }
    ) => Promise<{ ok: true } | { ok: false; error: string }>
    updateMRReviewers: (
      args: GitLabRepoSelectorArgs & {
        iid: number
        reviewerIds: number[]
        projectRef?: GitLabProjectRef | null
      }
    ) => Promise<GitLabMRReviewersUpdateResult>
    addMRComment: (
      args: GitLabRepoSelectorArgs & {
        iid: number
        body: string
      }
    ) => Promise<GitLabCommentResult>
    addMRInlineComment: (
      args: GitLabRepoSelectorArgs & {
        iid: number
        input: GitLabMRInlineCommentInput
        projectRef?: GitLabProjectRef | null
      }
    ) => Promise<GitLabCommentResult>
    resolveMRDiscussion: (
      args: GitLabRepoSelectorArgs & {
        iid: number
        discussionId: string
        resolved: boolean
      }
    ) => Promise<GitLabDiscussionResolveResult>
    jobTrace: (
      args: GitLabRepoSelectorArgs & {
        jobId: number
        projectRef?: GitLabProjectRef | null
        /** Bound the trace in main to a readable excerpt (see gitLabJobTraceToLogExcerpt). */
        logExcerpt?: boolean
      }
    ) => Promise<GitLabJobTraceResult>
    retryJob: (
      args: GitLabRepoSelectorArgs & {
        jobId: number
        projectRef?: GitLabProjectRef | null
      }
    ) => Promise<GitLabRetryJobResult>
    workItemByPath: (
      args: GitLabRepoSelectorArgs & {
        host: string
        path: string
        iid: number
        type: 'issue' | 'mr'
      }
    ) => Promise<Omit<GitLabWorkItem, 'repoId'> | null>
  }
  linear: {
    connect: (args: {
      apiKey: string
    }) => Promise<{ ok: true; viewer: LinearViewer } | { ok: false; error: string }>
    disconnect: (args?: { workspaceId?: string }) => Promise<void>
    selectWorkspace: (args: {
      workspaceId: LinearWorkspaceSelection
    }) => Promise<LinearConnectionStatus>
    status: () => Promise<LinearConnectionStatus>
    testConnection: (args?: {
      workspaceId?: string
    }) => Promise<{ ok: true; viewer: LinearViewer } | { ok: false; error: string }>
    searchIssues: (args: {
      query: string
      limit?: number
      workspaceId?: LinearWorkspaceSelection
    }) => Promise<LinearIssue[]>
    listIssues: (args?: {
      filter?: 'assigned' | 'created' | 'all' | 'completed'
      limit?: number
      workspaceId?: LinearWorkspaceSelection
      attributeFilter?: LinearIssueAttributeFilter
    }) => Promise<LinearCollectionResult<LinearIssue>>
    createIssue: (args: {
      teamId: string
      title: string
      description?: string
      workspaceId?: string
      parentIssueId?: string
      projectId?: string | null
      stateId?: string
      priority?: number
      assigneeId?: string | null
      labelIds?: string[]
    }) => Promise<
      | { ok: true; id: string; identifier: string; title: string; url: string }
      | { ok: false; error: string }
    >
    getIssue: (args: { id: string; workspaceId?: string }) => Promise<LinearIssue | null>
    updateIssue: (args: {
      id: string
      updates: LinearIssueUpdate
      workspaceId?: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    addIssueComment: (args: {
      issueId: string
      body: string
      workspaceId?: string
    }) => Promise<{ ok: true; id: string } | { ok: false; error: string }>
    issueComments: (args: { issueId: string; workspaceId?: string }) => Promise<LinearComment[]>
    listTeams: (args?: { workspaceId?: LinearWorkspaceSelection }) => Promise<LinearTeam[]>
    listProjects: (args?: {
      query?: string
      limit?: number
      workspaceId?: LinearWorkspaceSelection
      force?: boolean
    }) => Promise<LinearCollectionResult<LinearProjectSummary>>
    createProject: (args: {
      name: string
      description?: string
      content?: string
      teamIds: string[]
      workspaceId?: string
      leadId?: string | null
      memberIds?: string[]
      labelIds?: string[]
      priority?: number
      startDate?: string
      targetDate?: string
    }) => Promise<{ ok: true; project: LinearProjectDetail } | { ok: false; error: string }>
    getProject: (args: {
      id: string
      workspaceId: string
      force?: boolean
    }) => Promise<LinearProjectDetail | null>
    listProjectIssues: (args: {
      projectId: string
      limit?: number
      workspaceId: string
      force?: boolean
    }) => Promise<LinearCollectionResult<LinearIssue>>
    listCustomViews: (args: {
      model: LinearCustomViewModel
      limit?: number
      workspaceId?: LinearWorkspaceSelection
      force?: boolean
    }) => Promise<LinearCollectionResult<LinearCustomViewSummary>>
    getCustomView: (args: {
      viewId: string
      model: LinearCustomViewModel
      workspaceId: string
      force?: boolean
    }) => Promise<LinearCustomViewSummary | null>
    listCustomViewIssues: (args: {
      viewId: string
      limit?: number
      workspaceId: string
      force?: boolean
    }) => Promise<LinearCollectionResult<LinearIssue>>
    listCustomViewProjects: (args: {
      viewId: string
      limit?: number
      workspaceId: string
      force?: boolean
    }) => Promise<LinearCollectionResult<LinearProjectSummary>>
    teamStates: (args: { teamId: string; workspaceId?: string }) => Promise<LinearWorkflowState[]>
    teamLabels: (args: { teamId: string; workspaceId?: string }) => Promise<LinearLabel[]>
    teamMembers: (args: { teamId: string; workspaceId?: string }) => Promise<LinearMember[]>
  }
  jira: {
    connect: (args: {
      siteUrl: string
      email: string
      apiToken: string
      authType?: 'cloud' | 'server'
    }) => Promise<{ ok: true; viewer: JiraViewer } | { ok: false; error: string }>
    disconnect: (args?: { siteId?: string }) => Promise<void>
    selectSite: (args: { siteId: JiraSiteSelection }) => Promise<JiraConnectionStatus>
    status: () => Promise<JiraConnectionStatus>
    readStatus: () => Promise<JiraConnectionStatus>
    testConnection: (args?: {
      siteId?: string
    }) => Promise<{ ok: true; viewer: JiraViewer } | { ok: false; error: string }>
    searchIssues: (args: {
      jql: string
      limit?: number
      siteId?: JiraSiteSelection
      requestId?: string
    }) => Promise<JiraIssue[]>
    cancelSearchIssues: (args: { requestId: string }) => Promise<void>
    listIssues: (args?: {
      filter?: JiraIssueFilter
      limit?: number
      siteId?: JiraSiteSelection
    }) => Promise<JiraIssue[]>
    getIssue: (args: { key: string; siteId?: string }) => Promise<JiraIssue | null>
    lookupIssueSummary: (args: {
      key: string
      siteId: string
      requestId?: string
    }) => Promise<JiraIssue | null>
    cancelIssueSummary: (args: { requestId: string }) => Promise<void>
    createIssue: (
      args: JiraCreateIssueArgs
    ) => Promise<{ ok: true; id: string; key: string; url: string } | { ok: false; error: string }>
    updateIssue: (args: {
      key: string
      updates: JiraIssueUpdate
      siteId?: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    addIssueComment: (args: {
      key: string
      body: string
      siteId?: string
    }) => Promise<{ ok: true; id: string } | { ok: false; error: string }>
    issueComments: (args: { key: string; siteId?: string }) => Promise<JiraComment[]>
    listProjects: (args?: { siteId?: JiraSiteSelection }) => Promise<JiraProject[]>
    listIssueTypes: (args: { projectIdOrKey: string; siteId?: string }) => Promise<JiraIssueType[]>
    listCreateFields: (args: {
      projectIdOrKey: string
      issueTypeId: string
      siteId?: string
    }) => Promise<JiraCreateField[]>
    listPriorities: (args?: { siteId?: string }) => Promise<JiraPriority[]>
    listAssignableUsers: (args: {
      key: string
      query?: string
      siteId?: string
    }) => Promise<JiraUser[]>
    listTransitions: (args: { key: string; siteId?: string }) => Promise<JiraTransition[]>
    getProjectStatusOrder: (args: {
      projectKey: string
      siteId?: string
    }) => Promise<JiraProjectStatusOrder>
  }
  yunxiao: {
    listWorkItems: (args: YunxiaoListWorkItemsArgs) => Promise<YunxiaoListWorkItemsResult>
    createRequirement: (args: YunxiaoCreateRequirementArgs) => Promise<YunxiaoRequirementResult>
    listRequirementFieldOptions: () => Promise<YunxiaoRequirementFieldOptionsResult>
    archiveRequirement: (
      args: YunxiaoArchiveRequirementArgs
    ) => Promise<YunxiaoArchiveRequirementResult>
    listTodoPool: () => Promise<YunxiaoTodoPoolItem[]>
    addTodoPoolItems: (args: YunxiaoTodoPoolAddArgs) => Promise<YunxiaoTodoPoolItem[]>
    updateTodoPoolItem: (args: YunxiaoTodoPoolUpdateArgs) => Promise<YunxiaoTodoPoolItem | null>
    removeTodoPoolItem: (id: string) => Promise<boolean>
  }
  starNag: {
    onShow: (
      callback: (payload?: { mode?: 'gh' | 'web'; surface?: 'card' | 'toast' }) => void
    ) => () => void
    onHide: (callback: () => void) => () => void
    dismiss: () => Promise<void>
    later: () => Promise<void>
    complete: () => Promise<void>
    disable: () => Promise<void>
    openWeb: () => Promise<void>
    starOrca: () => Promise<boolean>
    forceShow: () => Promise<void>
    agentValueMoment: () => Promise<{ status: 'ready'; mode: 'gh' | 'web' } | { status: 'skipped' }>
    showAgentValueMoment: () => Promise<void>
    onboardingCompleted: () => Promise<void>
  }
  /** Fire-and-forget track. Loose IPC typing on purpose — the main-side validator enforces;
   *  renderer sites should import `track<N>()` from lib/telemetry.ts, not reach here. */
  telemetryTrack: (name: string, props: Record<string, unknown>) => Promise<void>
  /** Flip the persisted opt-in preference. Subject to a per-session
   *  consent-mutation rate limit on the main side (≤5/session). */
  telemetrySetOptIn: (optedIn: boolean) => Promise<void>
  /** Diagnostic file controls (telemetry-error-tracking.md §User controls). Main does the FS/network
   *  work and retains upload payloads so the renderer can't read or substitute arbitrary bytes. */
  diagnostics: {
    getStatus: () => Promise<DiagnosticsStatusPayload>
    collectBundle: (lookbackMinutes?: number) => Promise<DiagnosticsBundlePayload>
    openBundlePreview: (bundleSubmissionId: string) => Promise<void>
    discardBundlePreview: (bundleSubmissionId: string) => Promise<void>
    uploadBundle: (bundleSubmissionId: string) => Promise<DiagnosticsUploadPayload>
    deleteBundle: (ticketId: string) => Promise<void>
  }
  /** Read-only effective consent state (+ reason if disabled) — env vars are main-side state the renderer can't read directly. */
  telemetryGetConsentState: () => Promise<TelemetryConsentState>
  /** Banner ✕ — persist `optedIn = true` silently. Separate channel from `telemetrySetOptIn`,
   *  whose `via` derivation would wrongly fire `telemetry_opted_in`. Same per-session rate limit. */
  telemetryAcknowledgeBanner: () => Promise<void>
  settings: {
    get: () => Promise<GlobalSettings>
    /** Synchronous persisted-settings read for startup decisions that can't wait for async hydration. Blocking IPC — call sparingly. */
    getSync: () => GlobalSettings | null
    set: (args: Partial<GlobalSettings>) => Promise<GlobalSettings>
    setActiveRuntimeEnvironmentPreference: (args: {
      environmentId: string | null
    }) => Promise<GlobalSettings>
    updatePRBotAuthorOverride: (args: { author: string; isBot: boolean }) => Promise<GlobalSettings>
    listFonts: () => Promise<string[]>
    previewGhosttyImport: () => Promise<GhosttyImportPreview>
    previewWarpThemeImport: (source: WarpThemeImportSource) => Promise<WarpThemeImportPreview>
    /** Subscribe to out-of-band settings updates (e.g. View > Appearance toggles) to stay in sync with main. */
    onChanged: (callback: (updates: Partial<GlobalSettings>) => void) => () => void
  }
  agentAwake: {
    getStatus: () => Promise<ComputerAwakeStatus>
    onChanged: (callback: (status: ComputerAwakeStatus) => void) => () => void
  }
  localhostWorktreeLabels: {
    register: (args: LocalhostWorktreeLabelRoute) => Promise<LocalhostWorktreeLabelResult>
  }
  keybindings: {
    get: () => Promise<KeybindingFileSnapshot>
    ensureFile: () => Promise<KeybindingFileSnapshot>
    setAction: (args: {
      actionId: KeybindingActionId
      bindings: string[] | null
    }) => Promise<KeybindingFileSnapshot>
    reload: () => Promise<KeybindingFileSnapshot>
    openFile: () => Promise<KeybindingFileSnapshot>
    revealFile: () => Promise<KeybindingFileSnapshot>
    onChanged: (callback: (snapshot: KeybindingFileSnapshot) => void) => () => void
  }
  codexAccounts: {
    list: () => Promise<CodexRateLimitAccountsState>
    add: (args?: {
      runtime?: 'host' | 'wsl'
      wslDistro?: string | null
    }) => Promise<CodexRateLimitAccountsState>
    reauthenticate: (args: { accountId: string }) => Promise<CodexRateLimitAccountsState>
    remove: (args: { accountId: string }) => Promise<CodexRateLimitAccountsState>
    select: (args: {
      accountId: string | null
      runtime?: 'host' | 'wsl'
      wslDistro?: string | null
    }) => Promise<CodexRateLimitAccountsState>
    /** Live PTYs whose baked CODEX_HOME still points at a deselected account. */
    listStalePanes: (args: { ptyIds: string[] }) => Promise<
      {
        ptyId: string
        launchAccountId: string | null
        activeAccountId: string | null
        /** Optional for compatibility with a pre-reason main process. */
        reason?: 'account-change' | 'home-route-change'
      }[]
    >
    /** The selection lane each PTY launched from, keyed by pty id; unrecorded panes are absent. */
    listRecordedPaneLanes: (args: { ptyIds: string[] }) => Promise<Record<string, string>>
    /** Drops launch records so a dismissed prompt stays dismissed across restarts. */
    forgetStalePanes: (args: { ptyIds: string[] }) => Promise<void>
  }
  claudeAccounts: {
    list: () => Promise<ClaudeRateLimitAccountsState>
    add: (args?: {
      runtime?: 'host' | 'wsl'
      wslDistro?: string | null
    }) => Promise<ClaudeRateLimitAccountsState>
    cancelPendingLogin: () => Promise<boolean>
    reauthenticate: (args: { accountId: string }) => Promise<ClaudeRateLimitAccountsState>
    remove: (args: { accountId: string }) => Promise<ClaudeRateLimitAccountsState>
    select: (args: {
      accountId: string | null
      runtime?: 'host' | 'wsl'
      wslDistro?: string | null
    }) => Promise<ClaudeRateLimitAccountsState>
  }
  cli: {
    getInstallStatus: () => Promise<CliInstallStatus>
    install: () => Promise<CliInstallStatus>
    remove: () => Promise<CliInstallStatus>
    getWslInstallStatus: (args?: { distro?: string | null }) => Promise<CliInstallStatus>
    installWsl: (args?: { distro?: string | null }) => Promise<CliInstallStatus>
    removeWsl: (args?: { distro?: string | null }) => Promise<CliInstallStatus>
  }
  codexConfigSync: {
    status: () => Promise<CodexConfigSyncStatus>
  }
  agentHooks: {
    claudeStatus: () => Promise<AgentHookInstallStatus>
    openClaudeStatus: () => Promise<AgentHookInstallStatus>
    codexStatus: () => Promise<AgentHookInstallStatus>
    geminiStatus: () => Promise<AgentHookInstallStatus>
    antigravityStatus: () => Promise<AgentHookInstallStatus>
    ampStatus: () => Promise<AgentHookInstallStatus>
    cursorStatus: () => Promise<AgentHookInstallStatus>
    droidStatus: () => Promise<AgentHookInstallStatus>
    commandCodeStatus: () => Promise<AgentHookInstallStatus>
    grokStatus: () => Promise<AgentHookInstallStatus>
    copilotStatus: () => Promise<AgentHookInstallStatus>
    hermesStatus: () => Promise<AgentHookInstallStatus>
    devinStatus: () => Promise<AgentHookInstallStatus>
  }
  agentTrust: {
    markTrusted: (args: {
      preset: 'cursor' | 'copilot' | 'codex'
      workspacePath: string
      connectionId?: string
    }) => Promise<void>
  }
  preflight: PreflightApi
  notifications: {
    dispatch: (args: NotificationDispatchRequest) => Promise<NotificationDispatchResult>
    dismiss: (ids: string[]) => Promise<NotificationDismissResult>
    openSystemSettings: () => Promise<void>
    getPermissionStatus: () => Promise<NotificationPermissionStatusResult>
    probeDelivery: (args?: { force?: boolean }) => Promise<NotificationDeliveryProbeResult>
    playSound: (options?: { force?: boolean; volume?: number }) => Promise<NotificationSoundResult>
  }
  onboarding: {
    get: () => Promise<OnboardingState>
    // Why: main merges the checklist field-by-field, so a partial checklist is fine.
    update: (
      updates: Partial<Omit<OnboardingState, 'checklist'>> & {
        checklist?: Partial<OnboardingState['checklist']>
      }
    ) => Promise<OnboardingState>
  }
  dashboard: {
    openPopout: (view?: 'board' | 'map') => Promise<void>
    publishSnapshot: (snapshot: DashboardSnapshot) => Promise<void>
    getPopoutOpen: () => Promise<boolean>
    onPopoutOpenChanged: (callback: (open: boolean) => void) => () => void
    onSnapshotRequested: (callback: () => void) => () => void
    onRevealAgent: (callback: (args: DashboardRevealAgentArgs) => void) => () => void
    onAckAgent: (callback: (paneKey: string) => void) => () => void
    onSpawnAgent: (callback: (args: DashboardSpawnAgentArgs) => void) => () => void
    onSleepWorkspace: (callback: (args: DashboardSleepWorkspaceArgs) => void) => () => void
    requestSnapshot: () => Promise<void>
    onSnapshot: (callback: (snapshot: DashboardSnapshot) => void) => () => void
    onViewRequested: (callback: (view: 'board' | 'map') => void) => () => void
    revealAgent: (args: DashboardRevealAgentArgs) => Promise<void>
    ackAgent: (paneKey: string) => Promise<void>
    spawnAgent: (args: DashboardSpawnAgentArgs) => Promise<void>
    sleepWorkspace: (args: DashboardSleepWorkspaceArgs) => Promise<void>
  }
  terminalPreview: {
    connect: (
      ptyId: string,
      opts?: { scrollbackRows?: number }
    ) => Promise<TerminalPreviewConnectResult>
    input: (ptyId: string, data: string) => Promise<boolean>
    /** Claim the PTY grid for the preview dialog; resolves to the size actually in effect. */
    fit: (
      ptyId: string,
      cols: number,
      rows: number
    ) => Promise<{ cols: number; rows: number } | null>
    ack: (ptyId: string, bytes: number) => Promise<void>
    unsubscribe: (ptyId: string) => Promise<void>
    onData: (callback: (payload: TerminalPreviewDataPayload) => void) => () => void
  }
  macosTccPrompts: {
    /** Fires once macOS has raised its Nth consent dialog naming Orca (#9756). */
    onThreshold: (callback: (payload: { promptCount: number }) => void) => () => void
    consumePending: () => Promise<{ claimId: number; promptCount: number } | null>
    acknowledgePending: (claimId: number) => Promise<void>
    releasePending: (claimId: number) => Promise<void>
    dismiss: () => Promise<void>
  }
  developerPermissions: {
    getStatus: () => Promise<DeveloperPermissionState[]>
    request: (args: { id: DeveloperPermissionId }) => Promise<DeveloperPermissionRequestResult>
    openSettings: (args: { id: DeveloperPermissionId }) => Promise<void>
    testLocalNetworkConnection: (args: {
      host: string
      port: number
    }) => Promise<LocalNetworkConnectionTestResult>
  }
  computerUsePermissions: {
    getStatus: () => Promise<ComputerUsePermissionStatusResult>
    openSetup: (args?: {
      id?: ComputerUsePermissionId
    }) => Promise<ComputerUsePermissionSetupResult>
    reset: () => Promise<ComputerUsePermissionResetResult>
  }
  shell: {
    openPath: (path: string) => Promise<void>
    openInFileManager: (path: string) => Promise<ShellOpenLocalPathResult>
    openInExternalEditor: (
      request: ShellOpenExternalEditorRequest
    ) => Promise<ShellOpenExternalEditorResult>
    openUrl: (url: string) => Promise<void>
    openFilePath: (path: string) => Promise<boolean>
    openFileUri: (uri: string) => Promise<void>
    pathExists: (path: string) => Promise<boolean>
    pickAttachment: () => Promise<string | null>
    pickImage: () => Promise<string | null>
    pickRepoIconImage: () => Promise<{ dataUrl: string; fileName: string } | null>
    pickAudio: () => Promise<string | null>
    pickDirectory: (args: { defaultPath?: string }) => Promise<string | null>
    copyFile: (args: { srcPath: string; destPath: string }) => Promise<void>
  }
  skills: {
    discover: (target?: SkillDiscoveryTarget) => Promise<SkillDiscoveryResult>
    freshnessInventory: () => Promise<SkillFreshnessInventory>
    startUpdateRun: (names: string[]) => Promise<SkillUpdateStartResult>
    cancelUpdateRun: () => Promise<void>
    acknowledgeUpdateRun: () => Promise<void>
    getUpdateRun: () => Promise<SkillUpdateRun>
    onUpdateRun: (callback: (run: SkillUpdateRun) => void) => () => void
  }
  dfhisEnvironment: {
    getConfig: () => Promise<DfHisEnvironmentConfigSnapshot>
    check: () => Promise<DfHisEnvironmentCheckResult>
    install: (config?: DfHisEnvironmentConfigInput) => Promise<DfHisEnvironmentInstallResult>
  }
  pet: {
    import: () => Promise<CustomPet | null>
    importPetBundle: () => Promise<CustomPet | null>
    read: (id: string, fileName: string, kind?: 'image' | 'bundle') => Promise<ArrayBuffer | null>
    delete: (id: string, fileName: string, kind?: 'image' | 'bundle') => Promise<void>
  }
  browser: BrowserApi
  emulator: EmulatorApi
  hooks: HooksApi
  ephemeralVm: EphemeralVmApi
  cache: WorkspaceSessionApi['cache']
  session: WorkspaceSessionApi['session']
  remoteWorkspace: WorkspaceSessionApi['remoteWorkspace']
  updater: UpdaterApi
  notebook: FilesystemApi['notebook']
  stats: StatsApi
  memory: MemoryApi
  claudeUsage: ClaudeUsageApi
  codexUsage: CodexUsageApi
  openCodeUsage: OpenCodeUsageApi
  aiVault: AiVaultApi
  agentSession: {
    findLockHolders: (
      sessionId: string
    ) => Promise<{ pid: number; ppid: number; command: string }[]>
    killLockHolder: (pid: number) => Promise<boolean>
  }
  nativeChat: NativeChatApi
  fs: FilesystemApi['fs']
  git: Merged<GitInspectionApi & GitOperationApi>
  ui: Merged<UiCommandEventApi & UiWindowApi>
  runtime: RuntimeApi['runtime']
  runtimeEnvironments: RuntimeApi['runtimeEnvironments']
  rateLimits: RateLimitsApi
  minimaxCredentials: MinimaxCredentialsApi
  grokAccounts: GrokAccountsApi
  ssh: SshApi
  automations: AutomationsApi
  wsl: RuntimeApi['wsl']
  pwsh: RuntimeApi['pwsh']
  gitBash: RuntimeApi['gitBash']
  plugins: PluginsApi
  agentStatus: AgentStatusApi
  mobile: MobileApi
  speech: SpeechApi
}

export type { ClaudeUsageApi, CodexUsageApi, OpenCodeUsageApi } from './api/agent-usage-api'
export type { AiVaultApi } from './api/ai-vault-api'
export type { AppApi } from './api/app-api'
export type { BrowserApi, DetectedBrowserInfo, DetectedBrowserProfileInfo } from './api/browser-api'
export type { EmulatorApi } from './api/emulator-api'
export type { ExportApi } from './api/filesystem-api'
export type {
  NativeChatApi,
  NativeChatAppendedMessages,
  NativeChatAppendedPayload,
  NativeChatReadSessionResult,
  NativeChatSubscribeArgs,
  NativeChatSubscriptionFrame
} from './api/native-chat-api'
export type {
  PluginHostInstallResult,
  PluginHostInstallSource,
  PluginHostListEntry,
  PluginHostLogLine,
  PluginHostPanel,
  PluginHostStatus,
  PluginMarketplaceHostInstallPreview,
  PluginMarketplaceHostListing,
  PluginMarketplaceHostSourceState
} from './api/plugin-host-api'
export type {
  PreflightApi,
  PreflightRuntimeContext,
  PreflightStatus,
  RefreshAgentsResult
} from './api/preflight-api'
export type {
  PtyManagementApi,
  PtyManagementMacTccAttributionHealth,
  PtyManagementSession
} from './api/pty-management-api'
export type {
  ShellOpenExternalEditorRequest,
  ShellOpenExternalEditorResult,
  ShellOpenLocalPathResult
} from './api/shell-api'
export type {
  DiagnosticsBundlePayload,
  DiagnosticsStatusPayload,
  DiagnosticsUploadPayload,
  MemoryApi,
  StatsApi
} from './api/telemetry-api'

declare global {
  // oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- declaration merging requires interface
  interface Window {
    electron: ElectronAPI
    api: PreloadApi
  }
}
