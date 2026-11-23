# PLAN 9 — 部分双竖线（`|` 与 `∥`）同层奇偶解析与源码标红支持

日期：2026-11-22

## 1. 需求与根因

### 1.1 需求
1. 在设置页「特殊设置」预留页面中新增全局开关：**部分双竖线解析（`|` 与 `∥`）**（默认开启）。
2. **同层级偶数个 `|` / `∥`**：严格按顺序两两相邻配对为同级对象，绝不发生嵌套（例如 `(|a|+|b|+|c|)` 恒解析为 `(...)` 内的三个同级对象 `|a|`、`|b|`、`|c|`）。
3. **同层级奇数个 `|` / `∥`**：同层内全部该类竖线均不做括号解析（降级为普通 `AtomObject`），并在编辑器可见 LaTeX 源码中将其颜色标红。
4. **全局生效**：开启/关闭后同步影响结构删除、光标跳转、智能输入 JS 上下文、规则沙盒试跑，并实时刷新已打开编辑器的缓存与标红装饰。

### 1.2 现状与架构分析
- 当前 `tokenizer.ts` 仅将 `\|` 与 `∥` 归为 `sym_delim`，将 `|` 归为普通 `atom`。
- 直接复用单栈 `sym_delim` 无法满足需求：奇数场景（如 `(|a|+|b)` 中 3 个 `|`）会导致前两个被误配对而仅丢弃最后一个；同时需要精确跳过 `\text{...}` 文本槽与 `\begin{array}{c|c}` 等环境头参数，并在弱括号（`(...)`、`[...]`、`⟨...⟩` 等）内独立判定奇偶。
- 因此采用**两阶段匹配**（Pass 1 先匹配非 `|`/`∥` 的全部常规括号与强作用域；Pass 2 沿已闭合层级递归扫描并对 `|` 与 `∥` 各自按奇偶配对/标红收集）。

---

## 2. 目标语义与方案

1. **纯解析层两阶段匹配（`src/parser/`）**：
   - `types.ts`：新增 `TextSpan`、`MathParseOptions { parseAmbiguousBars?: boolean }`，并在 `MathTree` 上挂载 `oddBarSpans: TextSpan[]`。
   - `tokenizer.ts`：`SYMMETRIC_DELIM` 新增 `["|", "pipe"]`（`kind: "sym_delim"`）；`\left|` / `\right|` 仍由 `tryReadLeftRight` 优先吞并，`\|` 维持 `"escaped_bar"` 不受影响。
   - `bracketBuilders.ts` / `commandTable.ts`：抽取共享 `resolveEnvHeaderEndIdx`，供 `buildEnvBracket` 与 `matcher.ts` 共同跳过环境头参数（如 `\begin{array}{c|c}`）。
   - `matcher.ts`：`matchDelimiters(tokens, source, options)`（`parseAmbiguousBars` 默认 `true`）：
     - `parseAmbiguousBars === false`：`|` 忽略降级，`∥` 沿用旧 `sym_delim` 弱栈，`oddBarSpans` 为空；
     - `parseAmbiguousBars === true`：Pass 1 先完成非 `|`/`∥` 括号配对；Pass 2 递归遍历每个有效层级（跳过 `env` 头参数及 `COMMAND_SIGNATURES` 中 `textMode: true` 命令后的 `{...}`），分别收集当前层直接裸露的 `|` 与 `∥`：偶数个时两两相邻配对（同时过滤与交叉对冲突的异常跨界配对），奇数个时全部弃配并记录至 `oddBarSpans`（按 `from` 升序）。
   - `builder.ts`：`buildMathTree(source, options?)` 默认 `parseAmbiguousBars: true` 并填充 `oddBarSpans`。

