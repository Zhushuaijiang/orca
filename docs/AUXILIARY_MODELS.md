# 辅助模型

在「设置 → 辅助模型」中，为 Orca 发起的不同任务指定独立的 agent、模型和推理强度。支持全局默认、任务覆盖，以及按主 agent 的任务覆盖。模型 ID 和推理强度按执行主机保存，本机、WSL 发行版、SSH 主机和配对运行环境互相隔离。

修改后点击「保存」；单项「重置」恢复继承，「重置所有任务」清除辅助配置。离开有未保存修改的页面时，沿用设置页面已有的放弃修改提示。动态模型支持填写提供方的精确模型 ID，也可选择 Orca 已发现的模型。

## 自动接入的任务

- 会话标题、提交说明、PR / MR 描述、分支名称。
- 提交失败、推送失败、CI 失败、合并冲突和评审意见处理。这些任务沿用既有 agent 启动流程及权限设置。
- 会话结束后的技能与记忆评审、定期技能整理。这两项沿用已有写入保护，只支持 Claude 与 Kimi；不兼容的全局默认不会替换原有受保护执行器。

仓库中显式配置的任务 agent、模型或 CLI 参数优先于全局辅助配置。没有辅助配置时，原有行为保持不变。会话命名和技能评审可按会话实际使用的 agent 选择专用配置。

对一次性文本生成，可启用「生成失败时使用原任务模型重试」。只重试失败的生成，不重试用户取消的任务，也不自动重做修复工作流或有写入权限的技能评审。回退沿用原任务的模型与命令，并重新准备对应 agent 的登录环境。

## 可调用的辅助任务

设置页的「试运行辅助任务」使用当前编辑的配置和当前工作区。也可从 agent 或终端调用：

```sh
orca auxiliary run decomposition --prompt "规划数据库迁移步骤"
orca auxiliary run review --prompt-file changes.txt --json
orca auxiliary run vision --image /workspace/screen.png --prompt "解释截图中的问题"
```

`--prompt-file` 读取调用机器上的 UTF-8 文件；`--image` 指定执行主机上的图片路径，可以重复。图片分析当前支持 Claude 和 Codex，回退只使用支持图片的 agent。选择远程环境时，任务在所选工作区的执行主机运行；SSH 失联不会改为在本机执行。文件夹工作区也可以调用。

文本任务 ID：`conversationName`、`commitMessage`、`pullRequest`、`branchName`、`vision`、`compression`、`skills`、`approval`、`mcp`、`review`、`voice`、`classification`、`decomposition`、`configDescription`。通过此入口调用 Git 相关文本任务时，调用方需要提供上下文；Git 界面自身会继续收集差异和仓库上下文。

视觉、压缩、技能检索、审批分析、MCP 工具选择、代码评审、语音回复、任务分类、任务分解和配置描述通过该入口执行。调用方提供输入并使用结果：审批分析不会授予执行权限，MCP 建议不会直接执行工具，语音任务接收转写文本而非音频。

Claude、Codex 等 CLI 自己管理的内部上下文压缩、原生图片处理、内部子 agent 和审批逻辑仍由对应 CLI 管理。此配置控制 Orca 发起的辅助请求。

## RPC

`auxiliary.generate` 接收 `{ worktree, task, prompt, images?, primaryAgent?, resolvedParams? }`。`worktree` 使用既有运行时工作区选择器；未指定 `resolvedParams` 时使用执行主机保存的配置。客户端可以先解析自己的辅助配置，再发送所选 agent、模型和可选回退参数，账号凭据留在执行主机。

有源会话的任务使用实际会话 agent 选择配置；普通辅助调用默认使用设置中的默认 agent，可用 `--primary-agent codex` 指定配置来源。成功结果包含请求的 agent、模型和是否发生回退。模型字段表示传给 CLI 的模型 ID；提供方对别名的解释仍由其服务决定。

`auxiliary.cancel` 接收 `{ worktree, task }`，只取消同一任务、同一工作区、同一执行主机的生成。不同辅助任务与会话标题使用不同取消通道。

旧运行环境需要更新后才能调用新增辅助 RPC。现有 Git 生成请求中的回退参数为可选字段，旧主机可以继续处理原有生成请求。
