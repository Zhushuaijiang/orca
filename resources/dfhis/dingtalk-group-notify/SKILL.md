---
name: dingtalk-group-notify
description: 向钉钉群发送通知消息（自定义机器人 webhook）。用于 HIS 发版合并推送完成后必须发群通知的场景，也用于用户要求“发消息通知到群里”“合并完发钉钉”“推送后通知群”“发个群消息”“群里说一声”“at 某人/杜萍”等。含默认 webhook（东昉HIS智能体技术问答-代码提交助手）、合并通知内容规范、发送校验、@ 人限制（云效 userId 不能用于钉钉@）和失败处理。
---

# 钉钉群通知（自定义机器人 Webhook）

## 何时发送

- **`his-release-merge` 流程强制**：代码真实推送成功后，必须立即发送合并完成通知；推送未成功不得发送，也不要把通知当成推送前的预告。
- 用户显式要求“发消息通知到群里 / 通知群 / 发钉钉 / @ 某人”时。
- 其他交付、发布节点（Jenkins 发布、部署完成等），用户要求通知时同样适用。

## 默认目标（HIS 团队）

- 群：**东昉HIS智能体技术问答**（机器人：代码提交助手，由帅江添加）
- Webhook：
  `https://oapi.dingtalk.com/robot/send?access_token=bfcd806b42bbb18279f17b9245b3f7060de0b9b514115256a588648b10c1b67b`
  （2026-09-16 用户提供并实测可用）
- 用户在任务里给了其他 webhook → 以任务里给的为准。

## 发送方式（实测可用）

```python
import json, urllib.request

url = "<webhook>"
payload = {
    "msgtype": "markdown",
    "markdown": {"title": "<标题>", "text": "<正文，支持 markdown>"},
    "at": {"isAtAll": False},          # 需要 @ 人时按下方规则补充
}
req = urllib.request.Request(
    url, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
    headers={"Content-Type": "application/json"}, method="POST")
print(urllib.request.urlopen(req, timeout=30).read().decode("utf-8"))
```

- 成功判据：响应 JSON `errcode == 0`（`errmsg: ok`）。
- 非 0：按 `errmsg` 处理（token 失效 / 被限流 / 内容被安全拦截等），可重试一次并如实向用户报告结果。

## 合并通知内容规范（his-release-merge 强制）

标题：`<目标分支> 发版合并完成（已推送）`；正文逐条列出：

- 仓库/服务：需求号（一句话简述）+ 提交 sha 区间（`旧..新`）
- 验证结论一行（编译 / 单测结果）
- 冲突处理一行（有冲突写清楚按什么原则解决了什么；无冲突可省略）

保持简短：群消息只给摘要，不贴长 diff / 验证日志全文。

## @ 人规则（重要）

- 自定义机器人只能通过 `atMobiles`（手机号）或 `atUserIds`（钉钉 userId）实现真实 @：
  ```json
  "at": {"atMobiles": ["13800000000"], "isAtAll": false}
  ```
- **云效 userId 不能用于钉钉 @**（2026-09-16 实证：云效通讯录、组织成员接口均不含手机号，取不到她的号码）。
- 没有手机号 / 钉钉 userId 时：直接发群不 @（2026-09-16 用户认可），或先询问用户；`isAtAll: true` 仅在用户明确要求“@所有人”时使用。
- 正文里写“@某某”只是普通文字，不产生提醒效果，不要拿它冒充真实 @。

## 反例与坑

- 推送失败 / 未推送却发“合并完成”通知 → 误导全组，禁止。
- 把长 diff、完整日志、大段表格贴进群消息 → 只给摘要。
- 消息里出现密码、token、数据库连接串等敏感信息 → 禁止。

## 关联技能

- `his-release-merge`（推送成功后必须调用本技能发通知）
- `his-workflow-harness`（发布/部署节点如需通知，同样使用本技能）

## 示例消息（2026-09-16 SP16 合并实测）

```text
**SP16 发版合并完成（已推送）**
目标分支：release_2.15.3_SP16_tag_260528

- mic-lc-menzhen：DFHIS-32108（门诊日志支持未看诊患者）+ DFHIS-32289（全院模式就诊状态透传）→ a494ef5e0..920db33fd
- mic-lc-zhuyuan：DFHIS-31944（撤销审核中医嘱过滤）→ ef2f4e20..0151c1ec

验证：两仓库 compileTestJava 均 BUILD SUCCESSFUL；新增单测 10/10 通过；32108 一处冲突已按原始 diff 解决（未带入无关世系改动）。
```
