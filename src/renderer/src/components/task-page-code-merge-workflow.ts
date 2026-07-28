import type { LinkedWorkItemSummary } from '@/lib/new-workspace'

export type CodeMergeAction = 'import' | 'preflight' | 'start'
export type CodeMergeComposerAction = Exclude<CodeMergeAction, 'import'>

const CODE_MERGE_BATCH_LABEL = '2026-07-27'
const CODE_MERGE_SKILL_NAME = '$his-release-merge'
const CODE_MERGE_SOURCE_ROOT = '/Users/jijiguowangdemac/workspace/dongfang/his/code'
const CODE_MERGE_WORKSPACE_ROOT = '/Users/jijiguowangdemac/workspace/dongfang/his/release-merge'

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

export function getCodeMergeWorkspaceSeed(action: CodeMergeAction): string {
  return `his-release-merge-${CODE_MERGE_BATCH_LABEL}-${action}`
}

export function buildCodeMergePrompt(action: CodeMergeAction, excelPath: string): string {
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
    `- HIS 源码根目录只读: ${CODE_MERGE_SOURCE_ROOT}`,
    `- 隔离工作区根目录: ${CODE_MERGE_WORKSPACE_ROOT}`,
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
    yunxiaoIdentifier: `his-release-merge-${CODE_MERGE_BATCH_LABEL}`,
    linkedContext: {
      provider: 'code-merge',
      version: 1,
      renderedText: [
        `Excel: ${excelPath}`,
        `Skill: ${CODE_MERGE_SKILL_NAME}`,
        `Source root: ${CODE_MERGE_SOURCE_ROOT}`,
        `Workspace root: ${CODE_MERGE_WORKSPACE_ROOT}`,
        '16.1 target: RC_2.16.1_250514',
        '15.3 target: release_2.15.3_250515'
      ].join('\n')
    }
  }
}
