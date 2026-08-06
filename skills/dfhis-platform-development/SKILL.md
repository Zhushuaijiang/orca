---
name: dfhis-platform-development
description: >-
  DFHIS 平台架构和开发经验。用于锚点插件开发（maoDian/DfApp.plugin SDK）、
  OAPI MagicAPI 动态脚本创建和自动化（MagicEditor/curl 管理 API）、
  qiankun 微前端页面归属确认、SM4/SM3 国密算法对接（SM4Util/SM3Util/SM3SignUtil 行为差异）、
  云效 memberId vs userId 区分。当需求涉及前端插件接入、动态脚本端点创建、
  外部接口加解密签名、或需要确认 HIS 页面实际归属仓库时使用。
---

# DFHIS 平台开发经验

从实际需求中积累的 DFHIS 平台架构知识，供后续需求复用。环境地址和凭据见 `dfhis-company-environment` 技能。

## 锚点插件系统

DFHIS 前端通过锚点（maoDian）机制在业务页面注入自定义插件，无需修改核心前端代码。

### 核心概念

- **锚点（maoDian）**：在 `df-web-yewugymk` 的 `maoDianEnum.js` 中注册，每个锚点有数字编码（如 `38` = 健康档案调阅）
- **插件 JS**：在 iframe 沙箱中运行，通过 `DfApp.plugin.*` SDK 与宿主 HIS 交互
- **插件配置（chaJianPz）**：JSON 格式，存储在 `df-web-zhushujugl` 插件管理中，运行时通过 `DfApp.plugin.pluginConfig` 读取
- **触发方式**：右侧菜单按钮、页面按钮等，由插件配置决定

### 插件 SDK（DfApp.plugin）

```javascript
const { logInfo, message, request, pluginUtils, getUserInfo, openNewUrl, getCurrentKeShi } = DfApp.plugin
const config = DfApp.plugin.pluginConfig  // chaJianPz JSON

// 统一入口
async function performAction(inputParams) {
    // inputParams: 患者上下文（ehealth_card_id, id_no, shenFenZheng, jiuZhenLsh, bingRenId...）
    // config: 插件配置（自定义 key）
    // request(): 走 OAPI 网关，自动代理到后端
    // openNewUrl(url): 在新窗口打开
    // message({ message, type }): 弹出提示
}
```

### 插件配置 JSON 示例

```json
{
  "timeout": "30000",
  "interruptType": "0",
  "app_id": "xxx",
  "app_secret": "xxx",
  "api_url": "http://10.x.x.x/httpapi/services.ashx"
}
```

### 插件注册流程（df-web-zhushujugl 管理 UI）

1. `http://192.168.1.151:8015/apps/19/waiBuZiDianGl/chaJianGl`
2. 新建插件 → 上传 JS 文件 → 配置 chaJianPz JSON
3. 绑定锚点（maoDianDm）→ 配置适用范围（院区）→ 绑定菜单按钮

### 常用锚点

| 编码 | 含义 | 来源 |
|------|------|------|
| 38 | 健康档案调阅 | maoDianEnum.js:81 |

> 新增锚点需改 `df-web-yewugymk`，复用已有锚点则不需要改前端代码。

## OAPI MagicAPI 动态脚本

详见 `references/company-environment/本地152开发环境.md` 中的 OAPI 章节。

### 适用场景

- 需要新增 HTTP API 端点但不想改 Java 后端
- 外部接口对接（加解密、签名、HTTP 转发）
- 前端插件通过 `request()` 调用 OAPI 端点

### 前端 → OAPI → 外部接口 链路

```
HIS 前端插件 (iframe 沙箱)
  ↓ DfApp.plugin.request()  form-encoded
OAPI 网关 /api/df-oapi/{groupPath}/{scriptPath}
  ↓ MagicScript 执行
df.post() → 外部接口
  ↓ 返回结果
前端插件处理响应
```

## qiankun 微前端架构

DFHIS 前端采用 qiankun 微前端：

- **主门户**：`df-web-main`（端口 9000），负责子应用加载和公共布局
- **业务子应用**：`df-web-zhushujugl`（8033）、`df-web-yewugymk`、`df-web-bingangl` 等
- **通用模块**：`df-web-bui`（8034），主门户 bootstrap 依赖
- **开发模式**：`src/config/apps/apps.dev.js` 从 localhost 加载子应用
- **三个 dev server 缺一不可**：主门户 + 目标子应用 + df-web-bui

### UI 页面归属确认

DFHIS 前端经常在多个工作站/模块间复用页面。确认页面归属的步骤：

1. 检查路由 → 菜单配置 → iframe/micro-frontend 注册
2. 检查 remote component imports
3. 检查 shared package aliases
4. 截图验证页面实际名称

**不要假设任务页仓库就是页面所有者**。

## 国密算法对接经验

### SM4 加密

- DF 工具类：`SM4Util.encryptEcb(plaintext, key)`
- 密钥处理：key 取 UTF-8 字节（`key.getBytes(StandardCharsets.UTF_8)`），**不做 hex 解码**
- 外部文档常说"app_secret 转 hex 取前 32 字符"作为 key 字符串——这与 SM4Util 行为一致
- 填充：SM4/ECB/PKCS5Padding（BouncyCastle 中 PKCS5 和 PKCS7 等价）

### SM3 签名

- DF 工具类：`SM3Util.hash(bytes)` 返回 `byte[]`，需自行 `Hex.toHexString().toUpperCase()`
- **SM3SignUtil.sign() 不可用于外部标准对接**：
  - 无 `&` 分隔符（直接拼接 `key=valuekey=value`）
  - 使用 `&sign_key=` 后缀（外部标准通常用 `&app_secret=`）
  - 返回小写 hex（外部标准通常要求大写）
- 正确做法：在 MagicScript 中手动实现签名逻辑

### 外部接口签名通用模板

```
1. 参数按 key ASCII 升序排列（TreeMap）
2. 拼接 key=value，用 & 分隔
3. 末尾追加 &app_secret=密钥
4. SM3 哈希 → 转大写十六进制
```

## 云效工作项 ID 体系

云效 API 中存在两套 ID，不可混用：

| ID 类型 | 用途 | 获取方式 | 示例 |
|---------|------|---------|------|
| memberId | 组织成员管理 | `search_organization_members` | `64d328d9...` |
| userId | 工作项指派 | 工作项详情的 `assignedTo` 字段 | `5fbb502f...` |

**工作项负责人流转用 userId，不是 memberId**。

常用联系人 userId 见 `yunxiao-requirement-archiver/contacts.md`。
