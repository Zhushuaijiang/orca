---
name: init-docs
description: 初始化项目完整目录结构，创建 backend/、docs/、frontend/、scripts/ 标准化目录，提交并推送到远程仓库
triggers:
  - init-docs
  - 初始化文档
  - 创建文档目录
---

# Init Docs

初始化项目完整目录结构并提交到 Git。

## 目录结构

```
├── backend/              (.gitkeep)
├── docs/
│   ├── README.md
│   ├── 01-项目概述.md
│   ├── 02-当前服务设计方案.md
│   ├── 03-AI协作指南.md
│   ├── 04-YGT工作流Harness.md
│   └── legacy/
│       ├── README.md
│       ├── 02-领域模型与表结构设计规范.md
│       └── 04-常见问题FAQ.md
├── frontend/             (.gitkeep)
└── scripts/              (.gitkeep)
```

## 执行步骤

### 1. 创建目录与文件

```bash
# 创建目录（空目录加 .gitkeep 以便 git 跟踪）
mkdir -p backend docs/legacy frontend scripts

# 空目录需要 .gitkeep
touch backend/.gitkeep frontend/.gitkeep scripts/.gitkeep

# 创建 docs/ 文件
touch \
  docs/README.md \
  docs/01-项目概述.md \
  docs/02-当前服务设计方案.md \
  docs/03-AI协作指南.md \
  docs/04-YGT工作流Harness.md \
  docs/legacy/README.md \
  docs/legacy/02-领域模型与表结构设计规范.md \
  docs/legacy/04-常见问题FAQ.md
```

### 2. 校验

```bash
find backend docs frontend scripts -type f | sort
```

预期：3 个 `.gitkeep` + 8 个 `.md` = 11 个文件。

### 3. 提交并推送

```bash
git add backend/ docs/ frontend/ scripts/
git commit -m "feat: 初始化项目目录结构与文档"
git push
```

如果是新仓库首次提交，用 `git push -u origin master`。

## 注意事项

- 如果文件已存在，**不覆盖**已有内容，仅创建缺失的文件和目录
- 空目录（`backend/`、`frontend/`、`scripts/`）必须放 `.gitkeep`，否则 git 不会跟踪
- 执行前检查是否有未提交的变更，避免混入无关修改
