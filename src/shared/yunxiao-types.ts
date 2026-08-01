export type YunxiaoRequirementPriority = 'low' | 'medium' | 'high' | 'urgent'

export type YunxiaoCreateRequirementArgs = {
  title: string
  description?: string
  priority?: YunxiaoRequirementPriority
  labels?: string[]
  assignee?: string | null
  archiveAfterCreate?: boolean
}

export type YunxiaoArchiveRequirementArgs = {
  workItemIdOrUrl: string
  dispatch?: boolean
  reviewMode?: 'deep' | 'quick'
}

export type YunxiaoWorkItemCategory = 'Req' | 'Task' | 'Bug'

export type YunxiaoWorkItemPerson = {
  id: string | null
  name: string
}

export type YunxiaoWorkItemSprint = {
  id: string
  name: string
}

export type YunxiaoWorkItem = {
  id: string
  serialNumber: string | null
  title: string
  category: YunxiaoWorkItemCategory | string
  typeName: string | null
  statusId: string | null
  statusName: string | null
  customer: string | null
  priority: string | null
  assignee: YunxiaoWorkItemPerson | null
  participants: YunxiaoWorkItemPerson[]
  sprint: YunxiaoWorkItemSprint | null
  updatedAt: string | null
  url: string | null
}

export type YunxiaoTodoPoolStatus =
  | 'queued'
  | 'needs-clarification'
  | 'ready-to-build'
  | 'archived'
  | 'running'
  | 'dispatched'
  | 'workspace-created'
  | 'failed'
  | 'done'
  | 'dismissed'

export const DEFAULT_YUNXIAO_TODO_POOL_AUTOMATION_STATUSES = [
  'queued',
  'ready-to-build',
  'workspace-created'
] as const satisfies readonly YunxiaoTodoPoolStatus[]

export type YunxiaoRequirementContractStatus =
  | 'needs_clarification'
  | 'ready_to_build'
  | 'missing_repo'
  | 'blocked'
  | 'ready_to_verify'

export type YunxiaoRequirementContractOwner =
  | 'product'
  | 'development'
  | 'qa'
  | 'agent'
  | 'external'

export type YunxiaoRequirementContractQuestionOption = {
  id?: string
  label: string
  impact: string | null
  recommended?: boolean
}

export type YunxiaoRequirementContractQuestion = {
  id: string
  question: string
  whyBlocking: string | null
  options: YunxiaoRequirementContractQuestionOption[]
}

export type YunxiaoRequirementContractDecision = {
  id: string
  summary: string
  source: string | null
  impact: string | null
  decidedAt: number | null
  answeredBy?: string | null
  answerSourceType?: 'orca_ui' | 'yunxiao_comment' | 'agent' | 'manual' | null
  yunxiaoCommentId?: string | null
  selectedOptionId?: string | null
}

export type YunxiaoRequirementReviewTier = 'none' | 'focused' | 'mandatory'

export type YunxiaoRequirementRiskProfile = {
  reviewTier: YunxiaoRequirementReviewTier
  reasons: string[]
  uiWorkflow: boolean
  apiOrDatabase: boolean
  permissionsOrRelease: boolean
  multiRepository: boolean
  requirementConflict: boolean
  weakVerification: boolean
}

export type YunxiaoRequirementReviewCheck = {
  role: 'prd_gate' | 'architecture' | 'implementation' | 'verifier'
  verdict: 'pass' | 'conditional_fail' | 'fail'
  topRisks: string[]
  evidence: string | null
  dispatchId: string | null
  reviewedAt: number | null
}

export type YunxiaoRequirementDesignAlternative = {
  id: string
  summary: string
  tradeoff: string | null
  decision: 'selected' | 'rejected' | 'deferred'
  reason: string | null
}

export type YunxiaoRequirementImplementationPlanSnapshot = {
  status: 'not_required' | 'required' | 'ready' | 'missing'
  path: string | null
  summary: string | null
  updatedAt: number | null
}

