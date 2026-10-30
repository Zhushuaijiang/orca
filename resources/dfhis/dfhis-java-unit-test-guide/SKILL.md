---
name: dfhis-java-unit-test-guide
description: Java/Spring 后端服务单元测试编写与交付门禁。默认基线 Java 8 + Spring Boot 2.2.x + Gradle + JUnit 4 + Mockito。触发词：单元测试、junit、mockito、测试用例、单测覆盖率、test scaffolding、新建 service 写测试、controller 单测、QueryDSL 单测、dftest 依赖。当在 df-mic-* 后端仓（mic/agg/bff/winbff）新增 service 控制器/QueryDSL 仓库、为 DFHIS 需求写 Java 后端测试、CI 报"零测试交付"、或内网依赖仓库 403 导致 gradle 全量构建跑不起来需要定向 javac + JUnit 直跑兜底时使用。
---

# DFHIS Java 后端单元测试

> 完整规范见 [单元测试规范](docs/单元测试规范.md)。本文件只列门禁清单与最快落地步骤，避免在聊天中复述全文。

跨层契约、事务与提测完成条件见 [质量契约](../requirement-delivery-flow/references/quality-contract.md)。纯单测的隔离要求不禁止必要的集成测试。

## 最快落地流程

1. 先在业务模块 `build.gradle` 检查 `dftest-spring-boot-starter`（不能只看根项目）。缺失则按同服务基线加 2.0.0-SNAPSHOT（旧模块沿用 `testCompile`，新模块用 `testImplementation`），不引 JUnit 5/MockK/PowerMock。
2. 新建 `<module>/src/test/java`，包路径与生产代码一致；类名 `被测类 + Test`；方法名 `方法_场景_预期`（如 `load_existingId_returnsData`）。
3. 默认写纯单测：不启动 Spring、不用 `@SpringBootTest`、不连库/Redis/HTTP；Repository/Feign/消息发送器/时钟 Mock 掉；实体/DTO 直接 `new`。
4. 写 `Given/When/Then`；覆盖正常、边界、空值、异常、副作用；断言完整业务结果而非只断言 `notNull`。
5. `@Mock + @InjectMocks` 必须配 `MockitoJUnitRunner`；`ArgumentCaptor` 抓保存/发送参数；只对外部协作者 mock，禁 `verifyNoMoreInteractions` 过度锁实现。
6. Controller 纯单测：实例化 + mock Service；MVC 映射/校验/JSON 用 `*WebTest` 切片；SQL/事务/约束走数据库集成测试 `*IntegrationTest`。
7. 本地 `gradle :<module>:test --tests "<pkg>.<Class>"` 单类跑通，提交前跑模块全量；时间用 `yyyy/MM/dd HH:mm` 固定，禁止 `new Date()`。
8. 提交前过下方"提交检查清单"全部打勾。

## 提交检查清单

- [ ] 模块 `build.gradle` 已检查并按需补 `dftest` 依赖
- [ ] JUnit 4 + Mockito 与当前模块版本一致，未混用 JUnit 5
- [ ] 测试目录 `src/test/java`，包路径与生产代码一致
- [ ] 类名 `被测类 + Test`，方法名 `方法_场景_预期`，无 `test1/normalTest`
- [ ] 不启动 Spring、不连库/Redis/Nacos/Feign/MQ/文件/HTTP
- [ ] 覆盖真实风险：正常、边界、空值、异常、副作用
- [ ] Mock 仅限外部依赖；`@Mock/@InjectMocks` 配 `MockitoJUnitRunner`
- [ ] 副作用用 `verify` 验证参数与次数；`ArgumentCaptor` 抓复杂入参
- [ ] 不复制生产逻辑做"白盒镜像"测试；直接调用真实生产代码
- [ ] 不为测试扩大 `public` API；复杂逻辑抽包级方法
- [ ] 不依赖时间/随机数/环境/执行顺序；静态/上下文状态 `@After` 还原
- [ ] 提交前已跑模块全量测试通过
- [ ] Controller 纯单测用 `new Controller + mock Service`；映射/校验用 `*WebTest`
- [ ] Service 测业务分支/编排/依赖交互；Repository 测 QueryDSL 条件与结果转换
- [ ] 真实 SQL/事务/约束走 `*IntegrationTest`，不混在纯单测

