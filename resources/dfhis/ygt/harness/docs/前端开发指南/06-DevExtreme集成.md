# 06 - DevExtreme 集成

## 概览

项目使用 DevExtreme 25.2.6 作为数据表格与交互基础组件库；页面级按钮统一优先使用 `@df/ui` 的 `DfButton`，数据网格/树表内部的轻量操作再按需使用 `devextreme-vue/button`。

## 许可证处理

`vite.config.ts` 实现了双重许可证屏蔽：

```ts
// Vite 插件 — 拦截 trial_panel / license_validation 模块
dxLicenseStub()

// esbuild 插件 — 预构建时同样拦截
dxLicenseEsbuildPlugin()
```

主应用和 `df-web-common-ygt-biz` 都有相同的许可证屏蔽机制。

## DX 源码定制（common-biz 特殊机制）

`df-web-common-ygt-biz` 使用了定制版 DevExtreme：

1. `@df/devextreme-26_1` 是自定义 scoped 包，包含 DX 26.1 源码
2. `postinstall` 脚本 `scripts/copy-dx-source.mjs` 将源码拷贝到 `.dx-source/`
3. 3 个自定义 Vite 插件：
   - `dxSourceTransform()` — 移除 `/// #DEBUG` 块 + 注入 Inferno JSX
   - `dxResolver()` — 将 `devextreme/*` 重定向到 `.dx-source/`
   - `dxLicenseStub()` — 许可证屏蔽

普通子应用使用标准 DevExtreme 25.2.6（npm 版本），不需要此机制。

## 国际化

仅独立模式加载：

```ts
if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
  require('devextreme/localization').loadMessages(require('devextreme/localization/messages/zh.json'));
  require('devextreme/localization').locale('zh');
  loadStandaloneStyleLink('dx-standalone-theme', getStandaloneDxThemeHref());
}
```

默认主题统一使用 `dx.fluent.blue.light.compact.css`。qiankun 模式下由主应用统一加载主题 CSS，子应用生产构建不得通过 `import 'devextreme-dist/css/*'` 打入自己的 CSS，否则会在 qiankun 加载时插入到主应用主题之后，覆盖当前主题。

## DxTable 使用

`DxTable` 已通过 `src/plugins/df-ui.ts` 全局注册，无需 import。

### Props 速查

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `filterBar` | `boolean` | `false` | 过滤栏 |
| `groupMenu` | `boolean` | `false` | 分组菜单 |
| `columnSettings` | `boolean` | `false` | 表头设置面板 |
| `searchPanel` | `boolean` | `false` | 搜索面板 |
| `headerFilter` | `boolean` | `false` | 列头筛选 |
| `columnReordering` | `boolean` | `false` | 列重排 |
| `columnFixing` | `boolean` | `false` | 列固定 |
| `multiSorting` | `boolean` | `false` | 多列排序 |
| `rowIndex` | `boolean` | `false` | 行号 |
| `focusedRowEnabled` | `boolean` | `false` | 焦点行 |
| `selection` | `'none'\|'single'\|'multiple'` | `'none'` | 选择模式 |
| `stateStoringKey` | `string` | - | IndexedDB 持久化 key |
| `batchActions` | `Array<{key, label, icon}>` | - | 批量操作按钮 |
| `totalSummary` | `Array<{column, summaryType, ...}>` | - | 汇总行 |

### 列定义

```ts
const columns = [
  { dataField: 'name', caption: '姓名', fixed: true },
  { dataField: 'salary', caption: '薪资', dataType: 'number', format: 'currency', alignment: 'right' },
  { dataField: 'hireDate', caption: '入职日期', dataType: 'date' },
];
```

### 汇总

```ts
const totalSummary = [
  { column: 'name', summaryType: 'count', displayFormat: '共 {0} 人' },
  { column: 'salary', summaryType: 'avg', valueFormat: 'currency', displayFormat: '平均: {0}' },
];
```

### 状态持久化

通过 `state-storing-key` 启用 IndexedDB 持久化，用户的列顺序、筛选、排序等状态会被保存。

## TreeList 与按钮选型约定

### 页面按钮优先 `DfButton`

当前主应用的标准做法：

