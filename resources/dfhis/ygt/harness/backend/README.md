# df-ygt-main

医共体平台**主应用业务微服务**。

## 1. 职责定位

1. **OAuth2 认证入口**：用户主体映射、客户端管理、token 颁发与校验。token 生成 / 解析统一复用 `JwtTokenService`，不允许自造第二套 token 服务。
2. **各领域能力聚合展现**：门户工作台、菜单聚合、应用入口、跨服务待办与消息汇总等聚合视图，对前端 Shell（`frontend/df-web-ygt-main`）提供统一入口。
3. 本服务**不**承载具体业务领域（患者 / 机构 / 处方等），这些归属各业务子服务。

## 2. 接入基线

- Java 25 / Spring Boot 4.0.5 / Spring Cloud 2025.1.1 / 脚手架 4.0.0-SNAPSHOT
- 父 POM：`com.df:df-parent:4.0.0-SNAPSHOT`
- 启动类：`com.df.ygt.main.YgtMainApplication`
- 服务端口（默认）：`8101`（在 Nacos 中维护）

## 3. 依赖组合

按 `01-接入基线与配置规范.md` §4.4「最小依赖组合」：

| starter | 用途 |
|---------|------|
| df-core-starter | 统一响应 / 异常 / TraceId / OpenAPI / JwtTokenService |
| df-jpa-starter | BaseEntity / BaseRepository / 大结果集保护 |
| df-cloud-starter | Nacos 配置、TraceId 透传、调用其他业务子服务 |
| df-tenant-starter | 多租户上下文（一期不强隔离） |
| df-redis-starter | 认证 token 缓存、防重、限流场景 |

## 4. 配置布局

遵循 `01-接入基线与配置规范.md` §5 Nacos 分层：

| 层 | 文件 | 内容 |
|----|------|------|
| 本地引导层 | [src/main/resources/application.yml](src/main/resources/application.yml) | 仅保留服务名、Nacos 地址、命名空间、分组、`spring.config.import` |
| 共享基础设施层 | Nacos `df-shared-infra.yaml`（示例：[nacos-examples/df-shared-infra.yaml](src/main/resources/nacos-examples/df-shared-infra.yaml)） | Redis / RabbitMQ / ES |
| 服务专属层 | Nacos `df-ygt-main.yaml`（示例：[nacos-examples/df-ygt-main.yaml](src/main/resources/nacos-examples/df-ygt-main.yaml)） | DataSource / JPA / JWT / 端口 / 租户开关 |

本地联调仅允许通过环境变量 `NACOS_ADDR` / `NACOS_NAMESPACE` / `NACOS_GROUP` 覆盖 Nacos 地址，**不得**在 `application.yml` 中回填数据库或 Redis 地址。

### OAuth2 测试客户端

将示例 Nacos 配置 [src/main/resources/nacos-examples/df-ygt-main.yaml](src/main/resources/nacos-examples/df-ygt-main.yaml) 中对应内容同步到真实 Nacos DataId `df-ygt-main.yaml` 后，应用启动时会自动把这 4 个测试 client 写入 `oauth2_registered_client`：

| client_id | client_secret | 客户端认证方式 | grant type | 用途 |
|-----------|---------------|----------------|------------|------|
| `test-cc-basic-client` | `test-cc-basic-secret` | `client_secret_basic` | `client_credentials` | 测试 Basic 方式申请服务 token |
| `test-cc-post-client` | `test-cc-post-secret` | `client_secret_post` | `client_credentials` | 测试表单方式申请服务 token |
| `test-pwd-basic-client` | `test-pwd-basic-secret` | `client_secret_basic` | `password` + `refresh_token` | 测试 Basic + 用户名密码登录 |
| `test-pwd-post-client` | `test-pwd-post-secret` | `client_secret_post` | `password` + `refresh_token` | 测试表单 client 凭证 + 用户名密码登录 |

说明：

1. `password` 模式除了 client 信息外，还需要传 `username`、`password`，建议同时传 `tenantId`。
2. 如果真实 Nacos 环境已有同名 client，需要先删除旧记录或改成新的 `client_id`，因为启动时仅在“库中不存在同名 client”时才会自动初始化。3. 支持 `client-id: auto` 自动生成凭证（详见 §4.1）。