## 反模式（红牌）

- `verifyNoMoreInteractions(mock)` 锁死实现细节 → 业务重构时全测红
- `@SpringBootTest` 启动整个 Spring → 测试慢、不稳定、需数据库
- 复制生产实现到测试里"做白盒镜像" → 测试和生产代码脱节
- 断言只 `assertNotNull(result)` → 业务正确性零保证
- 禁止操作/失败回滚必须验证无下游副作用；可用 `verify(mock, never())` 检查有业务意义的调用，再按风险补真实事务/数据验证，不以“不该调用”为由跳过
- 一个 `void` 测试里塞 7 个 `assert` 覆盖 5 个场景 → 出错定位难、维护难
- `test1`、`normalTest`、`testDebug` 命名 → 重构/搜索/复制全是灾难
- 用 `@SpringBootTest` 测"Repository 保存成功" → 集成测试 5 分钟启动一次，纯单测 50ms

## 隔离 worktree 下的本地构建坑（df-mic-* 仓）

来源 DFHIS-32391（2026-09-08，df-mic-lc-zhuyuan，JDK 11.0.32 + Gradle 6.9.4）：

- **generateGitProperties 失败**：gradle-git-properties 插件的 jgit 不支持 linked worktree，报 `RepositoryNotFoundException: <主仓>/.git/worktrees/<name>`。本地测试/编译命令追加 `-x :模块:generateGitProperties` 排除即可（仅命令行参数，禁止改构建文件）。
- **QueryDSL 生成物污染工作区**：构建会改写被 git 跟踪的 `src/main/generated`（如 `QYZ_BingRenYz.java`）并新增未跟踪目录（如 `yibaosc/`）。提交前必须 `git checkout HEAD -- <模块>/src/main/generated/` 还原并删除新增目录，保证交付 diff 只含源码与测试。
- **stash 验证基线时的恢复方法**：为证明存量失败与本改动无关而 `git stash -u` 回基线复跑后，pop 会被上述生成文件冲突阻断且"stash entry kept"。恢复三步：`git checkout stash@{0} -- <源文件路径>` 逐个取回业务改动 → `git checkout HEAD -- src/main/generated/` 清生成物 → `git stash drop`。测试文件属未跟踪文件通常已自动恢复，需 `git status` 核对。
- **存量坏测试挡住 compileTestJava**（DFHIS-32574，2026-09-22，df-mic-jichufw）：test source set 是整体编译，仓库里别人的坏测试（`ZiDongKsPzServiceImplTest` 缺 `setKaiDanSm`）会让 `:模块:test` 连 `--tests` 指定的单类都跑不起来。错误做法：替别人修坏测试或改构建文件排除。正确做法：把坏测试临时 `mv` 到工作区外 → 跑聚焦测试并捕获 status → `mv` 还原 → `git status` 核对该文件干净；汇报里注明"模块全量测试被存量坏测试挡住"即可。坏测试可能已被团队修复，动手前先确认它仍编译失败。又一实例（DFHIS-32884，2026-10-26，df-mic-jj-menzhen/mic-jj-guahao `HouZhenSjSzServiceImplTest:53` 缺 mockito 静态导入报 `找不到符号 mock(...)`，同法 mv 出/mv 回处置）。再一实例是**基线编译性损坏**形态（DFHIS-32930，2026-10-28，df-bff-lingchuangmz 15.3 `release_2.15.3_250515`）：基线测试 `MenZhenBIngLiServiceImplHerbalRefundTest` 用了 Mockito 3.4+ 的 `MockedStatic`，而 spring-boot 2.2.5 锁 mockito-core 3.1.0，纯基线 tip `compileTestJava` 即 10 个 `找不到符号`——非笔误而是依赖版本缺口，该线上**任何**合入的本地单测都被挡（Jenkins 跑 test 同样会红）。存量证明：独立 clone 检出基线 tip 原样跑同一命令对比失败集合；聚焦测试仍可按上法 mv 出坏文件跑通，但必须上报基线修复（升 Mockito 或改旧测试），不在本次改动里顺手修。
- **免移动替代路径**（DFHIS-32670，2026-09-30，同仓同坏测试 `ZiDongKsPzServiceImplTest`，DFHIS-32457 引入且仍坏）：不想动工作区文件时，把被测逻辑抽成 package-private 静态方法（如 QueryDSL `buildPageWhere`），测试写成同包 `main()` 式普通类、只依赖生产类，绕开 test source set——init 脚本任务导出 **`sourceSets.main.runtimeClasspath`** 到文件（坏测试挡住 compileTestJava 时 test runtimeClasspath 不可解析），再手动 `javac -cp <主classpath>` 编译测试类、`java -cp <主classpath>:<测试输出目录>` 运行，全程不触发 compileTestJava。注意：手动逐 jar 拼 classpath 是无底洞，classpath 必须让 gradle init 脚本导出（仓外 `-I` 文件，不碰 build.gradle）。
- **本机 JDK/Gradle 定位**（DFHIS-32667，2026-09-30，df-mic-cdr 实证；**2026-10-26 DFHIS-32903 更新：工具链已迁移**）：`/usr/libexec/java_home -V` 报 "Unable to locate a Java Runtime" 不代表无 JDK，别顺着它去装 Java；部分 df-mic-* 仓（如 df-mic-cdr）不带 gradlew wrapper。**当前入口是 `~/.local/bin/gradle`**（包装脚本：JAVA_HOME=zulu8.96 JDK8 + `~/.local/share/his-build-tools/gradle-6.8.3`；旧的 `/opt/homebrew/bin/gradle` 6.9.4 与 `/opt/homebrew/opt/openjdk@11` 已不存在，直接用会 no such file）。无需配 JAVA_HOME；需显式 java 时用 `~/.local/share/his-build-tools/zulu8.96.0.205-ca-jdk8.0.504-macosx_aarch64/Contents/Home/bin/java`。另注意：同一 test 任务同参数重跑会 UP-TO-DATE 假执行（exit 0 但没真跑），要真实执行证据用 `cleanTest test`。
- **Docker 兜底编译（本机工具链版本不够时，DFHIS-32852 2026-10-27 实证）**：先 `~/.local/bin/gradle --version` 确认上一条的工具链是否已够用，别只凭 `java_home -V` 报错就判"本机无 JDK"。目标模块要 JDK11 而本机只有 JDK8 时用本地已有镜像 `gradle:6.8-jdk11`，并**仓外 init 脚本**注入阿里云 maven 仓库与 `mavenLocal()`，仓库 `build.gradle` 零改动；起一个常驻容器复用依赖缓存（`docker run -d --name dfhisNNNNN-gradle -v <需求>/code:/code -v /tmp/dfhisNNNNN:/cfg -v ~/.gradle-docker:/root/.gradle -w /code gradle:6.8-jdk11 sleep infinity`），之后逐模块 `docker exec … gradle -I /cfg/aliyun-repos.init.gradle :<module>:compileJava --no-daemon --console=plain`。适合"共享 api 先 install 到本地仓、再编译调用方"的契约取证链。
- **df-mic-lc-zhuyuan 全量测试基线：8 个存量失败**（DFHIS-32913，2026-10-27，feature 分支基于 `origin/RC_2.16.1_250514`@527250dd，Docker `gradle:6.8-jdk11` + 仓外 init + `-x :mic-lc-zhuyuan:generateGitProperties`）：`mic-lc-zhuyuan` 全模块 221 tests / 213 passed / 8 failed 属存量——7 个 `BingRenYzControllerTest` 用例 `Failed to load ApplicationContext`（根因 `applicationId: null, txServiceGroup: null-seata-service-group`，Seata scanner bean 装配期环境配置缺失，先于任何业务方法失败）+ 1 个 no-runnable。证无关用修复前基线 A/B 复跑（同命令失败集合逐条一致），交付证据里逐条列名；定向用例用 `cleanTest test --tests <类>` 真执行。
- **Mockito 3.1.0 varargs 匹配**（DFHIS-32809，2026-10-20，df-mic-jichufw/mic-gy-jichufw 实证，mockito-core 3.1.0 来自 junit 4.12→mockito-junit-jupiter 3.1.0 依赖链）：stub `JdbcTemplate.queryForList(String, Object...)` 这类 varargs 方法时，`any(Object[].class)` 与 `AdditionalMatchers.aryEq(...)` 放 varargs 位**都不命中**（unstubbed 调用静默返回空集合，症状是"查回 0 行/Excel 只剩表头行/分批记录为空"，极易误判为生产代码 bug）；`ArgumentCaptor` 放 varargs 位捕获到的是单个元素（String→Object[] ClassCastException）。正确做法：末位用 `ArgumentMatchers.<Object>any()`（显式前缀+泛型避免绑定到 `queryForList(String, Class)` 重载）；需按批次区分或读实际参数时配 `thenAnswer` 从 `invocation.getArguments()` 取。
- **根构建禁用测试任务与测试源集**（DFHIS-32884，2026-10-26，df-mic-jj-menzhen 实证）：根 `build.gradle` 对 subprojects 禁用 `test`/`compileTestJava` 且 test 源集 `exclude '**/*'`，直接跑 `gradle :<module>:test --tests …` 会"BUILD SUCCESSFUL"但零用例（源集为空、任务被禁）。错误做法：改仓库 build.gradle 解禁或把 exclude 删掉。正确做法：仓外 init 脚本在 `gradle.projectsEvaluated` 中对目标模块 re-enable `test`/`compileTestJava`/`testClasses` 等任务，并 `sourceSets.test.java.setSrcDirs(['src/test/java'])` + `setExcludes([])` 复位源集，命令行 `-I` 传入，仓库内零改动（模板：`<requirement_dir>/enable-module-tests.init.gradle`）。
- **测试跑出来的未跟踪生成物**（DFHIS-32406，2026-10-21，df-mic-jj-menzhen / df-mic-yaokufang 实证）：跑 `:<module>:test` 后工作区会出现 logback 生成的未跟踪目录——`<module>/logs.dir_IS_UNDEFINED/`，部分仓还会生成一个字面名为 `D:/` 的目录（Windows 风格日志路径在 macOS 上被当成相对目录）。都不是源码，提交前逐个 `rm -rf`；且复跑测试会再次生成，每次交付前都要用完整 `git status` 重查，不能只用首次干净的结果。
- **`git status --short` 曾漏报未提交修改**（DFHIS-32809 实证，原因未定位）：前端 worktree --short 显示干净但实际有修改、后端显示 4 文件实际 7 文件，完整 `git status` 才揭示真相。交付前核对工作区一律用完整 `git status`，勿只看 --short。

