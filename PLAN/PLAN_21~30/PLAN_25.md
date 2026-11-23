# PLAN 25 — 社区自检告警清理与 1.0.2 发布准备

日期：2026-11-23

## 1. 需求与根因

- **需求**：在正式推进 `1.0.2` 发布至 Obsidian 社区前，对照 `community.obsidian.md` 自动扫描结果与本地 `npm run lint`，清理可安全消除的代码、样式、类型与 CI 产物溯源告警，并按规范递增内部版本号 `BUILD_TAG`。
- **根因**：
  1. `src/input/previewEvaluator.ts`、`src/input/triggerEngine.ts`、`src/input/validation.ts` 中存在 `Function` 未显式标注签名或 `Array.isArray` 窄化为 `any[]` 导致的 `@typescript-eslint/no-unsafe-*` 报错。
  2. `src/main.ts` 的 `detectObsidianLanguage()` 仍保留 `window.localStorage?.getItem("language")` 回退，触发 `obsidianmd/prefer-get-language` 警告。
  3. `src/editor/inlineMathPreview.ts`、`src/settings/ruleDragSort.ts`、`src/settings/settingRuleList.ts`、`src/settings/settingTriggerList.ts` 使用了原生 `createElement` / `createDocumentFragment`，触发 `obsidianmd/prefer-create-el` 警告。
  4. `src/settings/ruleInlinePanels.ts` 与 `src/settings/settingTriggerList.ts` 重复实现了带废弃 `execCommand("copy")` 回退的剪贴板复制逻辑。
  5. `styles.css` 存在多处 `!important` 与未知标签选择器 `mjx-container`，触发社区 CSS Lint 警告。
  6. `.github/workflows/release.yml` 尚未生成 GitHub Artifact Attestations 构建溯源证明。
  - **故意保留项**：用户自定义 JS 规则/触发器所需的 `new Function`（`PLAN_18` 已确认保留）与面向 Obsidian `1.4.0+` 复杂交互页面的 `PluginSettingTab#display()`（`getSettingDefinitions` 仅支持 `1.13.0+`）。

---

## 2. 目标语义与方案

1. **消除 TS `no-unsafe-*` 报错**：
   - `src/input/previewEvaluator.ts`：将 `new Function("ctx", rule.code)` 显式断言为 `JsRuleFn`；
   - `src/input/triggerEngine.ts`、`src/input/validation.ts`：数组遍历元素显式标注为 `unknown`。
2. **语言探测去 `localStorage`**：
   - `src/main.ts`：优先调用 Obsidian `getLanguage()`，旧版本直接回退至 `moment?.locale?.() || "en"`，移除 `window.localStorage?.getItem("language")`。
3. **统一使用 Obsidian DOM 构造辅助方法**：
   - `src/editor/inlineMathPreview.ts`：改用 `dom.createSpan(...)` 与 `createDiv(...)`；
   - `src/settings/ruleDragSort.ts`：改用 `listEl.createDiv(...)` 后插入占位节点；
   - `src/settings/settingRuleList.ts`、`src/settings/settingTriggerList.ts`：改用全局 `createFragment()` 与容器 `createDiv()`。
4. **移除废弃 `execCommand("copy")` 并消除重复逻辑**：
   - 在 `src/settings/ruleInlinePanels.ts` 抽离并导出 `copyTextareaContent()`（使用 `navigator.clipboard.writeText`，不可用时仅选中文本），由 `settingTriggerList.ts` 复用。
5. **消除 CSS `!important` 与 `mjx-container` 警告**：
   - `styles.css`：将 `mjx-container` 替换为 MathJax 稳定类名 `.MathJax`；通过提高选择器优先级消除全部 `!important`。
6. **补充构建产物溯源证明**：
   - `.github/workflows/release.yml`：增加 `id-token: write`、`attestations: write` 权限及 `actions/attest-build-provenance@v2` 步骤。
7. **内部版本号递增**：
   - `src/settings/settingAboutAndSpecial.ts`：`BUILD_TAG` 从 `"119"` 递增为 `"120"`（发布语义版本号保持 `1.0.2`）。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_21~30/PLAN_25.md`：本计划文档。

### 修改
- `.github/workflows/release.yml`
- `src/input/previewEvaluator.ts`、`src/input/triggerEngine.ts`、`src/input/validation.ts`
- `src/main.ts`
- `src/editor/inlineMathPreview.ts`
- `src/settings/ruleDragSort.ts`、`src/settings/ruleInlinePanels.ts`、`src/settings/settingRuleList.ts`、`src/settings/settingTriggerList.ts`、`src/settings/settingAboutAndSpecial.ts`
- `styles.css`

---

## 4. 验证方式

- 运行 `npm run typecheck`、`npm test`、`npm run build` 全部通过，确认 `main.js` 未内联外部依赖。
- 运行 `npm run lint`，确认 `@typescript-eslint/no-unsafe-*` 与 `@typescript-eslint/no-deprecated` 全部清零，仅余意图保留的 `new Function` 与 `getSettingDefinitions` 提示；扫描 `src/` 与 `styles.css` 确认无 `createElement`、`createDocumentFragment`、`localStorage`、`execCommand`、`!important`、`mjx-container`。
- 将 `manifest.json`、`main.js`、`styles.css` 同步至测试仓库 `C:\Users\Administrator\Desktop\TestObsidian` 供真机核验。

---

## 5. 回退方案

- 通过 Git 回退上述文件修改并重新执行 `npm run build` 即可恢复。
