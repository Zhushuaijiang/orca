import type { LinkedWorkItemSummary } from '@/lib/new-workspace'

export type CodeMergeAction = 'import' | 'preflight' | 'start'
export type CodeMergeComposerAction = Exclude<CodeMergeAction, 'import'>

const CODE_MERGE_SKILL_NAME = '$his-release-merge'
const CODE_MERGE_BATCH_FALLBACK = 'manual'

const ACTION_LABELS: Record<CodeMergeAction, string> = {
  import: '导入清单',
  preflight: '合并预检',
  start: '开始合并'
}

function toLocalFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const prefix = /^[A-Za-z]:\//.test(normalized) ? 'file:///' : 'file://'
  return `${prefix}${encodeURI(normalized)}`
}

function getPathBasename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath
}

export function getCodeMergeBatchLabel(excelPath?: string): string {
  if (!excelPath) {
    return CODE_MERGE_BATCH_FALLBACK
  }
  const fileName = getPathBasename(excelPath)
  const match = fileName.match(/(?:^|\D)(20\d{2})[-_](\d{2})[-_](\d{2})(?!\d)/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : CODE_MERGE_BATCH_FALLBACK
}

export function getCodeMergeWorkspaceSeed(action: CodeMergeAction, excelPath?: string): string {
  return `his-release-merge-${getCodeMergeBatchLabel(excelPath)}-${action}`
}

export function buildCodeMergePrompt(action: CodeMergeAction, excelPath: string): string {
  const batchLabel = getCodeMergeBatchLabel(excelPath)
  const actionInstruction =
    action === 'import'
      ? '只解析 Excel 清单并输出服务分类、目标分支映射、非代码项和不明确记录；不要修改任何仓库。'
      : action === 'preflight'
        ? '执行只读预检：解析 Excel、识别服务仓库、验证源/目标分支、评估冲突风险并输出执行计划。'
        : '先执行完整预检；预检无阻塞后，把涉及服务复制/克隆到隔离工作区，再在那里执行合并。遇到歧义或冲突就停止并汇报，不要自动 push。'
  const preflightRules =
    action === 'preflight'
      ? [
          '- 预检阶段不得修改任何仓库或工作区，不得创建隔离副本。',
          '- 预检阶段不得 cherry-pick、merge、commit、push、checkout、reset、clean。',
          '- 预检阶段只允许读取 Excel、读取文件、读取 git status/log/show/diff/branch。'
        ]
      : []
  return [
    `使用 ${CODE_MERGE_SKILL_NAME} skill 处理 HIS 发版代码合并。`,
    '',
    `本次动作: ${ACTION_LABELS[action]}`,
    actionInstruction,
    '',
    '输入与规则:',
    `- Excel 清单: ${excelPath}`,
    `- 批次标识: ${batchLabel}`,
    '- HIS 源码根目录只读: 不要使用预设固定路径；必须按当前执行主机动态发现。',
    '- 源码根目录发现顺序: 先读取 HIS_SOURCE_ROOT 或 DFHIS_SOURCE_ROOT；再检查 Excel 所在目录及父级附近的 HIS code 聚合目录；再检查当前用户 HOME/USERPROFILE 下常见 workspace 目录。',
    '- 只有确认目录下存在多个 Git 仓库且能匹配清单服务名后，才把它作为 HIS 源码根目录。',
    '- 如果找不到源码根目录或匹配出多个候选，停止并请用户提供这台机器上的 HIS 源码根目录。',
    '- 隔离工作区根目录: 不要使用预设固定路径；开始合并时优先使用 HIS_RELEASE_MERGE_ROOT 或 DFHIS_RELEASE_MERGE_ROOT，否则使用当前会话可写目录下的 his-release-merge/<批次>，且不得位于源码根目录内部。',
    '- 16.1 目标分支: RC_2.16.1_250514',
    '- 15.3 目标分支: release_2.15.3_250515',
    '- 不要在源码根目录下直接修改、提交、重置、清理或推送。',
    '- 源码根目录只允许读文件、读 git status/log/show/diff；禁止在源码根目录执行 git fetch、pull、worktree、merge、cherry-pick、checkout、reset、clean 或任何会写工作区/.git 元数据的命令。',
    ...preflightRules,
    '- 不要触碰与清单无关的仓库或文件。',
    '- 如果需要用户确认，先给出具体行号、服务、分支和原因。',
    '- Orca 当前任务页选择的仓库不是合并目标；不要基于当前 repo 推断 HIS 服务路径。',
    '',
    '输出要求:',
    '- 先列出服务分类和无法确定的记录。',
    '- 再列出计划中需要复制/合并的仓库、源分支、目标分支和风险。',
    '- 对冲突项给出文件列表、当前状态和下一步建议。'
  ].join('\n')
}

export function buildCodeMergeLinkedWorkItem(
  action: CodeMergeAction,
  excelPath: string
): LinkedWorkItemSummary {
  return {
    provider: 'yunxiao',
    type: 'issue',
    number: 0,
    title: `${ACTION_LABELS[action]} · HIS 发版代码合并`,
    url: toLocalFileUrl(excelPath),
    yunxiaoIdentifier: `his-release-merge-${getCodeMergeBatchLabel(excelPath)}`,
    linkedContext: {
      provider: 'code-merge',
      version: 1,
      renderedText: [
        `Excel: ${excelPath}`,
        `Skill: ${CODE_MERGE_SKILL_NAME}`,
        `Batch: ${getCodeMergeBatchLabel(excelPath)}`,
        'Source root: discover on the current execution host',
        'Workspace root: use env override or a writable isolated session directory',
        '16.1 target: RC_2.16.1_250514',
        '15.3 target: release_2.15.3_250515'
      ].join('\n')
    }
  }
}