## Repository 分页 H2 测试：RC 基线推进后的两类失败（DFHIS-32371 实证）

纯单测优先；只有 QueryDSL 分页/投影这类必须验证 SQL 语义的场景才用 H2 内存库 + 合成种子数据（不连业务库）。跨会话恢复这类测试后基线推进会让上次能过的测试失败，按两类排查，都不是测试逻辑错：

- **integrity constraint at insert**：RC 给 entity 新增了非空列（实证：`DAYINBZ`/`KANGZHONGLIUYXJ`/`SHUNXUHAO`），旧种子 insert 缺列。修法：`@Before` relax 约束或种子补默认值，不要删测试场景；先假定 schema 漂移，再查断言。
- **IllegalArgumentException 属性映射/转换**：分页投影直带 entity 时 primitive 字段无法映射 null；Hutool `ConverterUtil.listConverter` 把 entity 的 `Integer`（null）拷到 DTO 的 primitive `int`（实证 `ruKuCs`）也会炸——这是生产代码路径，真实 null 数据同样会挂，需判断业务上是否恒有值，种子按生产口径补值。DTO 字段尽量用包装类型。

## 复杂分组COUNT须执行真实查询，不能只验证编译

来源DFHIS-32386（2026-10-08，洛宁SP16物品核销OOM）：旧Hibernate在`count(distinct concat(...))`处报HQL解析错误，compileJava通过仍不能证明SQL可运行。对复杂病人日期分组，应在独立合成数据库里直接执行生产Repository，覆盖COUNT、分组后分页、跨页遍历、三类别及当前页UDI。使用现有SQLQueryFactory可规避该旧HQL限制，无需改构建或全量fetch后切片。