### 4.1 OAuth2 客户端凭证生成与管理

凭证生成遵循[设计说明](../../docs/02-当前服务设计方案.md#oauth2-凭证生成规则)：

| 项目 | 规则 |
|------|------|
| **ClientID** | 8 字节 CSPRNG → 16 位小写十六进制（例：`49cf27ad08e51b36`） |
| **ClientSecret** | 16 字节 CSPRNG → 32 位小写十六进制（例：`178d4fc290b5ea36719c250f84ad6be7`） |
| **存储** | ClientSecret 仅存储 BCrypt 加盐哈希，明文不落库、不落日志 |
| **展示** | 明文仅在创建/重置时一次性返回，后续无法再次获取 |

**创建第三方客户端**（生产推荐方式）：

```http
POST /api/oauth2/clients
Content-Type: application/json

{
  "clientName": "医共体数据交换平台",
  "clientAuthenticationMethods": ["client_secret_basic"],
  "authorizationGrantTypes": ["client_credentials"],
  "scopes": ["main.read"],
  "requireAuthorizationConsent": false
}
```

响应一次性返回明文凭证（请立即安全保存）。

**重置客户端密钥**（旧密钥立即失效）：

```http
POST /api/oauth2/clients/{clientId}/reset-secret
```

**配置自动引导**（开发/测试环境）：在 Nacos `df-ygt-main.yaml` 中将 `client-id` 设为 `auto`：
## 5. 领域目录

按 `03-业务开发与接口实现规范.md` §3 父域归档原则：

```
com.df.ygt.main
├── YgtMainApplication.java
├── domain/
│   ├── auth/         OAuth2 认证：登录、token、客户端、主体映射
│   ├── user/         用户主体、当前用户、个人中心
│   ├── permission/   角色 / 权限 / 菜单 / 资源治理
│   ├── tenant/       租户基础治理（一期保留 tenantid 不强隔离）
│   └── portal/       门户聚合：工作台、应用入口、跨域待办与消息汇总
└── support/
    └── config/       本服务专属配置类（如 OAuth2 Server 配置）
```

每个子域统一五件套：`controller/`、`service/`、`model/`、`repository/`、`dto/`。

## 6. 开发硬约束（最小集）

下列约束来自 `02-基础能力复用与架构红线.md` 与 `03-业务开发与接口实现规范.md`，PR 必查：

1. Controller 返回业务对象，自动包装成 `R<T>`，**不**新增第二套响应壳。
2. 业务异常统一抛 `BusinessException`，错误码用 `CommonErrorCode`。
3. 实体继承 `BaseEntity`，Repository 继承 `BaseRepository`。
4. 实体字段拼音驼峰 + 中文注释；时间字段复用 `BaseEntity` 或固定 `sysCreateTime`/`sysUpdateTime`；创建/修改人固定 `chuangJianRen`/`xiuGaiRen`；租户固定 `tenantId`。
5. HTTP 方法只用 GET 与 POST；新增/修改/删除/批量统一 POST。
6. DTO 继承 `com.df.utility.dto.DTOBase`；批量接口收 `List<DTO_XXX>` 并按 `DTOState` 分组。
7. 分布式 ID 用 `SequenceUtil`；DTO ↔ Entity 转换用 `ConverterUtil`；分布式锁用 `RedisLockUtil`。
8. 所有对外接口必须补齐 `@Tag` / `@Operation` / `@Schema` / 主要响应码。
9. Trace 头固定 `X-Trace-Id`，租户头固定 `X-Tenant-Id`。

## 7. 待补能力（规划中，非当前已实现）

> 严格按 `04-AI协作与代码评审规范.md` §8 区分「已实现」与「规划中」。

- ✅ OAuth2 客户端凭证管理：CSPRNG 安全随机生成 ClientID/ClientSecret，加盐哈希存储，创建/重置 API 已就绪。
- 跨服务聚合调用：依赖各业务子服务接口契约稳定后再落地。
- 菜单 / 资源 / 角色权限模型：待接口设计阶段确定数据模型。
