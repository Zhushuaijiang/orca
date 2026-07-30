# 04 - 常见问题 FAQ

> 兼容 FAQ：本文只保留高频入口，不再复制完整操作手册或规范正文。

本 FAQ 只保留高频入口，详细规则回到对应权威文档，避免 FAQ 和主规范互相漂移。

## 1. 如何配置本地公司开发环境？

在仓库根目录执行：

```powershell
. .\scripts\harness\ygt-env.company-dev.ps1
```

团队共享地址和用户名在 `scripts/harness/ygt-env.company-dev.ps1`；本机密码、token 等私密变量放在被 `.gitignore` 忽略的本地环境文件或系统环境变量中。完整约定见 [04-YGT工作流Harness.md](../04-YGT工作流Harness.md) 的“安全约定”。

## 2. 如何让 AI/Codex 接一个需求或缺陷？

先用 harness intake：

```powershell
node scripts/harness/ygt-workflow.mjs /ygt "一句话描述需求或缺陷" --project auto --json
```

读取返回的 `standards` 后再动手；返回的 `commands` 是推荐闭环。AI 任务边界见 [03-AI协作指南.md](../03-AI协作指南.md)。

## 3. 如何判断该跑哪些验证？

先看影响面：

```powershell
node scripts/harness/ygt-workflow.mjs impact --project main --json
```

一般改动使用：

```powershell
node scripts/harness/ygt-workflow.mjs verify --project main --profile standard --changed-only
node scripts/harness/ygt-workflow.mjs review --project main --json
```

纯前端或纯后端任务可按 impact 结果缩小验证范围；根目录、harness、共享配置变更默认按完整风险处理。

## 4. 后端新接口应该先看哪里？

先读 [后端开发指南/README.md](../后端开发指南/README.md)，再按顺序读 01 到 04。接口、DTO、Entity、Repository、OpenAPI、异常、统一响应等规则不要在 FAQ 里另起一套。

## 5. 前端布局、表格、按钮和弹窗应该先看哪里？

先读 [前端开发指南/README.md](../前端开发指南/README.md)。涉及 DevExtreme 表格和 TreeList 看 [06-DevExtreme集成.md](../前端开发指南/06-DevExtreme集成.md)，涉及页面边距、查询栏、按钮顺序和主应用布局看 [08-布局系统.md](../前端开发指南/08-布局系统.md)。

## 6. 如何部署并做线上闭环？

需求或缺陷已经修完后，优先使用 harness：

```powershell
node scripts/harness/ygt-workflow.mjs release --project main --message "fix: ..."
```

需要完整本地验证、发布和 smoke：

```powershell
node scripts/harness/ygt-workflow.mjs full --project main --message "fix: ..."
```

发布前必须确认本地环境已有 Jenkins 凭据，且 `doctor` 通过关键检查。