- 页面工具栏、空态按钮、错误页按钮：优先 `DfButton`
- 只有在 DX 组件单元格模板里需要极轻量嵌入按钮时，才使用 `DxButton`

这样可以统一埋点、权限语义和 `finalCode` 注册。

### TreeList 滚动约定

若页面使用 `DxTreeList`，优先让容器高度通过 CSS 控制，并保持 DX 默认滚动行为：

```css
.page__tree {
  max-height: calc(100vh - 220px);
}
```

避免在没有明确需求时强行加：

```vue
<DxScrolling :use-native="false" />
```

这类配置会启用 DX 的模拟滚动，容易导致滚动条可见但交互异常。当前 `ButtonCodesAdmin` 已回到“CSS 控高 + 默认滚动”的约定。

## 主题系统

### 主应用主题管理

主应用 `useThemeStore` 管理 22 套 DX 主题：

默认主题为 `fluent.blue.light.compact`，对应 CSS 文件 `dx.fluent.blue.light.compact.css`。

| 系列 | 主题 |
|------|------|
| Generic | `dx.light`, `dx.dark`, `dx.contrast` 等 |
| Fluent | `dx.fluent.blue.light`, `dx.fluent.blue.dark` 等 |
| Material | `dx.material.blue.light`, `dx.material.blue.dark` 等 |

主题切换通过动态替换 `<link>` 标签实现（`src/shared/dxTheme.ts`）：
- 开发：从 `node_modules/devextreme-dist/css/` 加载
- 生产：从 `/dx-themes/` 加载（`vite.config.ts` 的 `dxThemeCopy()` 插件在构建时拷贝）

### 子应用主题跟随

```ts
const { isDark, dxTheme } = useTheme();
```

子应用在 qiankun 模式下不加载 DevExtreme 主题 CSS，只读取主应用传入的 `store.theme.dxTheme` 和 `document.documentElement[data-density]`。独立运行时才通过运行时 `<link>` 加载默认主题：开发走 `/node_modules/devextreme-dist/css/dx.fluent.blue.light.compact.css`，生产走 `/dx-themes/dx.fluent.blue.light.compact.css`，保持与主应用默认视觉一致。

发布前可用以下方式检查是否误把旧主题打进子应用产物：如果子应用 `dist/assets/*.css` 中出现 `.dx-switch{width:44px;height:24px}` 或 `dx.light.css` 的整套规则，说明仍有静态 CSS import，需要改为运行时 link 或移除。

### 密度

主应用支持 3 种密度：
- `comfortable` — 宽松
- `compact` — 紧凑（视口 <= 1366x820 自动触发）
- `auto` — 跟随视口

子应用通过 `document.documentElement.getAttribute('data-density')` 获取。

## 弹窗容器隔离

**强制规则**：业务代码不再直接使用 `devextreme-vue/popup` 的 `DxPopup`，统一使用 `@df/ui` 的 `DfPopup`。

本次修复的背景是：子应用在 qiankun 主应用中运行时，DevExtreme overlay 可能首次挂载到错误容器、隐藏子应用 DOM 或 `document.body`，导致按钮状态已变更但弹窗不可见；发布环境还可能出现弹窗外壳可见但内部 `DxSelectBox`、`DxTextBox` 等 editor 没有进入 popup content 渲染树的问题。`@df/ui@0.5.5` 的 `DfPopup` 已统一处理首次容器解析、微前端根节点回退、层级和内容插槽转发，后续页面不要再各自补丁式处理 `DxPopup`。

主应用或子应用页面统一写法：

```vue
<script setup lang="ts">
import { DfPopup } from '@df/ui';
</script>

<template>
  <DfPopup
    :visible="editorVisible"
    title="编辑"
    :width="720"
    height="auto"
    max-height="86vh"
    @hiding="closeEditor"
  >
    <template #content>
      <EditorForm />
    </template>
  </DfPopup>
</template>
```

使用注意事项：

