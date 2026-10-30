## 公司 npm 源旧版本下架与 worktree 构建坑（DFHIS-32288，2026-09-03）

- packages.aliyun.com 私有源会**清除旧版本**（packument 与 tarball 同时 404，如 @df_scope/df-utils@0.8.35、@df_scope/df-ui@1.7.597）。老仓库按原 yarn.lock 安装会 404，且 yarn 缓存空壳条目（只有目录无内容）无法命中；篡改缓存内容会触发 integrity 校验失败。合规做法：不改动仓内 lock，复制到临时目录替换为仍存在的邻近版本完成本地构建取证，交付说明中注明版本差异并建议 Jenkins 复核；根治需依赖版本治理任务。
- Gradle 插件 `generateGitProperties`（jgit）**不识别 git worktree**（repository not found: .git/worktrees/...）。在需求隔离 worktree 内跑 gradle 时加 `-x generateGitProperties`；Jenkins 正常克隆不受影响。复现：DFHIS-32196/32138（dfhis-reopen-lessons §28）、DFHIS-32391（df-mic-lc-zhuyuan）、DFHIS-32334（df-mic-jichufw、df-bff-lingchuangmz，2026-09-09）。报错含 `.git/worktrees/` 且发生在该任务即为此坑，仅命令行排除，禁止改构建文件。

## df-his-api 契约改动的依赖方本地编译三坑（DFHIS-32547，2026-09-20）

多仓需求改了共享 `df-his-api` 后，依赖方（mic/bff）本地编译吃不到新字段的排查顺序（按序逐项试）：

- **changing SNAPSHOT 缓存竞争**：`df-his-api` 本地 `gradle install` 到 `~/.m2` 后，依赖方在线解析仍选远程旧 timestamped 快照（全局 `~/.gradle/init.gradle` 已注入 mavenLocal 也一样）。解法：`cp ~/.m2/.../xxx-api-3.0.0-SNAPSHOT.jar` 覆盖 `~/.gradle/caches/modules-2/files-2.1/com.df.cbhis/<api>/3.0.0-SNAPSHOT/<hash>/` 下的 jar，再 `gradle --offline compileJava/test`。注意：清空 files-2.1 下该 api 目录后重新在线编译，会重新拉回远端旧版，无效。
- **settings.gradle include 被注释**：df-bff-guahaosf 等仓 `//include 'xxx-api'` 被注释，但 service 的 build.gradle 仍用 `project(':xxx-api')` 引用（仓内既有状态，CI 另有口径）。本地编译用 sed 临时启用 include，编译后 `git checkout settings.gradle` 还原；禁止把构建文件改动混进需求提交。
- **generated Q 类入库口径不一**：df-mic-lc-zhuyuan 的 `src/main/generated` 提交入库（新增 @Entity 后对应 Q 类必须 git add——漏提交是评审阻塞项）；df-mic-yaokufang 的 `.gitignore` 忽略 `src/main/generated/com`（Q 类不入库，编译通过即可）。APT 会"顺手"生成他人实体的未同步 Q 类（如 QYZ_BingRenYzUdiGl），提交前 `git status` 甄别，只 add 本次新增实体的 Q 类。
- **QueryDSL 常量投影**：查询常量列不能用 `.as()`，用 `Expressions.asString("...").as("alias")`，否则编译报错。