2. **编辑器区域与源码标红（`src/editor/`、`styles.css`）**：
   - `mathRegion.ts`：`docCache` 升级为按 `parseAmbiguousBars` 开关隔离的多块缓存（`WeakMap<Text, { parseAmbiguousBars: boolean; blocks: Map<string, AnalyzedMathBlock> }>`）；新增 `collectVisibleMathRegions(state, visibleRanges)` 以精准定位与视口重叠的完整数学块。
   - `smartBackspace.ts` / `smartJump.ts` / `smartInput.ts`：透传 `getParseAmbiguousBars?.() ?? true`。
   - `oddBarHighlight.ts`（新增）：基于 CM6 `ViewPlugin.fromClass` 与 `refreshOddBarsEffect`，在开关开启时对可见数学块内 `oddBarSpans` 施加 `Decoration.mark({ class: "struct-latex-odd-bar" })`；关闭时清空装饰。
   - `styles.css`：添加 `.struct-latex-odd-bar, .struct-latex-odd-bar * { color: var(--text-error) !important; }`。

3. **设置项、沙盒预览与主入口（`src/input/`、`src/settings/`、`src/i18n/`、`src/main.ts`）**：
   - `input/types.ts`：`PluginSettings` 新增 `parseAmbiguousBars: boolean`（默认 `true`）。
   - `input/previewEvaluator.ts`：`evaluateRulePreview(rule, dialect, options?)` 内部默认跟随 `parseAmbiguousBars: true` 并支持透传设置。
   - `settings/settingAboutAndSpecial.ts`、`settingTab.ts`、`settingRuleList.ts`、`ruleEditorView.ts`、`ruleRowRenderer.ts`：落地「部分双竖线解析（`|` 与 `∥`）」开关，沙盒预览与规则列表签名均跟随当前开关，切换后即时保存并通知编辑器刷新。
   - `src/i18n/`：清理旧特殊设置占位词条，补齐中英文配置文案。
   - `src/main.ts`：加载兜底配置、注入 `getParseAmbiguousBars`、注册 `createOddBarHighlightExtension` 并在配置变更时向所有 `MarkdownView` 派发 `refreshOddBarsEffect`。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_9.md`：本计划文档。
- `src/editor/oddBarHighlight.ts`：CM6 视口内奇数竖线红色高亮 `ViewPlugin` 扩展。

### 修改
- `src/parser/types.ts`、`src/parser/tokenizer.ts`、`src/parser/commandTable.ts`、`src/parser/bracketBuilders.ts`、`src/parser/matcher.ts`、`src/parser/builder.ts`
- `src/editor/mathRegion.ts`、`src/editor/smartBackspace.ts`、`src/editor/smartJump.ts`、`src/editor/smartInput.ts`
- `src/input/types.ts`、`src/input/previewEvaluator.ts`、`src/input/ruleEngine.ts`
- `src/settings/settingAboutAndSpecial.ts`、`src/settings/settingTab.ts`、`src/settings/settingRuleList.ts`、`src/settings/ruleEditorView.ts`、`src/settings/ruleRowRenderer.ts`
- `src/i18n/types.ts`、`src/i18n/zh.ts`、`src/i18n/en.ts`
- `src/main.ts`、`styles.css`
- `tests/parser/structuralDelete.test.ts`、`tests/parser/structuralJump.test.ts`、`tests/input/ruleEngine.test.ts`、`tests/settings/toolbarAndI18n.test.ts`
- `REQUIRMENT.md`

---

## 4. 验证方式

1. `npm run typecheck`、`npm test`、`npm run build` 全部通过，产物 `main.js` 未内联外部依赖，所有 `src/` 文件 ≤ 300 行。
2. 自动化单测全覆盖：`parseAmbiguousBars: true/false` 切换、`(|a|+|b|+|c|)` 与 `∥a∥+∥b∥` 平级配对、同层奇数 `oddBarSpans` 精确坐标、普通括号独立层级、`\text{...}` 与 `\begin{array}{c|c}` 跳过、`\|` 与 `\left|` 隔离、跳转步进及设置沙盒/i18n 对齐。
3. 同步 `manifest.json`、`main.js`、`styles.css` 至 `C:\Users\Administrator\Desktop\TestObsidian` 并在真实 Obsidian 中验证源码/实时预览标红、结构删除、跳转及特殊设置开关热生效，确认控制台零报错。

---

## 5. 回退方案

- 删除 `PLAN/PLAN_9.md` 与 `src/editor/oddBarHighlight.ts`，并通过 `git checkout -- src/ styles.css tests/ REQUIRMENT.md` 恢复后重新运行 `npm run build`，即可无损回退至 `PLAN 8` 状态。
