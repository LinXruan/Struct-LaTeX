# PLAN 7 — 设置页三大类分页导航重构与删除/跳转自定义按键绑定

日期：2026-11-22

## 1. 需求与根因

### 1.1 需求
1. 优化插件设置页面交互逻辑与 UI，在设置页中新增一级三大类分层导航：**智能输入设置**、**结构删除设置**、**光标跳转设置**，并将已有配置项分别归类。
2. 在「结构删除设置」页签中，除「启用」开关外，新增自定义**按键绑定**按钮/输入框与恢复默认操作，并添加明确提示说明：**走的是按键输入劫持，会影响智能输入（含纯替换、正则与 JavaScript 规则）**。
3. 在「光标跳转设置」页签中，同第 2 项增加自定义**按键绑定**、恢复默认与按键输入劫持影响说明。

### 1.2 现状与技术根因
- `src/input/keybindUtils.ts`（`normalizeKeyCombo`、`keyboardEventToCombo`）与 `src/settings/ruleInlinePanels.ts`（`attachKeyRecorder`）已具备完整的键位规范化与交互式按键录制基础设施，但 `PluginSettings`（`src/input/types.ts`）尚未持久化删除/跳转快捷键字段，且 `src/editor/smartBackspace.ts` 与 `src/editor/smartJump.ts` 仍以 `keymap.of` 硬编码 `"Backspace"` 与 `"Tab"`。
- 在 CM6 事件管线中，`keydown` 劫持执行时机早于负责所有 `auto` 规则（纯替换、正则及全部 JavaScript 规则）的 `EditorView.inputHandler`，且同处 `Prec.highest(domEventHandlers({ keydown }))` 队列时先注册者优先。因此将结构删除/光标跳转重构为统一的 `keydown` 劫持并注册在 `smartInput` 之前，可在命中结构触发时优先拦截并阻断同键智能输入（含 JS），未命中结构条件时完整放行。

---

## 2. 目标语义与方案

1. **设置页全局区 + 三类分页导航（`settingTab.ts`、`settingGeneralSection.ts`、`styles.css`）**：
   - 顶部保留全局「语言」下拉设置，紧接三栏分页切换栏（`智能输入设置` | `结构删除设置` | `光标跳转设置`），切换仅重绘内容区 `tabContentEl`，语言切换时保持当前所在页签；在「智能输入设置」打开页内规则编辑子视图时隐藏主视图顶栏与分页栏，保存或返回后恢复原滚动位置与列表缓存。
   - 归类划分：
     - **智能输入设置**：启用智能输入、输出风格、新增输入规则、筛选/导入导出工具栏、内联面板、规则列表及页内规则编辑子视图。
     - **结构删除设置**：启用结构化整体删除、结构删除按键绑定（文本框 + 录制按键 + 恢复默认 `Backspace` + 非法格式校验提示）、按键输入劫持说明框。
     - **光标跳转设置**：启用智能光标跳转、光标跳转按键绑定（文本框 + 录制按键 + 恢复默认 `Tab` + 非法格式校验提示）、按键输入劫持说明框。
2. **纯键位匹配与持久化契约（`src/input/types.ts`、`src/input/keybindUtils.ts`）**：
   - `PluginSettings` 新增 `smartBackspaceKey`（默认 `"Backspace"`）与 `smartJumpKey`（默认 `"Tab"`），`loadSettings()` 对缺失或异常值做安全兜底归一化。
   - 在 `keybindUtils.ts` 新增纯函数 `resolveFeatureKeybind` 与 `matchesKeyEventCombo`。
3. **统一编辑器按键输入劫持层（`src/editor/keybindHijack.ts`、`smartBackspace.ts`、`smartJump.ts`、`main.ts`）**：
   - 抽离共享 `createKeybindHijackExtension`，通过 `Prec.highest(EditorView.domEventHandlers({ keydown }))` 与 getter 热读取最新开关和按键配置（无需 `updateOptions()`），保留 `readOnly`、`view.composing`、`event.isComposing` 守卫并兼容 Android 合成 `Backspace` 事件。
   - 在 `main.ts` 中按 `smartBackspace -> smartJump -> smartInput` 顺序注册：命中绑定键且满足结构条件时 `preventDefault()` + `stopPropagation()` 截断后续智能输入（含 JS）与原生按键；未命中结构条件（如正文区、选区非空、未命中删除白名单）返回 `false` 完整放行。
4. **参数化 UI 复用与双语覆盖（`src/i18n/`、`settingGeneralSection.ts`）**：
   - 结构删除与光标跳转页签共用同一 `renderKeybindFeaturePage(...)` 渲染器，录制器返回清理函数并在切页签/`display()`/`hide()` 时自动释放。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_7.md`：本计划文档。
- `src/editor/keybindHijack.ts`：共享 CM6 `keydown` 按键输入劫持扩展构建器。
- `src/settings/settingRuleList.ts`：智能输入规则列表渲染、缓存与行回调控制器。

### 修改
- `src/input/types.ts`：`PluginSettings` 与默认值新增 `smartBackspaceKey`、`smartJumpKey`。
- `src/input/keybindUtils.ts`：新增 `resolveFeatureKeybind`、`matchesKeyEventCombo`。
- `src/editor/smartBackspace.ts`、`src/editor/smartJump.ts`：改用可配置键位的 `createKeybindHijackExtension`，移除静态 `keymap` 硬编码。
- `src/main.ts`：加载/兜底键位配置，并按劫持优先级顺序注入三大扩展。
- `src/i18n/types.ts`、`src/i18n/zh.ts`、`src/i18n/en.ts`：新增三类页签、键位绑定与按键劫持说明中英文词条。
- `src/settings/settingGeneralSection.ts`、`src/settings/settingTab.ts`：落地三类分页导航与参数化删除/跳转设置页面。
- `styles.css`：新增三类分页选项卡、键位输入框、错误提示及劫持说明卡片样式。
- `tests/settings/toolbarAndI18n.test.ts`：新增默认键位、键位解析匹配及 i18n 词条对齐单测。
- `REQUIRMENT.md`：同步设置页三类分页结构、自定义按键绑定与劫持优先级说明。

---

## 4. 验证方式

1. `npm run typecheck`、`npm test`、`npm run build` 全通过，确认 `main.js` 未内联 `obsidian`、`@codemirror/*`、`@lezer/*`，且 `src/settings/*.ts` 与 `src/editor/*.ts` 均 ≤300 行。
2. 自动化单测覆盖：`DEFAULT_PLUGIN_SETTINGS` 默认值、`resolveFeatureKeybind` 与 `matchesKeyEventCombo`（大小写归一化、修饰键区分、`o` vs `Shift+O`、Mac `Mod` 映射、非法回退）、`zh`/`en` 字典全对齐。
3. 同步产物至 `C:\Users\Administrator\Desktop\TestObsidian` 并在真实 Obsidian（桌面端与手机端）实测：
   - 顶部语言切换保持当前页签，「智能输入 / 结构删除 / 光标跳转」三页签切换正常；
   - 默认 `Backspace` / `Tab` 与改键（如 `Alt+D`、`Shift+Tab`、`o`）、恢复默认热生效；
   - 绑同键时数学区结构命中优先拦截（影响纯替换/正则/JS 与确认键/快捷键），正文区及非结构位正常放行，关闭开关放行原生行为，控制台零报错。

---

## 5. 回退方案

- 删除 `PLAN/PLAN_7.md` 与 `src/editor/keybindHijack.ts`，并通过 `git checkout -- src/ styles.css tests/ REQUIRMENT.md` 还原改动后重新执行 `npm run build`，即可回退至 `PLAN 6` 状态。
