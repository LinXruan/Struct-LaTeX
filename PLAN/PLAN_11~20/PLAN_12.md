# PLAN 12 — 光标跳转与结构删除的三类触发机制（键盘劫持 + 输入检测多规则 + 移动端工具栏）

日期：2026-11-22

## 1. 需求与根因

### 1.1 移动端按键劫持失效根因
- 在移动端软键盘（Android WebView / iOS WKWebView 虚拟输入法）下，点击字母键（如 `o`）触发的 `keydown` 事件中 `event.key` 多为 `"Unidentified"`（`keyCode === 229`）或处于 IME `composing` 合成态，且 `keydown.preventDefault()` 无法阻断系统 `InputConnection` 向编辑器提交字符，导致仅靠 `keydown` 无法在手机端从输入角度完全劫持 `o` 键。
- 同时，`normalizeMainKey` 将单字母统一规范化为大写 `"O"` 显示，虽代表未按 `Shift` 的 `o`，但在移动端无法拦截软键盘 `beforeinput` / `inputHandler` 文本流。

### 1.2 目标方案（三类触发机制）
将**光标跳转**与**结构删除**统一升级为三类互补的触发机制：
1. **第 1 类：键盘按键劫持（适用于 PC 端物理键盘）**
   - 保持 `Prec.highest` `keydown` 拦截（光标跳转默认 `Tab`，结构删除默认 `Backspace`）。
2. **第 2 类：输入检测触发规则（全端通用，支持多规则 + 纯匹配 / 正则 / JavaScript，独立存储于 `trigger.json`）**
   - 核心语义：**检测到输入 `xxx` ➔ 将 `xxx` 删除，并立即触发光标跳转（或结构化整体删除）**。
   - 基于 `EditorView.inputHandler` 实现，全部优先于智能输入（优先级：`光标跳转输入规则 ➔ 结构删除输入规则 ➔ 智能输入规则`）。
   - 复用智能输入的 `InputRuleContext` 与上下文守卫（`wordBoundary`、`excludeInTextMode`、`excludeInCommand`、`excludeInEnvName`），避免手打 `\cos`、`\log`、`\text{...}` 时误触发；当当前位置不满足跳转或结构删除条件时，完整放行原输入。
   - 默认规则列表为空，持久化于插件目录 `trigger.json`。
3. **第 3 类：移动端工具栏按键（Obsidian Mobile Toolbar）**
   - 注册「智能光标跳转」（`struct-latex:smart-jump`）与「结构化整体删除」（`struct-latex:smart-backspace`）全局编辑器命令（配内置 Lucide 图标）。
   - 通过 `PluginSettings.mobileToolbarInitialized` 初始化标记，在首次安装/启动时**默认只将「智能光标跳转」自动注入 Obsidian 移动端工具栏**（`.obsidian/app.json` → `mobileToolbarCommands` 并刷新 `app.mobileToolbar`），同时在设置页提供状态展示与一键添加/移除按钮。

---

## 2. 目标语义与方案

1. **输入检测触发模型与引擎（`src/input/triggerTypes.ts`、`src/input/triggerEngine.ts`）**：
   - `TriggerRule` 分为 `text`（仅需 `trigger`）、`regex`（`trigger` + `flags`）、`js`（`code`，接收 `ctx` 并返回 `number | { replaceLength: number; deleteAfter?: number } | null`），固定为数学区 `auto` 触发，默认启用 `excludeInTextMode`、`excludeInCommand`、`excludeInEnvName`。
   - `TriggerFileData` 结构为 `{ version: 1, jumpRules: TriggerRule[], deleteRules: TriggerRule[] }`。
2. **`trigger.json` 持久化与移动端工具栏同步（`src/settings/triggerStore.ts`、`src/settings/mobileToolbarSync.ts`）**：
   - `TriggerStore` 管理 `.obsidian/plugins/struct-latex/trigger.json` 的初始化、校验、编译、分类保存、导入导出与重置清空。
   - `mobileToolbarSync` 安全读写 `app.vault.getConfig("mobileToolbarCommands")` / `setConfig(...)` 并调用 `app.mobileToolbar?.update?.()`；首次启动（`!settings.mobileToolbarInitialized`）在 `workspace.onLayoutReady` 时自动挂载 `struct-latex:smart-jump` 并持久化标记。