export type YunxiaoRequirementVerificationEvidenceType =
  | 'failing_test'
  | 'passing_test'
  | 'command'
  | 'runtime'
  | 'business'
  | 'database'
  | 'build'
  | 'jenkins'
  | 'deployment'
  | 'smoke'
  | 'screenshot'
  | 'artifact'
  | 'yunxiao'

export type YunxiaoRequirementVerificationEvidence = {
  id: string
  type: YunxiaoRequirementVerificationEvidenceType
  command: string | null
  artifactPath: string | null
  result: 'pass' | 'fail' | 'blocked'
  summary: string
  collectedAt: number | null
}

export type YunxiaoRequirementMethodologyGate = {
  designConfirmed: boolean
  alternatives: YunxiaoRequirementDesignAlternative[]
  implementationPlan: YunxiaoRequirementImplementationPlanSnapshot | null
  requiredEvidenceTypes?: YunxiaoRequirementVerificationEvidenceType[]
  verificationEvidence: YunxiaoRequirementVerificationEvidence[]
}

export type YunxiaoRequirementContractSnapshot = {
  status: YunxiaoRequirementContractStatus
  owner: YunxiaoRequirementContractOwner
  nextAction: string
  intent: string
  archiveDir: string | null
  prdPath: string | null
  evidenceUpdatedAt: number | null
  updatedAt: number
  blockingQuestions: YunxiaoRequirementContractQuestion[]
  decisions: YunxiaoRequirementContractDecision[]
  riskProfile: YunxiaoRequirementRiskProfile | null
  reviewChecks: YunxiaoRequirementReviewCheck[]
  methodologyGate?: YunxiaoRequirementMethodologyGate | null
}

export type YunxiaoRequirementGateOutcome = {
  itemId: string | null
  poolStatus: YunxiaoTodoPoolStatus | null
  requirementContract: YunxiaoRequirementContractSnapshot | null
  evidence: string | null
  updatedAt: number
}

export type YunxiaoTodoPoolItem = YunxiaoWorkItem & {
  poolStatus: YunxiaoTodoPoolStatus
  poolOrder: number
  addedAt: number
  poolUpdatedAt: number
  lastSyncedAt: number | null
  attempts: number
  claimedAt: number | null
  claimedByAutomationId: string | null
  claimedByRunId: string | null
  lastError: string | null
  notes: string
  requirementContract: YunxiaoRequirementContractSnapshot | null
}

export type YunxiaoTodoPoolAddArgs = {
  items: YunxiaoWorkItem[]
}

export type YunxiaoTodoPoolUpdateArgs = {
  id: string
  updates: Partial<
    Pick<
      YunxiaoTodoPoolItem,
      'poolStatus' | 'poolOrder' | 'notes' | 'lastError' | 'requirementContract'
    >
  >
}

export type YunxiaoWorkItemFilters = {
  category?: YunxiaoWorkItemCategory | 'all'
  statusIds?: string[]
  sprintId?: string | null
  assigneeId?: string | 'self' | null
  participantId?: string | 'self' | null
  query?: string | null
  page?: number
  perPage?: number
}

export type YunxiaoWorkItemFacet = {
  id: string
  name: string
  count: number
}

export type YunxiaoListWorkItemsArgs = {
  filters?: YunxiaoWorkItemFilters
}

export type YunxiaoListWorkItemsResult =
  | {
      ok: true
      items: YunxiaoWorkItem[]
      people: YunxiaoWorkItemFacet[]
      sprints: YunxiaoWorkItemFacet[]
      statuses: YunxiaoWorkItemFacet[]
      page: number
      perPage: number
      hasMore: boolean
    }
  | { ok: false; error: string }

export type YunxiaoRequirementResult =
  | {
      ok: true
      workItemId: string | null
      url: string | null
      message: string
      archiveMessage?: string
    }
  | { ok: false; error: string }

export type YunxiaoArchiveRequirementResult =
  | { ok: true; workItemId: string | null; message: string }
  | { ok: false; error: string }
