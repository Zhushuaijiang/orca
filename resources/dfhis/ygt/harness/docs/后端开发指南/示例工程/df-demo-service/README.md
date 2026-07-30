# df-demo-service

这是基于 df-java-base 的最小业务项目示例工程，用于演示业务项目如何接入并遵守脚手架规则。

## 示例覆盖内容

1. 继承 `df-parent`
2. 引入 `df-core-starter`、`df-jpa-starter`、`df-tenant-starter`
3. 使用统一响应体 `R<T>`
4. 使用 `BusinessException` 和 `CommonErrorCode`
5. 使用 `BaseEntity` 和 `BaseRepository`
6. 使用 `SpecificationBuilder` 做动态查询
7. 使用 `PageData` 返回分页结果
8. 使用 `TenantId` 进行租户上下文传递
9. 提供 Querydsl `Q` 类型，满足 `df-jpa-starter` 的仓储工厂要求
10. 使用 `df-core-starter` 默认提供的 OpenAPI/Swagger UI 文档能力
11. 演示接口 API 声明标配写法，可直接作为业务服务模板

## 运行前提

1. 已能解析 `com.df:df-parent:4.0.0-SNAPSHOT` 及相关 starter。
2. JDK 版本为 25。
3. Maven 版本为 3.9+。

## 配置结构

```
src/main/resources/
├── application.yml              # 引导配置：服务名、端口、行为开关（不含连接信息）
├── application-local.yml        # 本地开发：H2 内存库、本地密钥（默认激活）
└── nacos-examples/
    └── df-demo-service-prod.yml # Nacos 配置示例：生产环境放入 Nacos 的内容
```

**本地开发**（默认 `spring.profiles.active=local`）：直接启动，使用 H2 内存库，无需外部依赖。

**生产/预发环境**：
1. 在 `pom.xml` 中引入 `df-cloud-starter`（包含 Nacos 配置客户端）。
2. 在 `application.yml` 中取消 `spring.cloud / spring.config.import` 的注释，填入真实 Nacos 地址。
3. 将 `nacos-examples/df-demo-service-prod.yml` 的内容上传到 Nacos 对应 DataId，填入真实连接信息。
4. 若需要观测接口摘要或临时开启 body 日志，可直接复用同文件中的 `df.core.web.logging.*` 示例段，并按真实接口路径调整 `body-path-patterns`。

## 本地运行

```powershell
$env:JAVA_HOME='D:\Program Files\Java\jdk-25.0.2.10-hotspot'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"

mvn spring-boot:run
```

## 本地验证

API 文档入口：

1. Swagger UI：`http://localhost:8088/swagger-ui/index.html`
2. OpenAPI JSON：`http://localhost:8088/v3/api-docs`
3. OpenAPI YAML：`http://localhost:8088/v3/api-docs.yaml`

接口声明约定：

1. 示例中的 `PatientController`、`CreatePatientRequest`、`PatientDetailResponse` 已补齐 OpenAPI 注解，作为服务开发默认模板。
2. 业务项目新增接口时，应按同样方式补齐 `@Tag`、`@Operation`、`@Schema`、主要响应码说明，而不是把 Swagger 生成结果当成“自动有就行”。

创建患者：

```http
POST /api/base/patients
TenantId: 0
Content-Type: application/json

{
  "name": "张三",
  "age": 31
}
```

分页查询：

```http
GET /api/base/patients?pageNumber=0&pageSize=10&keyword=张
TenantId: 0
```

## 复制到业务项目时要改什么

1. 把包名 `com.df.example` 改成你自己的业务包名。
2. 把 `artifactId` 改成真实业务服务名。
3. 按业务能力增加其他 starter，例如 `df-redis-starter`、`df-cloud-starter`、`df-message-starter`。
4. 参考 `nacos-examples/df-demo-service-prod.yml`，在 Nacos 中配置真实数据库连接、JWT 密钥和可选的 HTTP 日志观测规则，然后在 `application.yml` 中取消 Nacos import 的注释。
5. 如果继续使用 `df-jpa-starter`，需要为实体提供 Querydsl `Q` 类型。示例工程当前直接内置了 [src/main/java/com/df/example/patient/model/QPatient.java](src/main/java/com/df/example/patient/model/QPatient.java) 作为最小可运行方案；正式业务项目更建议通过 APT 自动生成。
6. 如果业务服务还需要 Redis 分布式锁和 RabbitMQ 事件发布，可直接参考兄弟示例 [../df-demo-integration-service/README.md](../df-demo-integration-service/README.md)。