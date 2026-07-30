# 04 - API 客户端与数据请求

## 当前主应用实现

主应用不再维护本地 `createRequest()` 封装，而是直接使用 `@df/utils/http` 提供的共享能力：

```ts
import { api, createCrud } from '@df/utils/http';
```

启动顺序固定为：

```ts
app.use(pinia);
setupSharedApi();
app.use(router);
```

`setupSharedApi()` 在 `src/api/request.ts` 中调用 `configureApi(...)`，把主应用的运行时上下文注入共享 HTTP 单例。

## configureApi 注入项

| 配置项 | 来源 | 说明 |
|--------|------|------|
| `baseURL` | `runtimeConfig.apiBase` | 当前主应用开发/生产都为 `''` |
| `clientId` | 固定值 | `client-web` |
| `apiVersion` | 固定值 | `v1` |
| `deviceType` | 固定值 | `pc` |
| `appVersion` | 固定值 | `1.0.0` |
| `getToken` | `src/auth/token.ts` | 自动注入 JWT |
| `getContext` | `useUserStore/useTenantStore` | 自动补齐 `tenantId/userId/userName` |
| `getTraceId` | `src/monitor/traceId.ts` | 复用主应用 TraceId |
| `onUnauthorized` | `src/api/request.ts` | 401 去重刷新与跳登录 |
| `onForbidden` | `src/api/request.ts` | 403 跳 `/403?from=...` |

## 地址策略

### 开发环境

- `config/apps/apps.dev.js` 中 `apiBase = ''`
- [vite.config.ts](../../frontend/df-web-ygt-main/vite.config.ts) 只代理 `/api`
- `/auth` 登录在开发态走 mock 身份，不依赖 Vite 代理

### 生产环境

- `config/apps/apps.prod.js` 中 `apiBase = ''`
- 由 Nginx / 网关同源转发以下前缀：
  - `/api`
  - `/auth`
  - `/monitor`
  - `/ws`
- WebSocket 默认根据当前页面域名动态生成 `ws(s)://<host>/ws`

这意味着后端地址变化时优先改网关，不改前端产物。

## 推荐调用方式

```ts
import { api, createCrud } from '@df/utils/http';

const menus = await api.get<BackendMenuNode[]>('/api/sys/caidan/tree');
const dicts = await api.get<Record<string, DictItem[]>>('/system/dicts/batch', {
  codes: 'gender,status',
});
const loginResult = await api.post<LoginResult>('/auth/login', params);
await api.put(`/todo/${id}/done`);

const patientCrud = createCrud<Patient>('/api/patient');
```

## 401 与刷新队列

主应用 `src/api/request.ts` 负责 401 去重：

```
请求 A → 401 → 触发 refresh（首个）
请求 B → 401 → 排队等待
请求 C → 401 → 排队等待
refresh 成功 → 队列释放
refresh 失败 → 清 token + 跳 /login?expired=1
```

刷新实现有一个关键约束：

```ts
await ofetch(`${API_BASE}/auth/token/refresh`, { method: 'POST', body: { refreshToken } })
```

必须走底层 `ofetch`，不能用 `api.post()`，否则 refresh 自身 401 会再次触发 `onUnauthorized`，形成递归。

## 403 处理

403 不再在业务代码里逐页判断，而是统一由 `onForbidden` 处理：

```ts
window.location.href = `/403?from=${encodeURIComponent(currentPath)}`;
```

## 与业务模块的配合

- 菜单：`useMenuStore.fetchMenus()` 调 `/api/sys/caidan/tree`，失败回退 `menuSnapshot.json`
- 字典：`useDictStore.fetchDicts()` 调 `/system/dicts/batch`
- 登录：`useAuth.login()` 调 `/auth/login`
- 健康检查：`HealthCheck.vue` 调 `/actuator/health`

## 已废弃做法

- 本地主应用 `createRequest()` 封装已删除
- `src/types/df-utils-http.d.ts` 已删除，直接使用 `@df/utils/http` 自带类型
