# PLAN 26 — 修复行内公式多行源码时底部预览框遮挡问题

日期：2026-11-25

## 1. 需求与根因

- **痛点**：在实时预览（Live Preview）模式下编辑跨越多行（自动软换行或跨行）的行内公式 `$...$` / `\(...\)` 时，默认「在下方显示」的预览浮窗会直接覆盖在源码第 2 行及后续行上。
- **根因**：`src/editor/inlineMathPreview.ts` 中 `createPreviewTooltip()` 仅向 CM6 `showTooltip` 传入了 `pos: target.blockFrom` 与 `end: target.blockTo`，未实现 `TooltipView.getCoords`。CodeMirror 6 在布局时忽略 `tooltip.end`，仅使用 `view.coordsAtPos(tooltip.pos)`（即公式起始第 1 视觉行），导致 `"below"` 模式以首行底部为基准向下偏移 `4px`，从而挡住第 2 行源码。

---

## 2. 目标语义与方案

1. **包络坐标计算（`src/editor/inlineMathPreviewState.ts`）**：
   - 保持零 Obsidian/DOM 依赖，新增 `PreviewAnchorRect`、`isMultiLinePreviewSpan()` 与 `computeInlineMathPreviewAnchorRect()`；
   - 将公式起点 `startCoords` 与终点 `endCoords` 的纵向边界合并为 `[min(top), max(bottom)]`：`"below"` 模式使用末行 `bottom` 在源码最后一行下方弹出，`"above"` 模式使用首行 `top` 在第一行上方弹出，`strictSide: false` 边缘翻转时也能越过整个多行区间而不插进源码内部；
   - 横向 `left`：单行公式仍对齐 `startCoords.left`；多行公式且 `"below"` 模式对齐末行视觉行首 `lastLineStartCoords.left`；
   - 若仅首行或末行单侧位于 CM6 视口缓冲区外，仅在目标展示边可见时返回有效矩形，否则交由 CM6 隐藏。
2. **CM6 Tooltip 接入（`src/editor/inlineMathPreview.ts`）**：
   - 在 `createPreviewTooltip()` 返回的 `TooltipView` 实现 `getCoords`，测量 `view.coordsAtPos(target.blockFrom, 1)`、`view.coordsAtPos(target.blockTo, -1)`，在多行 `"below"` 场景下通过 `view.moveToLineBoundary(EditorSelection.cursor(target.blockTo, -1), false, true)` 获取末行视觉行首位置。
3. **版本流水号**：
   - 按规范将 `src/settings/settingAboutAndSpecial.ts` 的 `BUILD_TAG` 从 `"120"` 递增至 `"121"`。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_21~30/PLAN_26.md`：本计划文档。

### 修改
- `src/editor/inlineMathPreviewState.ts`：新增纯函数坐标包络合成逻辑。
- `src/editor/inlineMathPreview.ts`：为 `TooltipView` 实现 `getCoords`。
- `tests/editor/inlineMathPreviewState.test.ts`：补充单行、多行及单侧离屏边界单测。
- `src/settings/settingAboutAndSpecial.ts`：递增 `BUILD_TAG` 至 `"121"`。

---

## 4. 验证方式

- 运行 `npm run typecheck`、`npm test`、`npm run lint`、`npm run build` 全部通过，确认 `main.js` 未内联外部依赖；
- 将 `manifest.json`、`main.js`、`styles.css` 同步至 `C:\Users\Administrator\Desktop\TestObsidian\.obsidian\plugins\struct-latex` 供真实 Obsidian 实测多行软换行行内公式预览位置。

---

## 5. 回退方案

- 通过 Git 还原上述修改文件，删除 `PLAN/PLAN_21~30/PLAN_26.md` 并重新执行 `npm run build` 即可恢复。