3. **编辑器单步原子执行（`src/editor/smartJump.ts`、`src/editor/smartBackspace.ts`、`src/main.ts`）**：
   - 单字符触发（如 `"o"`，`docDeleteBefore === 0`）：在 `inputHandler` 中于字符写入文档前直接校验并派发跳转/整删事务，返回 `true` 阻断字符上屏；
   - 多字符触发（如 `"oo"`，`docDeleteBefore > 0`）：先从数学块源码剥离已上屏触发前缀构建干净 `MathTree`，在剥离后的光标位置求值跳转目标或结构删除跨度，并在**单步原子事务**（`isolateHistory.of("full")`）中同时删除触发前缀与执行结构跳转/整删；若当前位置不满足跳转/整删条件则返回 `false` 原样放行。
4. **设置页三类触发分区（`src/settings/triggerRowAndEditor.ts`、`src/settings/settingTriggerList.ts`、`src/settings/settingGeneralSection.ts`、`src/settings/settingTab.ts`）**：
   - 在「光标跳转」与「结构删除」二级子页面中去除冗余分组标题、「第 1/2/3 类」开发术语、标题括号与说明框，统一使用同级标准 `Setting` 卡片依次呈现：总开关、按键绑定、移动端工具栏、输入触发规则管理列表及页内规则编辑子视图，并对全插件设置文案做去重精简。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_12.md`：本计划文档。
- `src/input/triggerTypes.ts`：`trigger.json` 与输入检测触发规则类型定义。
- `src/input/triggerEngine.ts`：输入检测触发规则校验、编译、求值与试跑预览引擎。
- `src/settings/triggerStore.ts`：`trigger.json` 持久化存储管理器。
- `src/settings/mobileToolbarSync.ts`：Obsidian 移动端工具栏配置读写与刷新辅助模块。
- `src/settings/triggerRowAndEditor.ts`：输入检测触发规则行渲染与页内编辑视图。
- `src/settings/settingTriggerList.ts`：设置页第 2 类触发规则列表控制器与工具栏面板集成。
- `tests/input/triggerEngine.test.ts`：触发规则校验、求值、前缀剥离跳转/删除、`TriggerStore` 与移动端工具栏初始化单测。

### 修改
- `src/input/types.ts`：`PluginSettings` 新增 `mobileToolbarInitialized: boolean`（默认 `false`）。
- `src/editor/smartJump.ts`：导出 `executeSmartJump`，新增第 2 类 `inputHandler` 触发与前缀剥离原子跳转。
- `src/editor/smartBackspace.ts`：导出 `executeSmartBackspace`，新增第 2 类 `inputHandler` 触发与前缀剥离原子整删。
- `src/main.ts`：接入 `TriggerStore`、注册全局命令、首次自动挂载 `struct-latex:smart-jump` 到移动端工具栏并按优先级注册扩展。
- `src/settings/settingGeneralSection.ts`、`src/settings/settingTab.ts`：集成三类触发设置界面与页内触发规则编辑器路由。
- `src/i18n/types.ts`、`src/i18n/zh.ts`、`src/i18n/en.ts`：新增三类触发、移动端工具栏及 `trigger.json` 相关双语词条。
- `REQUIRMENT.md`：同步记录光标跳转与结构删除的三类触发机制、`trigger.json` 与移动端工具栏集成规格。

---

## 4. 验证方式

1. 运行 `npm run typecheck`、`npm test`、`npm run build`，确保类型检查、全部自动化单测与生产打包通过，产物 `main.js` 未内联外部依赖，所有 `src/` 文件 ≤ 300 行。
2. 将 `manifest.json`、`main.js`、`styles.css` 同步至测试仓库 `C:\Users\Administrator\Desktop\TestObsidian\.obsidian\plugins/struct-latex/`，供真机验证 `trigger.json` 生成、移动端工具栏自动添加及三类触发行为。

---

## 5. 回退方案

- 删除 `PLAN/PLAN_12.md`、`src/input/triggerTypes.ts`、`src/input/triggerEngine.ts`、`src/settings/triggerStore.ts`、`src/settings/mobileToolbarSync.ts`、`src/settings/triggerRowAndEditor.ts`、`src/settings/settingTriggerList.ts`、`tests/input/triggerEngine.test.ts`，并通过 `git checkout -- src/ REQUIRMENT.md` 恢复被修改文件后重新执行 `npm run build` 即可无损回退至 `PLAN 11` 状态。
