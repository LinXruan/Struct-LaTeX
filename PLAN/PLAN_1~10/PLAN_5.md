# PLAN 5 — 设置面板交互优化、渲染性能调优与中英双语支持

日期：2026-11-22

## 1. 需求与根因

- **需求**：
  1. 在工具栏「恢复默认规则」右侧新增「JS」「正则」「纯替换」三个可同时点亮的类型筛选按钮，与第一行类型下拉框形成复合筛选；按钮全灭时显示 0 条规则。
  2. 排查并解决规则列表右侧 MathJax 示例渲染与滚动/搜索时的性能卡顿。
  3. 改进规则左侧拖拽排序交互：拖出时显示半透明整行规则块，指针移至两行之间时上下行让位展开可插入空位，提升排序准确性与手感。
  4. 为「纯替换」规则行补齐「纯替换」与「Auto」（或对应触发方式）双标签，与正则/JS 规则保持统一视觉规范。
  5. 在设置页新增「语言」配置项（默认跟随 Obsidian 界面语言），提供完整英文翻译版（覆盖设置 UI、弹窗、徽章、校验与运行通知），同时保持 `rules.json` 输入规则数据不变。
- **根因**：
  1. `mathPreview.ts` 的 `IntersectionObserver` 在首屏及快速滚动时对大量规则同帧同步调用 `renderMath()` 与 `finishRenderMath()`，缺乏未渲染项出视口取消、分帧调度与 `<mjx-container>` 结果缓存；`settingTab.ts` 的 `renderRuleList()` 每次均 `empty()` 销毁全部行 DOM，搜索无防抖；`previewEvaluator.ts` 对 `latex` 方言重复执行两次 `tokenizeMath`。
  2. `ruleRowRenderer.ts` 使用原生 HTML5 Drag & Drop 绑在 `18px` 手柄上，拖拽虚影仅为小图标、无上下让位插槽，且 `splice` 未区分前后插槽易出现差 1 格偏移。
  3. 纯替换规则行渲染遗漏 `.is-type-text` 类型徽章；工程尚无 i18n 词典与 Obsidian 语言读取适配层。

---

## 2. 目标语义与方案

1. **复合筛选（`settingToolbar.ts`）**：`FilterState` 新增 `enabledTypes: Set<RuleType>`（默认全亮），与 `groupFilter`、`typeFilter` 及 `120ms` 防抖 `searchQuery` 共同过滤；`enabledTypes.size === 0` 时直接返回 `[]`。
2. **渲染性能调优（`mathPreview.ts`、`previewEvaluator.ts`、`settingTab.ts`）**：
   - `previewEvaluator.ts` 消除 `dialect === "latex"` 时的重复分词调用；
   - `LazyMathPreviewManager` 新增基于 `preview.tex` 的渲染节点缓存（命中直接 `cloneNode(true)`）、出视口移出待办队列与 `requestAnimationFrame` 时间分片调度（单帧 ≤6ms / 最多 4 项），并合并调用 `finishRenderMath()`；
   - `settingTab.ts` 按规则签名缓存并复用行 DOM 节点，筛选与排序仅重排节点顺序。
3. **Pointer Events 平滑拖拽排序（`ruleDragSort.ts` & `styles.css`）**：在拖拽手柄响应 `pointerdown` 后创建半透明整行克隆浮层，列表内以等高 `.struct-latex-drop-placeholder` 随指针跨行中线动态换位并伴随平滑位移过渡，靠近边界自动滚动，松手按精确 `beforeId` / `afterId` 更新全量规则序列。
4. **纯替换双标签（`ruleRowRenderer.ts`）**：在触发方式徽章前插入 `.struct-latex-badge.is-type-text`（`纯替换` / `Text`）。
5. **纯 TS 中英双语系统（`src/i18n/` + `PluginSettings.language`）**：
   - `src/i18n/` 保持零 Obsidian/DOM 依赖，供 `src/input/`、`src/settings/` 与 `src/main.ts` 统一使用；
   - `main.ts` 启动时优先读取 Obsidian `getLanguage()`（兼容旧版回退 `moment.locale()` / `localStorage`），解析 `auto` → `"zh" | "en"`，切换设置立即刷新设置页；输入规则定义保持不变。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_5.md`：本计划文档。
- `src/i18n/types.ts`、`src/i18n/zh.ts`、`src/i18n/en.ts`、`src/i18n/index.ts`：纯 TS 中英双语词典与运行时切换接口。
- `src/settings/ruleDragSort.ts`：基于 Pointer Events 的整行半透明浮层与让位占位排序模块。
- `tests/settings/toolbarAndI18n.test.ts`：复合筛选、i18n 字典完整性、语言解析与预览校验自动化单测。

### 修改
- `src/input/types.ts`、`src/input/validation.ts`、`src/input/previewEvaluator.ts`、`src/input/keybindUtils.ts`：新增 `language` 设置字段、去除预览重复分词、接入 `i18n`。
- `src/settings/mathPreview.ts`、`src/settings/settingToolbar.ts`、`src/settings/ruleRowRenderer.ts`、`src/settings/settingTab.ts`、`src/settings/ruleEditModal.ts`、`src/settings/ruleModalFields.ts`、`src/settings/ruleModals.ts`、`src/settings/ruleStore.ts`：性能优化、复合筛选、纯替换双标签、新拖拽排序与全量双语化。
- `src/main.ts`：初始化 Obsidian 语言检测与双语错误通知。
- `styles.css`：新增激活筛选按钮、纯替换类型标签及拖拽浮层/插槽占位样式，删除旧 HTML5 拖拽样式。
- `REQUIRMENT.md`：同步设置面板交互与双语能力说明。

---

## 4. 验证方式

1. `npm run typecheck`、`npm test`、`npm run build` 全通过，确认 `main.js` 未内联外部依赖。
2. 自动化单测覆盖：复合筛选组合及三钮全灭返回 0 条、中英文翻译键全对齐、Obsidian 语言映射回退、预览求值与校验错误双语输出。
3. 在 `C:\Users\Administrator\Desktop\TestObsidian` 真实 Obsidian 中实测：筛选联动、快速滚动与搜索流畅度、拖拽半透明块与上下让位手感、纯替换双标签、语言自动检测及中英文实时切换，控制台零报错。

---

## 5. 回退方案

- 删除 `PLAN/PLAN_5.md`、`src/i18n/`、`src/settings/ruleDragSort.ts`、`tests/settings/toolbarAndI18n.test.ts`，并通过 `git checkout -- src/ tests/ styles.css REQUIRMENT.md` 回退修改文件后执行 `npm run build` 即可恢复至 `PLAN 4` 状态。