同类坑（DFHIS-32406，2026-10-22，df-mic-jj-menzhen）：QueryDSL `numberTemplate` 在 `CASE ... THEN` 内拼 `*`，Hibernate 5.4.12 真实解析报 `QuerySyntaxException: unexpected token: *`；只断言生成 JPQL 字符串或 H2 执行都可能通过，必须用同版本 HQL 解析器或部署后真实入口验证。修法与断言写法见 `dfhis-herbal-prescription-dose-consistency` 的“收费可退量的 QueryDSL 写法”。

切换原生QueryDSL SQL时，别名`new QEntity("alias")`不是实际表名：相关子查询要显式`.from(Expressions.as(实际Q表, 别名Q))`，否则会查询不存在的alias表。`coalesce()`在旧QueryDSL返回Coalesce而非StringExpression，复杂字符串键须核实表达式类型。H2仅用于合成SQL正确性/有界响应验证；其耗时不能称医院RT、冷启动或生产收益。

缺少测试驱动且禁止改构建时，可由仓外Gradle init脚本将H2驱动仅加入Test任务classpath；不改变产品运行依赖。编译器堆不足可用命令行JVM参数解决，但不能将javac堆调整写成业务服务OOM修复。

### QueryDSL-SQL必须验证生产连接提供器与事务代理

