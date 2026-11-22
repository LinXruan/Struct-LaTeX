# PLAN 8 — 设置页首页导航重构、特殊设置预留与关于页面

日期：2026-11-22

## 1. 需求与根因

### 1.1 需求
1. 重构插件设置页一级入口交互：首页仅保留与「语言」风格一致的 6 条设置行，点击除「语言」外的 5 项均跳转到各自独立的页内二级子页面：
   - **语言**（首页行内下拉框）
   - **智能输入** → 跳转至智能输入子页面（启用开关、输出风格、新增规则、筛选工具栏、内联面板、规则列表及页内规则编辑子视图）
   - **结构删除** → 跳转至结构删除子页面（启用开关、按键绑定、劫持说明）
   - **光标跳转** → 跳转至光标跳转子页面（启用开关、按键绑定、劫持说明）
   - **特殊设置** → 跳转至特殊设置子页面（先预留接口与页面框架，供后续 PLAN 扩展）
   - **关于** → 跳转至关于子页面（展示 Logo、项目地址、作者、开源证书）
2. 沿用 `PLAN 6` 的零叠层 `Modal` 架构，全部子页面切换均在设置页容器内就地完成，确保桌面端与移动端无闪烁卡顿。

### 1.2 现状问题
- `PLAN 7` 采用的「顶部三栏页签切换」把智能输入的全部开关与规则列表直接铺在首页下方，未能形成清晰的「首页总览目录 → 点击进入独立子页面」分层导航，也缺少「特殊设置」预留入口与「关于」页面。

---

## 2. 目标语义与方案

1. **三层页内视图模型（`settingTab.ts`）**：
   - `activePage: SettingsPage` 取值 `"home" | "input" | "delete" | "jump" | "special" | "about"`（默认 `"home"`，语言切换时保留当前页状态）。
   - `homeViewEl`（6 行首页入口）、`subPageEl`（二级子页面容器，顶部统一提供「← 返回设置首页」按钮与页面标题）与 `editorViewEl`（三级页内规则编辑视图，顶部「← 返回规则列表」）互斥显隐；从「智能输入」子页面进入规则编辑时仅隐藏 `subPageEl` 以保留规则列表缓存与滚动位置。
2. **首页入口与通用区块（`settingGeneralSection.ts`）**：
   - 删除 `PLAN 7` 的 `renderCategoryTabs`；新增 `renderSettingsHomePage(parent, host, onOpenPage)`，按顺序渲染「语言」下拉项与「智能输入 / 结构删除 / 光标跳转 / 特殊设置 / 关于」5 个标准 `Setting` 跳转行。
   - 新增 `renderSubPageHeader(parent, title, onBack)` 统一生成二级页面返回栏。
3. **特殊设置预留与关于页面（`settingAboutAndSpecial.ts`）**：
   - `renderSpecialSettingsPage(parent, host)`：接收设置宿主接口作为预留扩展点，当前渲染结构化空态说明卡片。
   - `renderAboutPage(parent, manifest)`：内联渲染来自 `assets/logo-light.svg` / `assets/logo-dark.svg` 的矢量 Logo（自动随 Obsidian 深浅色主题切换配色），并用标准 `Setting` 行展示版本、`LinXruan` 作者、GitHub 项目地址外链与 `AGPL-3.0` 开源证书链接。
4. **双语与样式同步（`src/i18n/`、`styles.css`）**：
   - 用 `settings.nav.*`、`settings.special.*`、`settings.about.*` 替换原 `settings.tab.*` 词条，删除废弃的三栏页签样式并补充子页面返回头与关于页 Logo 卡片样式。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_8.md`：本计划文档。
- `src/settings/settingAboutAndSpecial.ts`：「特殊设置」预留接口页与「关于」页面渲染模块。

### 修改
- `src/settings/settingGeneralSection.ts`：删除 `renderCategoryTabs`，新增 `renderSettingsHomePage` 与 `renderSubPageHeader`。
- `src/settings/settingTab.ts`：重构为 `homeViewEl` / `subPageEl` / `editorViewEl` 分层跳转路由。
- `src/i18n/types.ts`、`src/i18n/zh.ts`、`src/i18n/en.ts`：替换 `settings.tab.*`，新增首页导航、特殊设置及关于页双语词条。
- `styles.css`：移除三栏页签样式，新增二级页头、强制清除页头 `h3` 默认外边距以确保与返回按钮垂直居中对齐，并补充特殊设置卡片与关于页矢量 Logo 样式。
- `tests/settings/toolbarAndI18n.test.ts`：同步更新 i18n 词条校验。
- `REQUIRMENT.md`：同步设置页首页分层结构说明。

---

## 4. 验证方式

1. `npm run typecheck`、`npm test`、`npm run build` 全通过，确认产物 `main.js` 未内联外部依赖，且 `src/settings/*.ts` 单文件 ≤300 行。
2. 搜索确认无 `renderCategoryTabs` / `settings.tab.` / `.struct-latex-category-tab` 残留。
3. 同步产物至 `C:\Users\Administrator\Desktop\TestObsidian` 并在真实 Obsidian（桌面端与手机端）实测：
   - 设置首页仅展示语言与 5 个跳转入口，语言切换正常；
   - 点击 5 个入口均平滑切入对应二级子页面，「← 返回设置首页」返回顺畅，手机端无卡闪；
   - 智能输入页内规则编辑往返、删除/跳转按键绑定、特殊设置说明与关于页深浅色 Logo/链接均正常，控制台零报错。

---

## 5. 回退方案

- 删除 `PLAN/PLAN_8.md` 与 `src/settings/settingAboutAndSpecial.ts`，并通过 `git checkout -- src/ styles.css tests/ REQUIRMENT.md` 恢复后重新执行 `npm run build`，即可回退至 `PLAN 7` 状态。
