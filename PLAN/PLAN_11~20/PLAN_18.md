# PLAN 18 — Obsidian 官方 ESLint 规范合规修复

日期：2026-11-23

## 1. 需求与背景

- **需求**：在不改变插件既有 UI 与核心功能的前提下，修复 `eslint-plugin-obsidianmd` 预检发现的合规、移动端兼容性与类型洁癖问题，减少提交 Obsidian 官方插件库时的自动化拦截风险。
- **保留设计**：按用户确认，保留用户本地 JS 规则（`new Function`）与首次安装自动注册移动端工具栏（`mobileToolbarSync.ts`），并在提交审核时提供解释说明；`settingTab.ts` 的 `getSettingDefinitions()` 与 `execCommand("copy")` 兜底分支暂保留。

---

## 2. 目标语义与方案

1. **Manifest 描述合规（`manifest.json`）**：
   - 将 `"description"` 修改为 `"Structure-aware LaTeX editing."`，移除不允许出现的 `"Obsidian"` 一词。
2. **消除旧版 iOS 不兼容正则后行断言（`src/input/previewEvaluator.ts`）**：
   - 将 `/(?<!\\)\{\}/g` 替换为兼容 iOS < 16.4 的非后行断言匹配 `/(^|[^\\])((?:\\\\)*)\{\}/g` → `"$1$2{\\square}"`，等价补全未转义空花括号且正确跳过 `\\{}`。
3. **移除废弃构建依赖 `builtin-modules`**：
   - 在 `esbuild.config.mjs` 中改用 Node 内置 `import { builtinModules } from "module"`；从 `package.json` `devDependencies` 移除 `builtin-modules` 并更新 `package-lock.json`。
4. **静态内联样式改为 CSS 类（`styles.css` + 6 个设置页模块）**：
   - 复用已有 `.struct-latex-hidden` 类替代所有 `element.style.display = "none" | "block" | ""`（涉及 `ruleDragSort.ts`、`ruleEditorView.ts`、`ruleInlinePanels.ts`、`settingGeneralSection.ts`、`settingTriggerList.ts`、`triggerRowAndEditor.ts`）。
   - 在 `styles.css` 新增 `.struct-latex-flip-none` 与 `.struct-latex-flip-animate` 类替代 `ruleDragSort.ts` 中的 `style.transition` 赋值，并在拖拽结束/取消时统一清理类。
5. **跨窗口类型判定与多余断言清理**：
   - `ruleDragSort.ts` 中 `instanceof HTMLElement` 改为 Obsidian `Element#instanceOf(HTMLElement)`（`HTMLElement` 场景注意 `Element` 原型方法，先检查 `el instanceof Element` 或直接使用 `el.instanceOf(HTMLElement)`）。
   - 移除 `ruleRowRenderer.ts:105`、`triggerRowAndEditor.ts:125` 与 `tests/input/ruleEngine.test.ts:369` 的多余 `as ...` 类型断言。
6. **ESLint 配置对齐测试文件（`eslint.config.mjs`）**：
   - 对 `tests/**/*.ts` 关闭 `@typescript-eslint/no-floating-promises`（`node:test` 的 `describe`/`it` 返回 Promise），避免测试代码产生大量误报。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_18.md`：本计划文档。

### 修改
- `manifest.json`
- `package.json`、`package-lock.json`、`esbuild.config.mjs`、`eslint.config.mjs`
- `styles.css`
- `src/input/previewEvaluator.ts`
- `src/settings/ruleDragSort.ts`、`src/settings/ruleEditorView.ts`、`src/settings/ruleInlinePanels.ts`、`src/settings/ruleRowRenderer.ts`、`src/settings/settingGeneralSection.ts`、`src/settings/settingTriggerList.ts`、`src/settings/triggerRowAndEditor.ts`
- `tests/input/ruleEngine.test.ts`

---

## 4. 验证方式

- 运行 `npm run typecheck`、`npm test`、`npm run build` 全部通过。
- 运行 `npm run lint`，确认上述修复项全部清零（仅余用户确认保留的 `new Function` 及少量可选 warning）。

---

## 5. 回退方案

- 通过 Git 回退上述文件修改并重新执行 `npm install`、`npm run build`。