来源DFHIS-32386（2026-10-09回归）：前一天H2测试用`() -> conn`直接注入裸连接，SQL/分页/并发全部通过；现场`SpringConnectionProvider`却在COUNT取连接前报`Connection is not transactional`。JPA切换SQLQueryFactory时遗漏了事务边界，裸连接测试掩盖了缺陷。

- 核验实际消费的querydsl-sql-spring版本与SpringConnectionProvider字节码；该提供器要求连接绑定当前Spring事务，裸JDBC正确不等于生产链路可运行。
- 在共同SQL入口（如Spring管理的Repository公开方法）建立只读事务，或在每个Service公开入口建立事务；若旧入口自调用新入口，不能只给被自调用方法加注解。BFF本地事务不能替代远程服务事务。
- SQL集成测试使用真实SpringConnectionProvider与由生产注解驱动的Spring事务代理、独立合成库；不能在测试类自动加事务来掩盖生产方法漏注解。先记录缺注解时的失败，再验证修复。
- 覆盖接口方法到实现的注解解析、分页/COUNT/UDI/并发、无代理负例、SQL异常后连接解绑和事务同步状态清理。保持纯单测与SQL集成测试分层，不启动完整业务应用、不连医院库。
- JDK、Gradle、H2驱动仍由仓外配置提供；不得为修复改构建/锁文件或绕过共享契约发布。源码/本地运行通过不等于医院包已更新，部署后需核验实际JAR指纹并重测原入口。

