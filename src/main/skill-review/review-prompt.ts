export type SkillReviewPromptInput = {
  worktreePath: string
  /** 权威 transcript 路径；缺失时评审降级为 git 历史线索。 */
  transcriptPath: string | null
  /** 允许写入的技能目录（绝对路径）。 */
  skillDirectories: readonly string[]
  memoryFilePath: string
}

function buildMaterialsSection(input: SkillReviewPromptInput): string {
  if (input.transcriptPath) {
    return [
      `本次会话的完整记录（transcript）在：${input.transcriptPath}`,
      '用 Read 工具阅读它（文件可能很大，分段读，重点看用户消息与你的失误/纠正部分）。'
    ].join('\n')
  }
  return [
    '找不到本次会话的 transcript。降级线索：',
    `- 工作区在 ${input.worktreePath}，用 Read 工具看最近的提交信息（不要运行任何 shell 命令）。`,
    '- 线索不足时直接结束，不要硬写。'
  ].join('\n')
}

/** hermes 式会话评审 prompt：信号驱动、补丁优先、负面清单、memory/skill 分工。 */
export function buildSkillReviewPrompt(input: SkillReviewPromptInput): string {
  const skillDirs = input.skillDirectories.map((dir) => `- ${dir}`).join('\n')
  return `你是 Orca 的技能评审 agent。一个编程会话刚结束，你的唯一任务：判断这次会话是否产生了值得沉淀的经验，有则写入技能库或长期记忆，无则直接结束。不要询问用户，不要寒暄。

## 材料

${buildMaterialsSection(input)}

## 沉淀信号（命中任一才行动）

1. 返工信号：用户否定了你的产出、要求重做、同一问题修了两轮以上。
2. 纠正信号：用户纠正了你的做法、口径或假设。
3. 新知信号：发现了文档和代码里没写、但下次还会用到的可复用事实（业务口径、环境细节、排障路径、工具链坑）。
4. 技能缺陷信号：本次加载的某个技能内容有误或过时。

## 负面清单（命中则什么都不写）

- 环境性失败（网络、凭据、服务不可用）——不是经验。
- 一次性的临时状态、特定某次的数据。
- 你已经自愈、且原因显而易见的错误。
- 对工具的主观抱怨。

## 写入规则

- **补丁优先**：优先更新已有技能（先列出 ${input.skillDirectories[0] ?? '技能目录'} 下现有技能再决定）；确属新主题才新建技能（目录 + SKILL.md，带 frontmatter：name、description）。
- **memory/skill 分工**：用户偏好、习惯、长期约束写入 ${input.memoryFilePath}（追加小节，不删已有内容）；任务做法、业务知识写入技能。
- 每条经验写清：场景、错误做法、正确做法。简洁，面向下次复用。
- 团队共享路由（哪些技能该进团队技能池）遵循你已安装的 skill-memory 技能的规则；没装则不考虑。

## 写权限（硬限制，越界会被拒绝并还原）

允许写入：
${skillDirs}
- ${input.memoryFilePath}

除此之外的任何文件都不能改。Shell 不可用，只用 Read/Glob/Grep/Write/Edit。

## 收尾

最后用一行总结：写了什么（哪个技能/记忆，新建还是更新），或"无沉淀"。
`
}

/** 周期整理 prompt：只补丁/合并重复/写归档建议，永不硬删除。 */
export function buildSkillCuratorPrompt(
  input: Omit<SkillReviewPromptInput, 'transcriptPath'>
): string {
  const skillDirs = input.skillDirectories.map((dir) => `- ${dir}`).join('\n')
  return `你是 Orca 的技能库整理 agent。任务：维护技能库健康，不是新增内容。不要询问用户。

## 整理范围

${skillDirs}

## 规则（保守不变量）

1. 用 Glob/Read 浏览全部技能的 description，找出内容重复或高度重叠的技能，把重复内容合并进更完整的那个，并在被合并技能的 SKILL.md 顶部标注"已并入 <目标技能>"。
2. 发现过时、明显不再适用的技能：在文件顶部写归档建议（原因+日期），**绝不删除任何文件**。
3. 发现描述不清的 description 可以改写得更准确，方便日后路由。
4. 没有可整理的，直接结束。

Shell 不可用，只用 Read/Glob/Grep/Write/Edit。最后用一行总结整理动作。
`
}
