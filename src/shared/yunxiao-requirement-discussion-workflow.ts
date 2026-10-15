import type { TuiAgent } from './tui-agent'

export function buildYunxiaoRequirementDiscussionWorkflow(primaryAgent: TuiAgent): string {
  return `编码前必须完成辅助模型需求讨论：
1. 先归档需求、读取相关评论/附件并定位当前代码；把精简需求、业务意图、相关代码证据、约束及待决策问题写入归档内的讨论输入文件，不要只传需求标题或整份历史会话。
2. 按 $orca-cli 解析本会话的 Orca CLI 可执行文件。下面的 ORCA 表示该可执行文件，禁止原样执行。运行 ORCA auxiliary discuss --prompt-file <讨论输入文件> --primary-agent ${primaryAgent} --worktree current --json，并将完整结果保存到需求归档的 REQUIREMENT_DISCUSSION.json。
3. 该命令分别使用“资料分析”“架构分析”“代码审核”“任务分解”所配置的 agent、模型和推理强度，先独立分析，再交叉审核并汇总。讨论只分析，不修改业务代码。它独立于“自动任务路由”开关；不得硬编码某个模型替代任务配置。
4. 命令失败、结果缺失或 status 不是 ready_to_build 时禁止编码；保留阻塞原因，业务分歧或证据缺口向用户提问，不以多数票、猜测或默认通过替代决策。确认后补充证据重跑讨论，禁止伪造或手改通过状态。
5. 讨论通过后，你仍是原需求负责人。读取 $orchestration，建立受监督 Run，分别用 ORCA auxiliary run implementation --prompt-file <实施任务文件> --primary-agent ${primaryAgent} --worktree <需求隔离工作区> --json 和 ORCA auxiliary run testing --prompt-file <测试任务文件> --primary-agent ${primaryAgent} --worktree <需求隔离工作区> --json 派发实现与测试。各任务使用对应辅助模型配置；先等实现结算再启动可能编辑同一代码的测试任务。任务文件必须写清具体目标、范围、约束、文件所有权和验收证据，不能只给需求号。
6. 原 agent 负责监督 worker 完成、核实证据、处理问题和交付；不得在 worker 仍持有编辑权时并发修改同一文件。执行后把任务、实际 agent/model、结果和证据记录到归档。后续独立代码审核仍只审核和指导，修复意见交回原 agent。`
}
