# PLAN 30 — 设置界面交互与视觉架构全面重构（移动端 & PC 端）

日期：2026-11-28

## 1. 需求与根因

基于真机截图（`sources/125/`）与现网实现（`src/settings/*`、`styles.css`），当前设置界面在移动端与 PC 端存在四类核心体验问题：

1. **「打开」按钮独占一行**：首页与「光标跳转」二级页使用 `Setting.addButton("打开")`，移动端控制区折行并占满整行宽度，破坏列表阅读与点击直觉。
2. **规则管理区按钮过多、样式杂乱、层级不清**：顶部同时平铺 `+ 纯替换`、`+ 正则`、`+ JS`、导出、导入、大红重置/清空按钮，以及 3 个高饱和实心紫色筛选开关，视觉拥挤；且 `按键绑定` 在窄屏截断（`Backspac`），`移动端工具栏` 为全宽大按钮，缺乏统一信息层级。
3. **移动端返回手势直接退出插件设置，且存在双顶栏**：子页仅靠 DOM 显隐切换，未接入 Obsidian 原生导航栈（`HistoryHandler`），导致系统返回手势直接退回 Obsidian 设置总列表；同时页面内自绘返回栏与 Obsidian 原生顶部栏形成双顶栏。
4. **卡片分组与视觉统一性不足**：缺乏统一分组圆角卡片容器与轻量状态摘要。

---

## 2. 目标语义与方案

1. **整行可点击导航卡片（去除所有「打开」按钮）**：
   - 首页划分为「核心功能」与「通用与关于」两张圆角分组卡片，每行采用「左侧 Lucide 图标 + 标题/说明 + 右侧轻量实时摘要 + `>` 箭头」结构，整行任意位置点击可跳转；「语言」改为整行点击弹出带勾选态的原生 `Menu`。
   - 「光标跳转」二级页改为单张分组卡片，4 种模式展示方向图标、启用状态圆点与当前按键绑定徽标，整行点击进入详情。
2. **规则区操作层级重塑（双端统一）**：
   - 规则区头部改为单行左右布局：左侧「标题 + 计数徽标」，右侧仅保留 **`+ 新增`**（点击弹出原生 `Menu` 选择规则类型）与 **`⋮` 更多**（点击弹出原生 `Menu`：导出 JSON / 导入 JSON / 分隔线 / 标红的恢复默认或清空规则）。
   - 导出、导入、恢复默认/清空由原本挤压列表的内联面板改为独立简洁 `Modal`。
   - 搜索栏内嵌搜索图标与一键清除 `×` 按钮；类型筛选（`JS` / `正则` / `纯替换`/`纯匹配`）保留多选语义，视觉改为柔和细描边 + 浅底色胶囊。
3. **详情页控件紧凑化**：
   - 启用开关、按键绑定、移动端工具栏统一收进分组卡片；
   - 按键输入框自适应宽度避免窄屏截断，恢复默认改为紧凑 `rotate-ccw` 图标按钮；
   - 「移动端工具栏」由全宽按钮改为标准 Toggle 开关。
4. **双端分层导航栈与返回体验**：
   - **移动端（`Platform.isMobile`）**：子页（含分类页、跳转详情、规则编辑器）通过全屏 `SettingsSubPageModal extends Modal` 压栈呈现，单行 AppBar（`←` 返回按钮 + 标题），彻底消除双顶栏；利用 `Modal` 原生 `HistoryHandler` 支持系统侧滑返回逐级回退，关闭时同步刷新父页摘要。
   - **PC 端（`!Platform.isMobile`）**：保留设置右侧窗格内页内切换，顶部使用单行面包屑返回栏，并通过 `app.keymap.pushScope()` 注册 `Escape` 键逐级返回上一页。
5. **版本流水号递增**：`src/settings/settingAboutAndSpecial.ts` 的 `BUILD_TAG` 由 `"124"` 递增至 `"125"`。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_21~30/PLAN_30.md`：本计划文档。
- `src/settings/ruleFilter.ts`：纯 TS 规则过滤与草稿构造逻辑（零 Obsidian/DOM 依赖）。
- `src/settings/settingNavComponents.ts`：通用圆角分组卡片、整行可点击导航行、面包屑顶栏与原生 `Menu` 封装。
- `src/settings/settingPageModal.ts`：移动端全屏子页 `SettingsSubPageModal`（承载单行 AppBar 与返回栈）。
- `src/settings/ruleActionModals.ts`：导出 JSON、导入 JSON、恢复默认/清空确认 3 个独立 `Modal`。

### 修改
- `src/settings/settingTab.ts`：统一双端导航协调器（移动端 Modal 栈 / PC 端页内栈 + `Scope` Esc 返回）。
- `src/settings/settingGeneralSection.ts`：重构首页卡片、智能输入基础卡、按键绑定紧凑排版与移动端工具栏 Toggle 开关，删除旧 `renderAddRuleSetting` 与旧页头。
- `src/settings/settingJumpSection.ts`：重构光标跳转总览卡片与模式详情页渲染入口。
- `src/settings/settingToolbar.ts`：重构为「标题+计数、`+ 新增`、`⋮` 更多 + 搜索框（带清除）+ 柔和胶囊过滤」。
- `src/settings/settingTriggerList.ts`：接入新版规则区工具栏与独立操作 Modal，删除旧内联面板。
- `src/settings/ruleInlinePanels.ts`：删除被 `ruleActionModals.ts` 取代的内联导出/导入/重置代码，仅保留编辑器复用辅助函数。
- `src/settings/ruleEditorView.ts`、`src/settings/triggerRowAndEditor.ts`：支持 `hideHeader`（移动端由 Modal AppBar 统一承载）与分组卡片化。
- `src/settings/settingAboutAndSpecial.ts`：卡片化排版并递增 `BUILD_TAG` 至 `"125"`。
- `src/i18n/types.ts`、`src/i18n/zh.ts`、`src/i18n/en.ts`：更新并清理 i18n 文案键。
- `styles.css`：全面重构设置 UI 样式，删除已废弃旧面板与旧按钮样式。
- `tests/settings/toolbarAndI18n.test.ts`：更新过滤模块导入路径并补充新 i18n 键覆盖校验。

---

## 4. 验证方式

1. **自动化校验**：执行 `npm run typecheck`、`npm test`、`npm run build`、`npm run lint` 全绿，且 `main.js` 未内联外部依赖。
2. **PC 端真机验证**：同步 `manifest.json`、`main.js`、`styles.css` 至 `TestObsidian` 并在真实 Obsidian 桌面端测试全部导航、菜单、弹窗、`Esc` 返回及持久化行为，确认控制台零报错。
3. **移动端（Android）真机验证**：部署至手机端 Obsidian，验证整行点击、单行 AppBar（无双顶栏）、系统侧滑返回手势逐级回退、按键绑定不截断及移动端工具栏 Toggle 生效。

---

## 5. 回退方案

- 本次重构仅涉及 `src/settings/`、`src/i18n/`、`styles.css` 与对应测试，不修改 `data.json`/`rules.json`/`trigger.json` 数据格式与编辑器解析/输入/跳转/删除逻辑；出现问题时 `git revert` 提交并重新构建即可完整回退。
