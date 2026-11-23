# PLAN 22 — 特殊设置：行内公式实时渲染弹窗

日期：2026-11-23

## 1. 需求与根因

- **痛点**：在 Obsidian 实时预览（Live Preview）模式下编辑块级公式 `$$...$$` 时，原生界面会在块下方展示实时 MathJax 渲染预览；但编辑行内公式（`$...$` / `\(...\)`）时，Obsidian 仅切换为源码文本而无实时渲染预览，编写复杂分数、上下标或矩阵片段时不够直观。
- **目标**：在实时预览模式下编辑行内公式时，自动弹出一个纯展示浮层（Tooltip）实时渲染当前公式效果，并在「特殊设置」中提供「在下方显示（默认）」「在上方显示」「不显示」三项配置。

---

## 2. 目标语义与方案

1. **「特殊设置」选项（`inlineMathPreview`）**：
   - `PluginSettings` 新增 `inlineMathPreview: "above" | "below" | "off"`，默认值 `"below"`；
   - 在「设置 → 特殊设置」页面渲染下拉选项，切换后立即通过 `onSpecialSettingsChanged()` 派发 `refreshInlineMathPreviewEffect` 刷新所有 Markdown 编辑器视图。
2. **行内公式识别与触发边界（`src/editor/inlineMathPreviewState.ts`）**：
   - 仅在 **实时预览模式**（`editorLivePreviewField === true`）且 **编辑器获得焦点** 时激活；
   - 仅处理非只读、单光标且 **空选区**（有选中文本时隐藏）；
   - 复用 `findMathRegion(state, pos)`（已排除代码块与 YAML Frontmatter）：仅匹配 `!region.isBlock` 的行内公式且 `rawSource.trim().length > 0`（跳过 `$|$` 等空白公式）；
   - 将文档内可能存在的 Unicode 数学符号通过 `convertOutputDialect(..., "latex")` 规范化为标准 LaTeX 再送入 MathJax。
3. **CM6 Tooltip 浮层与共享 MathJax 渲染（`src/editor/mathJaxCache.ts`、`src/editor/inlineMathPreview.ts`）**：
   - 抽离 `loadMathJax()` / `renderMath()` / `finishRenderMath()` 及 LRU DOM 缓存至 `src/editor/mathJaxCache.ts`，由设置页与编辑器浮窗共同复用；
   - 使用 CM6 `showTooltip.compute` 以 `[region.blockFrom, region.blockTo]` 为锚点区间，避免光标在公式内移动时浮窗横向抖动；
   - `above` 由设置决定，`strictSide: false` 允许在视口顶部/底部空间不足时自动翻转；
   - 弹窗采用 `display: inline-flex; align-items: center; line-height: 1` 与相对单位 `padding: 0.14em 0.45em`（并对 `mjx-container > svg` 设为 `display: block`），消除块级行盒与基线对齐造成的顶部多余留白；通过 `--font-text-size` 与 `getComputedStyle(view.contentDOM).fontSize` 同步保证在任意 Obsidian 正文字号与缩放下 1:1 等大展示；
   - 浮窗设 `pointer-events: none` 保持鼠标穿透；未闭合或错误语法直接展示 `renderMath(tex, false)` 的原生 MathJax 输出（含 `.mjx-merror`），与 Obsidian 默认公式错误展示一致。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_21~30/PLAN_22.md`：本计划文档。
- `src/editor/mathJaxCache.ts`：共享 Obsidian MathJax 加载、同步/异步渲染与 LRU DOM 缓存工具。
- `src/editor/inlineMathPreviewState.ts`：纯解析状态判定函数（零 Obsidian/DOM 依赖，用于锚点、TeX 规范化与边界判定）。
- `src/editor/inlineMathPreview.ts`：CM6 `showTooltip` + 聚焦状态追踪扩展。
- `tests/editor/inlineMathPreviewState.test.ts`：行内公式预览判定与 Unicode 规范化自动化单测。

### 修改
- `src/input/types.ts`：`PluginSettings` 与 `DEFAULT_PLUGIN_SETTINGS` 新增 `inlineMathPreview: "below"`。
- `src/i18n/types.ts`、`src/i18n/zh.ts`、`src/i18n/en.ts`：新增「行内公式实时渲染弹窗」中英文文案。
- `src/settings/mathPreview.ts`：复用 `src/editor/mathJaxCache.ts`。
- `src/settings/settingAboutAndSpecial.ts`：在「特殊设置」页面新增位置选择下拉项。
- `src/main.ts`：加载/校验 `inlineMathPreview`、注册 `createInlineMathPreviewExtension` 并派发刷新 effect。
- `styles.css`：新增 `.cm-tooltip.struct-latex-inline-preview-tooltip` 浮窗样式。
- `tests/settings/toolbarAndI18n.test.ts`：补充 `inlineMathPreview` 默认值与中英文文案断言。
- `REQUIRMENT.md`：同步记录「特殊设置」中的「行内公式实时渲染弹窗」规格。

---

## 4. 验证方式

- 运行 `npm run typecheck`、`npm test`、`npm run lint`、`npm run build` 全部通过，确认 `main.js` 未内联外部依赖。
- 将 `manifest.json`、`main.js`、`styles.css` 同步至 `C:\Users\Administrator\Desktop\TestObsidian`，在真实 Obsidian 中验证：
  - Live Preview 下编辑 `$...$` / `\(...\)` 正常在下方/上方弹窗实时渲染；选区非空、失焦、空白 `$|$`、源码模式及 `$$...$$` 块级公式下不弹出；
  - 语法未闭合时直接展示 MathJax 错误输出，视口边缘空间不足时自动翻转；
  - 设置页三档切换实时生效，点击/输入/IME/`Ctrl+Z` 撤销栈无异常，控制台零报错。

---

## 5. 回退方案

- 删除 `src/editor/mathJaxCache.ts`、`src/editor/inlineMathPreviewState.ts`、`src/editor/inlineMathPreview.ts`、`tests/editor/inlineMathPreviewState.test.ts`，还原 `src/settings/mathPreview.ts`、`src/input/types.ts`、`src/i18n/*`、`src/settings/settingAboutAndSpecial.ts`、`src/main.ts`、`styles.css`、`REQUIRMENT.md` 中的关联改动即可恢复。
