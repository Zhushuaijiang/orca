# 微前端与共享组件 AI 开发 SOP

这是一份给 AI 用的最短执行文档。

目标只有一个：让 AI 先判断任务类型，再按固定 4 步改对文件，不走弯路，不多改文件。

如果 AI 只看一份文档，请先看这份，不要先看长文档。

## 0. AI 先判断任务类型

先判断本次需求属于哪一种，只能选一种主任务。

| 任务类型 | 目标 | 主要仓库 | 一般只改这些文件 |
| --- | --- | --- | --- |
| A. 主应用新增子应用 | 让 shell 能识别并加载一个新微应用 | `df-web-main-ygt` | `config/apps/apps.prod.js`、`config/apps/apps.dev.js`、`src/micro/apps.ts`，必要时 `src/store/useMenuStore.ts` |
| B. common-biz 新增共享组件 | 让 provider 暴露一个新组件给所有子应用复用 | `df-web-common-ygt-biz` | `src/provider/components/<key>/`、`src/provider/index.ts`、`src/provider/public-types.ts`、测试文件 |
| C. 子应用使用共享组件 | 让某个业务子应用页面直接用 `CommonBizXxx` | 目标子应用仓库，例如 `df-web-template-ygt` | `src/main.ts`、页面文件、可选 `global.d.ts` |

再强调一次：

1. 如果是 A，不要先改 common-biz。
2. 如果是 B，不要先改 shell 注册逻辑。
3. 如果是 C，不要先在页面里动态 import provider 模块。

## 1. 主应用新增子应用

适用场景：主应用 `df-web-main-ygt` 需要新增一个可导航子应用，或者新增一个 silent provider 子应用。

### Step 1. 先确定 6 个基础字段

先确定下面 6 个值，再开始写代码：

1. `name`：必须和子应用 `package.json` 的 `name` 一致。
2. `defaultEntry`：子应用默认入口，例如 `/subapps/menzhen/`。
3. `activeRule`：主应用路由前缀，例如 `/menzhen`。
4. `title`：主应用里展示的中文名。
5. `mode`：普通页面型子应用用 `route`，静默 provider 用 `silent`。
6. `providerModulePath`：只有 `silent` provider 才需要；开发态通常是 `/src/provider/index.ts`，生产态通常是 `/provider/index.js`。

判断规则：

1. 能直接通过菜单打开的业务子应用，用 `route`。
2. 只给别的子应用提供能力、不直接出现在菜单里的 provider，用 `silent`。

### Step 2. 先补 JS 配置，再改主应用注册表

必须先补主应用子应用配置文件，不要只改注册表。

旧规则说明：主应用运行时配置已经统一迁移到 `config/apps/apps.prod.js` 和 `config/apps/apps.dev.js`。`VITE_SUB_*`、`VITE_API_BASE`、`VITE_STOMP_URL` 都不要再放回 `.env` 或 `.env.development`。

至少同步这两个文件：

1. `df-web-main-ygt/config/apps/apps.prod.js`：补生产环境入口，例如 `'df-web-master-data-ygt': '/subapps/master-data/'`
2. `df-web-main-ygt/config/apps/apps.dev.js`：补开发环境入口，例如 `'df-web-master-data-ygt': '//localhost:8103'`

这两个文件里除了默认导出的子应用入口表，还统一导出 `runtimeConfig`，用于主应用 API、Stomp 等运行时配置。例如：

```ts
export const runtimeConfig = {
  apiBase: 'http://localhost:9000',
  stompUrl: 'ws://localhost:9000/ws',
}
```

命名规则：

1. key 统一使用子应用 `package.json` 里的 `name`
2. `apps.prod.js` 写部署路径
3. `apps.dev.js` 写本地 dev server 地址
4. 新增主应用运行时配置时，也统一放进这两个文件的 `runtimeConfig`
5. 如果历史仓库里还保留 `.env`、`.env.development`，不要继续把它们当作新增配置来源

然后再修改主应用注册表：`df-web-main-ygt/src/micro/apps.ts`

只需要往 `microAppRegistry` 里追加一项，不要改 `setupMicro()`。

普通 `route` 子应用示例：

```ts
{
  name: 'df-web-lis',
  defaultEntry: resolveConfiguredDefaultEntry('df-web-lis'),
  activeRule: '/lis',
  container: '#micro-container',
  title: '检验',
  timeoutMs: 12_000,
  capabilityVersion: '2026.04',
  prefetch: 'minor',
}
```

`silent` provider 子应用示例：

```ts
{
  name: 'df-web-common-ygt-biz',
  defaultEntry: resolveConfiguredDefaultEntry('df-web-common-ygt-biz'),
  providerModulePath: import.meta.env.DEV ? '/src/provider/index.ts' : '/provider/index.js',
  activeRule: '/common-biz',
  container: '#micro-container',
  title: '共享业务',
  timeoutMs: 12_000,
  capabilityVersion: '2026.04',
  prefetch: 'critical',
  mode: 'silent',
}
```