## 依赖仓库 403 时：定向 javac + JUnit 直跑兜底（df-mic 仓）

场景（2026-09-25，df-mic-jj-zhuyuan v_blzk 根治实证）：`df-mic-api` 等内部仓库当前凭据无下载权限（403），gradle 全量构建跑不起来，但 `~/.gradle/caches` 里有前一天成功构建留下的全部依赖 jar。此时不改构建文件、不求人开权限，用定向编译验证改动闭包：

- **JDK 用 11**（`/opt/homebrew/opt/openjdk@11`，与仓库工具链一致），javac 显式列入改动的实体/装配器/服务/测试类为编译单元，类路径从缓存精选 jar。
- **离线模式要带完整仓库清单**：只配部分仓库时 `--offline` 匹配不到缓存里已有的件，误判"缓存没有"。
- **缓存高版本污染必须剔除**：spring-boot 3/4、spring 6/7、spring-data 3/4、hibernate 7.x、mockito 5、logback 1.5 等 jar 混进类路径会报 Java 17 类文件/行为不兼容——编译错先怀疑污染，不是代码错。
- **lombok 只能一个版本且置顶**：多个 lombok 混在类路径低版本抢先导致注解处理失败；把 1.18.12 放类路径最前，且 `-processorpath` 只放它。
- **汇报口径**：注明"本地定向 javac 编译 + JUnit 直跑全绿，建议在有内网依赖权限的环境跑一次 `./gradlew :<module>:test` 做最终确认"，不冒充完整构建通过。

## 仓内无 JUnit/dftest 依赖时：纯 JDK main 断言测试

老 SP 服务仓（如 df-sapi mic-sapi 的 SP15 分支）常无 JUnit/dftest 依赖，而交付门禁"改动必须编写测试用例"又不允许为此改构建文件。落地路径（DFHIS-32062 先例，ORIGIN-11194 2026-09-21 复用，17/17 断言）：

1. 测试写成 `src/test/java` 下的普通类 + `main` 方法（包路径同生产代码），自行计数断言；全部通过打印 `[单号] all N assertions passed`，任一失败非零退出。
2. 断言按四象限设计：缺陷主场景（复现触发条件的配置下，修复后行为正确）、默认配置（无该配置时无回归）、原实现基线（固化缺陷成因，防修复被悄悄移除）、字段复制完整性（转换器不丢字段）。
3. 用一次性 init-script 注册 JavaExec 任务运行，仅命令行使用、不改仓库任何构建文件：

   `gradle -I <req>/run-xxx.init.gradle :<module>:<taskName> -x generateGitProperties`

   init 脚本模板：`rootProject { project('<module>') { tasks.register('<taskName>', JavaExec) { classpath = sourceSets.test.runtimeClasspath; main = '<测试类FQCN>' } } }`

4. 时间戳/日期类期望值禁止手算（ORIGIN-11194 毫秒→日期基线手算错一轮后返工），用同一时区的格式化代码生成期望值再断言。

## 与其它技能联动

- Reopen 教训第 #8 条：HIS 改动必须同步单元测试，零测试交付一律不合格
- `dfhis-reopen-lessons`：`C:/Users/13406/.agents/skills/dfhis-reopen-lessons/`
- 代码约束：`yunxiao-requirement-archiver` 第 13 步"单元测试"门禁
- 收尾流程：测试通过 + 编译通过 + 截图（UI 需求）→ 云效评论 + 字段回写

## 关联 dfhis 规范来源

- 本技能包基于 `D:/MacRestore/Desktop/单元测试指南.md`（DFHIS 团队 Java 后端测试基线，2026-08-25 沉淀）。
- 与服务端发布的 `dfhis-skill-pack.zip` 同步更新。
