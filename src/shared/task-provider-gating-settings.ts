/** One-shot task-provider visibility guards and the requirement-gate switches (fork). */
export type TaskProviderGatingSettings = {
  /** Why: one-shot guard to make Yunxiao visible for existing profiles once, without re-adding after a later opt-out. */
  visibleTaskProvidersDefaultedForYunxiao: boolean
  /** Why: one-shot guard to make code merge visible for existing profiles once, without re-adding after a later opt-out. */
  visibleTaskProvidersDefaultedForCodeMerge: boolean
  /** When true, pasting/launching prompts that mention DFHIS/Yunxiao requirements
   *  get wrapped with the controlled requirement workflow gate instructions. Off by default. */
  yunxiaoRequirementPromptGateEnabled?: boolean
  /** Why: 会话结束后自动评审并沉淀技能/记忆（hermes 式）；缺省视为开启（!== false）。 */
  skillReviewEnabled?: boolean
  /** Gates the fork's GitHub attribution column and related settings. */
  enableGitHubAttribution: boolean
}