AI 要知道的事实：

1. `microApps`、`routeMicroApps`、`silentMicroApps` 都是从这个注册表自动推导出来的。
2. 但注册表里引用的默认入口必须先在 `config/apps/apps.prod.js` 和 `config/apps/apps.dev.js` 中存在。
3. 主应用 API、Stomp 这类运行时配置也已经从 `.env` 迁到这两个 JS 文件的 `runtimeConfig`。
4. 如果 `config/apps/*.js` 漏了某个子应用 key，主应用会直接报错，不再静默回退到硬编码路径。
5. 所以新增普通子应用时，通常不需要改 `src/micro/register.ts`，但不能漏掉这两个 JS 配置文件。

### Step 3. 只补必要的菜单或 provider 约束

如果是 `route` 子应用：

1. 让后端菜单返回对应路径，或者在开发期先补 `df-web-main-ygt/src/store/useMenuStore.ts` 里的 `MOCK_MENUS`。
2. 菜单路径必须落在 `activeRule` 下，例如 `activeRule='/lis'`，菜单路径就应该是 `/lis/...`。

如果是 `silent` 子应用：

1. 不要加菜单。
2. 必须保证它导出的 provider 模块可被 shell 探测。
3. 当前 shell 的 silent 探测逻辑会检查 provider 模块是否导出 `commonBizProvider`，或者导出 `registerCommonBizComponents`。
4. 如果仓库内部真实实现函数名是 `registerCommonBizProvider`，也要同时导出一个 `registerCommonBizComponents` 别名给 shell 使用。

### Step 4. 做最小验收

新增后至少验证这 4 件事：

1. 主应用启动后，`microAppRegistry` 能看到新应用。
2. 如果是 `route` 子应用，访问 `activeRule` 能被 qiankun 正常挂载。
3. 如果是 `silent` 子应用，登录后会走 silent prefetch 和 provider 探测。
4. `config/apps/apps.prod.js` 和 `config/apps/apps.dev.js` 里都已经存在对应的子应用 key。
5. 如果这次改了主应用运行时配置，两个文件里的 `runtimeConfig` 也已经同步。
6. 不需要额外改 `setupMicro()` 也能正常工作。

### 主应用注意事项

1. `name` 不一致是最高频错误，必须和子应用 `package.json` 保持一致。
2. `activeRule` 必须唯一，不能和现有子应用重叠。
3. `silent` 子应用不要出现在菜单里。
4. 新增子应用时，不要只改 `src/micro/apps.ts`；`config/apps/apps.prod.js` 和 `config/apps/apps.dev.js` 也是必改文件。
5. `.env` 和 `.env.development` 不再作为主应用配置来源，不要重新创建 `VITE_SUB_*`、`VITE_API_BASE`、`VITE_STOMP_URL`。
6. 新增普通子应用时，不要手动改 `routeMicroApps` 或 `silentMicroApps`，它们是自动推导的。

## 2. common-biz 开发共享组件

适用场景：在 `df-web-common-ygt-biz` 里新增一个共享组件，让所有业务子应用都能通过 provider 统一消费。

### Step 1. 先建组件目录，不要先改总出口

先在 `df-web-common-ygt-biz/src/provider/components/` 下新增目录：

```text
src/provider/components/<componentKey>/
├── index.ts
├── types.ts
└── CommonBizXxx.ce.vue
```

命名规则：

1. 组件 key 用业务语义名，例如 `patientStatusCard`。
2. custom element tag 用 `common-biz-xxx`。
3. Vue 全局组件名用 `CommonBizXxx`。

AI 要知道：

1. 新增组件时，先建组件目录。
2. 不要第一步就去改 `public/provider/index.d.ts`。

### Step 2. 在组件目录里完成 3 个职责

在这个组件目录里只做 3 件事：

1. `types.ts`：定义 props、事件 detail 等公开类型。
2. `CommonBizXxx.ce.vue`：实现组件本体，输入通过 attribute 接收，事件通过 `CustomEvent` 抛出。
3. `index.ts`：导出组件 key、默认 tag、默认 globalName、元数据工厂、custom element 工厂。

`index.ts` 必须至少具备下面 5 类导出：

1. `XXX_COMPONENT_KEY`
2. `DEFAULT_XXX_TAG`
3. `DEFAULT_XXX_GLOBAL_NAME`
4. `createXxxComponentMeta()`
5. `createXxxCustomElement()`

### Step 3. 只在两个总入口接线

组件目录写完后，只需要在两个总入口补 wiring：

1. `src/provider/index.ts`
2. `src/provider/public-types.ts`

`src/provider/index.ts` 要做的事：

1. 导入新组件目录暴露的元数据工厂和 custom element 工厂。
2. 把组件加到 `COMPONENT_DEFINITIONS`。
3. 让 `commonBizProvider.components` 能产出这个组件。
4. 让 `registerCommonBizProvider()` 返回值里包含这个组件。

