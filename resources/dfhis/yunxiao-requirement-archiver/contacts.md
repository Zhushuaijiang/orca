# 云效常用联系人

本文件存储云效组织内常用联系人的用户 ID，避免每次都需要搜索。

**组织 ID**：`64cc7343a0c93ee7446892d5`

## 联系人列表

| 姓名 | userId（用于 update_work_item.assignedTo / participants） | memberId（用于组织管理 API） |
|------|------|------|
| 陈洁 | `5fbb502fe24b94a4ec7f8b16` | `64d328d9a0c93ee74468a864` |
| 陈体云 | `665ffde22067c6f595f49ef1` | `665fff06e619f63d83e205cd` |
| 陆继勇 | `64f1a1143f15d5487d836236` | `64f1a11438d942876f45715e` |
| 杨国栋 | `661d075301039df69676cc02` | `661d07537c94f98525259dc7` |
| 郭宏东 | `64f15a8ee7be53b98de4c821` | `64f15a8fdba61e96ebf64a99` |

## 其他已知用户

| 姓名 | userId | memberId | 备注 |
|------|------|------|------|
| 竺帅江 | `64f14341e7be53b98de143c1` | `64f14342dba61e96ebf6497c` | 开发 |
| 杨燕 | `64f1473e38802a1c5cce965e` | `64f1473edba61e96ebf649ca` | 产品 |

## 使用方式

更新工作项负责人：
```python
updateWorkItemFields = {"assignedTo": "<userId>"}
```

添加参与者：
```python
participants = ["<userId>"]
```

## 维护说明

- 新增联系人时，运行 `list_organization_members` 获取 `userId` 和 `memberId`
- `userId` 用于工作项操作（assignedTo / participants）
- `memberId` 用于组织管理 API（search / get member info）
- 两者不同，不可混用
