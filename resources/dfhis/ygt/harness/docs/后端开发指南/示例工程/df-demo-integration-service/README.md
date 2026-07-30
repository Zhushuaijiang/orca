# df-demo-integration-service

这是基于 df-java-base 的基础设施接入示例工程，用于演示业务项目如何把 Redis 分布式锁、Redis Hash 缓存、RabbitMQ 事件发布和 routeKey 注解监听串成一个最小业务闭环。

## 示例覆盖内容

1. 继承 `df-parent`
2. 引入 `df-core-starter`、`df-tenant-starter`、`df-redis-starter`、`df-message-starter`
3. 使用统一响应体 `R<T>` 和全局异常处理
4. 使用 `TenantId` 传递租户上下文
5. 使用 `RedisLockUtil` 包装预约创建命令，演示防重锁 key 规范
6. 使用 `RedisUtil.hmSet`、`RedisUtil.hmGet`、`RedisUtil.getExpire` 演示预约结果快照缓存
7. 使用 `MessagePublishTemplate` 发布预约创建事件
8. 使用 `@DfMessageRouteKeyListener` 自动声明监听队列并消费预约创建事件
9. 演示通过 RabbitMQ Management HTTP API 为监听队列开启 lazy queue 与内存驻留限制
10. 提供一套无需真实 Redis / RabbitMQ 的测试方式，方便业务团队先验证接入代码结构

## 运行前提

1. 已能解析 `com.df:df-parent:4.0.0-SNAPSHOT` 及相关 starter。
2. JDK 版本为 25。
3. Maven 版本为 3.9+。
4. 本地已安装 Docker Desktop 或其他兼容 `docker compose` 的运行环境。

## 配置结构

```
src/main/resources/
├── application.yml                                      # 引导配置：服务名、端口、行为开关（不含连接信息）
├── application-local.yml                                # 本地开发：localhost Redis/RabbitMQ、本地密钥（默认激活）
└── nacos-examples/
    ├── shared-middleware-prod.yml                       # Nacos 共享配置示例：Redis / RabbitMQ / ES（跨服务复用）
    └── df-demo-integration-service-prod.yml             # Nacos 服务配置示例：JWT secret / Management API 凭证
```

**本地开发**（默认 `spring.profiles.active=local`）：先执行 `docker compose up -d`，再启动服务。

**生产/预发环境**：
1. 在 `pom.xml` 中引入 `df-cloud-starter`（包含 Nacos 配置客户端）。
2. 在 `application.yml` 中取消 `spring.cloud / spring.config.import` 的注释，填入真实 Nacos 地址。
3. 将 `nacos-examples/` 中两个文件的内容分别上传到 Nacos 对应 DataId，填入真实连接信息和密钥。
4. 若需要观测预约接口的请求/响应摘要或临时开启 body 日志，可直接复用 `df-demo-integration-service-prod.yml` 中的 `df.core.web.logging.*` 示例段，并按真实接口路径调整 `body-path-patterns`。

## 启动本地依赖

```powershell
docker compose up -d
```

当前 compose 文件会启动：

1. Redis 7，端口 `6379`
2. RabbitMQ Management，端口 `5672` 和 `15672`

## 本地运行

```powershell
$env:JAVA_HOME='D:\Program Files\Java\jdk-25.0.2.10-hotspot'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"

mvn spring-boot:run
```

## 本地验证

创建预约：

```http
POST /api/appointments
TenantId: 0
Content-Type: application/json

{
  "patientName": "张三",
  "patientIdCard": "320101199001011234",
  "scheduleCode": "SCH-001"
}
```

成功后会看到：

1. 返回体被统一包装成 `R<T>`。
2. 业务层按照 `appointment:create:<tenantId>:<scheduleCode>:<patientIdCard>` 规则获取 Redis 锁。
3. 成功创建后，业务层会按 `appointment:result:<tenantId>:<appointmentNo>` 规则把预约结果快照写入 Redis Hash，并返回 cacheKey 与剩余 TTL。
4. 通过 `MessagePublishTemplate` 向 `df.demo.exchange` / `appointment.created` 发送预约创建事件。
5. `AppointmentCreatedEventListener` 会通过 `@DfMessageRouteKeyListener` 自动声明监听队列并消费该事件。
6. 若开启本地 RabbitMQ Management，starter 会对监听队列下发 lazy queue 与 `max-in-memory-*` 策略。

查询预约缓存：

```http
GET /api/appointments/{appointmentNo}/cache
TenantId: 0
```

适合照抄的 Redis 使用要点：

1. `RedisLockUtil` 只负责“同一个业务键在同一时刻只允许一个线程/节点进入临界区”。
2. `RedisUtil` 负责业务缓存快照，不与锁 key 混用。
3. 锁 key 和缓存 key 都带 `tenantId`，避免多租户串数据。
4. util 抛出的基础设施异常在 service 层转换为 `BusinessException`，接口层只暴露统一错误码。

## 复制到业务项目时要改什么

1. 把包名 `com.df.example.integration` 改成你自己的业务包名。
2. 把 `artifactId` 改成真实业务服务名。
3. 把 `demo.messaging.exchange` 和 `demo.messaging.routing-key` 改成真实交换机和路由键。
4. 参考 `nacos-examples/` 中的示例，在 Nacos 中配置真实 Redis/RabbitMQ 连接、JWT 密钥和可选的 HTTP 日志观测规则，然后在 `application.yml` 中取消 Nacos import 的注释。
5. 根据环境配置 `df.message.rabbit.management.*`，决定是否通过 Management API 下发队列治理策略。
6. 如果你的业务需要自定义队列名、并发度或治理参数，优先在 `@DfMessageRouteKeyListener` 上声明，不要把这些声明硬编码在 Controller 中。
7. 如果你的业务需要短 TTL 结果缓存、草稿缓存、幂等标记或计数器，优先沿用示例中的 key 规则和 `RedisUtil` 封装方式，不要在业务模块再复制一套 `RedisTemplate` 工具类。