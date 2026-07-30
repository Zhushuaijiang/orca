# 示例工程目录

本目录存放面向下游业务项目的可直接照抄示例。

当前包含：

1. [df-demo-service/README.md](df-demo-service/README.md)
2. [df-demo-integration-service/README.md](df-demo-integration-service/README.md)

建议选择方式：

1. 如果业务服务以 Web + JPA + 多租户为主，先从 `df-demo-service` 起步。
2. 如果业务服务需要展示 RedisLockUtil 防重锁、RedisUtil Hash 缓存和 RabbitMQ 事件发布，参考 `df-demo-integration-service`。
3. 两个示例可以组合使用，一个负责基础 CRUD 骨架，一个负责基础设施接入方式。