1. 新代码禁止新增 `<DxPopup>`、`</DxPopup>` 或 `import DxPopup from 'devextreme-vue/popup'`。
2. `DfPopup` 透传 `title`、`width`、`height`、`max-height`、`show-close-button`、`hide-on-outside-click`、`drag-enabled`、`@hiding` 等常用 `DxPopup` 配置。
3. 弹窗正文统一写在 `#content` 插槽内；纯正文默认插槽虽有兼容兜底，但新代码必须显式写 `#content`，避免发布环境下 DevExtreme editor 渲染不完整。
4. 主应用 `App.vue` 中如需 `DxToolbarItem`，只保留 `import { DxToolbarItem } from 'devextreme-vue/popup'`，不要因此恢复 `DxPopup`。
5. `src/micro/dxManifest.ts` 仍需要保留 `devextreme-vue/popup` 共享声明，供 `DfPopup` 内部和 `DxToolbarItem` 等嵌套配置使用。
6. 子应用如已有 `usePopupContainer()`，可以继续显式传 `:container="popupContainer"`；未传时 `DfPopup` 会从组件锚点自动寻找当前微前端根节点并回退到 `[data-v-app]` / `body`。
7. `DxDropDownBox`、`DxSelectBox` 下拉层等非弹窗 overlay 仍按原规则传入 `container`，本次只替换 `DxPopup`。
8. 测试中不要再 mock `devextreme-vue/popup` 的 `DxPopup`；涉及页面弹窗时 mock `@df/ui` 的 `DfPopup` 即可。
9. 使用 `DfPopup` 的项目依赖版本必须不低于 `@df/ui@0.5.5`；有可提交 `pnpm-lock.yaml` 的项目必须同步 lockfile。

最小测试 mock 示例：

```ts
vi.mock('@df/ui', () => ({
  DfPopup: {
    name: 'DfPopup',
    props: ['visible', 'title'],
    emits: ['hiding'],
    template: '<section v-if="visible"><h2>{{ title }}</h2><slot /><slot name="content" /></section>',
  },
}));
```

原因：DX 弹窗默认挂载到 `document.body`，会绕过 qiankun 的 `experimentalStyleIsolation` 样式沙箱；直接用 `DxPopup` 还可能与主应用保留的隐藏子应用容器互相影响。统一入口可以避免各页面重复维护 overlay 容器和层级规则。

### 线上复盘：弹窗外壳可见但 editor 不渲染

2026-05-05 主索引脱敏规则页在发布环境复现过：主应用下点击“新增规则”后，`DfPopup` 外壳、标题、label、底部按钮均可见，但内部 `DxSelectBox`、`DxTextBox` 等 DevExtreme editor 不渲染；同一子应用独立打开正常。

最终根因不在业务弹窗内容，也不是继续封装所有 DevExtreme editor，而是主应用生产共享库的导出形态不兼容：子应用生产构建将 `devextreme-vue/*` external 到 `window.__SHARED_LIBS__[id]`，默认导入期望拿到 Vue 组件本体，但主应用 `dxManifest` 注入的是 namespace module object。该对象上有 `default` 和 `DxSelectBox` 等 named export，根对象本身没有 `props`、`emits` 等组件字段，导致默认导入场景下 Vue 无法按组件渲染。

主应用已在 `src/main.ts` 对 `dxManifest` 做运行时规范化：仅处理 `devextreme-vue/*`，把 `default` 组件本体的字段提升到共享对象根部，同时保留 `default` 和 named exports。这样可以同时兼容以下两类写法：

```ts
import DxSelectBox from 'devextreme-vue/select-box';
import { DxSelectBox } from 'devextreme-vue/select-box';
```

后续处理同类问题时按以下顺序排查：

1. 先确认线上主应用资源已更新，而不只发布子应用；本问题修复点在主应用 `__SHARED_LIBS__` 初始化。
2. 在浏览器控制台检查 `window.__SHARED_LIBS__['devextreme-vue/select-box']`，根对象应具备 `props` 等组件字段，同时保留 `default` 和 `DxSelectBox`。
3. 点击弹窗按钮后检查 DOM：`.dx-popup` 应存在，`.dx-texteditor` 或 `.dx-dropdowneditor` 数量应大于 0。
4. 如果子应用独立打开正常、主应用下异常，优先检查 shared libs、external globals、overlay container，不要先在业务页重复封装 editor。