`src/provider/public-types.ts` 要做的事：

1. re-export 组件的 `types.ts`。
2. 只暴露纯 TS 类型和 provider API 签名。

正常情况下不要改的文件：

1. `public/provider/index.d.ts`：它应该只是转发到 `src/provider/public-types.ts`。
2. `src/provider/contract.ts`：只有新增公共基础类型或公共注册选项时才改。
3. `df-web-template-ygt/src/composables/useCommonBizProvider.ts`：已有批量注册能力时通常不需要改。

### Step 4. 补测试并做最小回归

至少补下面 4 类验证：

1. `commonBizProvider.components` 里有新组件。
2. `registerCommonBizProvider()` 返回的新组件 tag 正确。
3. 新 custom element 能渲染。
4. 组件交互事件能派发。

当前优先补的测试文件是：

1. `src/composables/__tests__/commonBizProvider.test.ts`

最小回归命令：

```bash
pnpm test
pnpm build
```

### common-biz 注意事项

1. 不要缓存 `defineCustomElement()` 返回的构造器再重复定义多个 tag。
2. 不要手写 `public/provider/index.d.ts` 的组件声明。
3. 只要 `provider.components` 和 `registerCommonBizProvider()` 已经暴露新组件，模板侧运行时通常不需要再加专门分支。
4. 如果只是新增一个普通共享组件，主应用 shell 通常也不需要改。

## 3. 子应用使用共享组件

适用场景：某个业务子应用页面要直接使用 `CommonBizXxx`，例如 `CommonBizEncounterCard`。

### Step 1. 先检查两个前置条件

使用前先确认：

1. 主应用已经注册了 `df-web-common-ygt-biz` 这个 silent provider。
2. common-biz 的 `commonBizProvider.components` 里已经有目标组件。

如果这两个前提不满足，不要直接改页面，先分别完成主应用注册或 common-biz 组件开发。

### Step 2. 在子应用入口只安装一次 provider

修改目标子应用的 `src/main.ts`。

正确做法：

1. 在 `app.mount()` 之前调用 `installCommonBizProvider(app, runtime)`。
2. `runtime` 通过 `createCommonBizProviderRuntimeContext()` 创建。
3. 在 `unmount` 时调用 `resetCommonBizProviderState()`。

标准写法：

```ts
await installCommonBizProvider(
  app,
  createCommonBizProviderRuntimeContext(
    isQiankun ? (props as SharedProps) : null,
  ),
)
```

AI 要知道：

1. 入口层安装一次就够了。
2. 不要在页面里动态 import provider 模块。
3. 不要手写 provider URL，统一走 shell 配置或 `VITE_COMMON_BIZ_ENTRY`。

### Step 3. 在页面里直接使用全局组件名

页面层只做 3 件事：

1. 准备传给组件的数据，通常是 `summaryJson`。
2. 直接写全局组件名，例如 `CommonBizPatientStatusCard`。
3. 监听 `common-biz-action` 事件。

示例：

```vue
<CommonBizPatientStatusCard
  :summary-json="summaryJson"
  source-app="df-web-template-ygt/detail"
  :service-entry="providerEntry"
  :provider-version="providerVersion || 'unknown'"
  @common-biz-action="handleProviderAction"
/>
```

如果只是想“用现成组件”，通常不需要改下面这些文件：

1. `df-web-main-ygt/src/micro/apps.ts`
2. `df-web-common-ygt-biz/src/provider/index.ts`
3. `df-web-template-ygt/src/composables/useCommonBizProvider.ts`

### Step 4. 做双模式验收

至少验证下面 4 件事：

1. qiankun 模式下组件能渲染。
2. 独立运行模式下也能渲染。
3. `common-biz-action` 事件能被页面收到。
4. provider 安装失败时，页面有降级或错误提示。

如果需要更强类型提示，再补 `global.d.ts`，但这不是运行时接入的前置条件。

### 子应用注意事项

1. 页面里不要直接 import common-biz 源码组件。
2. 页面里不要直接 import `/src/provider/index.ts` 或 `/provider/index.js`。
3. 组件名以 `provider.components[*].globalName` 为准，不要自己猜。
4. 如果模板子应用已经有 provider 安装逻辑，新增 common-biz 组件后通常只改页面，不改运行时桥接逻辑。

## 4. AI 最短验收清单

AI 完成任务前，至少回答自己下面 6 个问题：

1. 我这次到底是在做 A、B、还是 C。
2. 我有没有改到不该改的仓库。
3. 我有没有只改最少的关键文件。
4. 我有没有破坏现有自动推导逻辑。
5. 我有没有跑最小回归。
6. 我有没有把新增能力暴露到正确的总出口。

## 5. 详细文档入口

如果需要展开细节，再看下面两份长文档：

1. `docs/add-common-biz-component.md`
2. `docs/subapp-consume-common-biz.md`