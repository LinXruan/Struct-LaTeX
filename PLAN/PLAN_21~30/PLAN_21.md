# PLAN 21 — 特殊设置：小括号遇大符号与嵌套自动伸缩（`\left(...\right)`）

日期：2026-11-23

## 1. 需求与根因

- **单次输入转换限制**：智能输入引擎（`evaluateAutoInput`）在单次按键中仅命中首条匹配规则即返回，无法在展开内部规则（如 `((\su|))` 输入 `m` 触发 `sum` → `\sum`，或 `(|)` 内输入 `/` 触发 `\frac{}{}`）的同时联动改写外层多层小括号；此外，Obsidian 原生自动括号补全 `(|)` 下输入第 2 个 `(` 变为 `((|))` 的过程发生在 `inputHandler` 放行之后，单条 JS 输入规则无法完整覆盖。
- **解析树直接判定的误伤问题**：在 `MathTree` 中，`\mathbb{A}`、`\mathbf{x}`、`\sqrt{x}`、`x^{2}`、`{x}`、`\text{...}` 均属于 `BracketObject`。若简单按「内部存在子 `BracketObject`」判定括号嵌套，会导致 `(\mathbb{A})`、`(x^{2})`、`(\sqrt{x})` 等普通高度公式被误升级为 `\left(...\right)`。

---

## 2. 目标语义与方案

1. **「特殊设置」全局开关（`autoSizeParens`）**：
   - 在 `PluginSettings` 与「设置 → 特殊设置」页面新增 **「小括号自动伸缩」** 开关（默认开启 `true`）。
2. **基于 `MathTree` 的三分法与透明弥合解析（`src/parser/autoDelimResolver.ts`）**：
   - **候选作用域与子树级联**：定位所有覆盖当前光标的 `BracketObject`（`coreFrom < relPos <= coreTo`）；若该节点为普通小括号 `(...)`（开界 `"("`、闭界 `")"`，不在 `textMode` 槽内，且左右均无 `\big`/`\Big`/`\bigg`/`\Bigg`/`\bigl`/`\bigr` 等手动缩放修饰），则同时递归检查其内部所有子代普通小括号 `(...)`，使中间输入、末尾闭合、左侧补括号、整段粘贴四种编辑姿势均能一次性将内外所有满足条件的 `(...)` 同步升级，且不波及外部无关兄弟公式。
   - **内部子对象三分法判定**：
     1. **直接触发类**：
        - 大符号 `WordObject`：`\sum` `\prod` `\coprod` `\int` `\iint` `\iiint` `\iiiint` `\oint` `\oiint` `\oiiint` `\bigcup` `\bigcap` `\bigoplus` `\bigotimes` `\bigsqcup` `\bigvee` `\bigwedge` `\biguplus` `\bigodot`、Unicode `∑ ∏ ∫ ∬ ∭ ∮`，以及挂载了 `\limits` 后缀的算子（如 `\lim\limits_{...}`）；
        - 大结构 `cmd` `BracketObject`：`\frac` `\dfrac` `\tfrac` `\cfrac` `\binom` `\dbinom` `\tbinom` `\overset` `\underset` `\stackrel` `\substack`；
        - 多行/矩阵环境 `env` `BracketObject`：所有 `\begin{...}...\end{...}`；
        - 嵌套可见定界符 `delim` `BracketObject`：所有 `subtype === "delim"` 的子定界符（含 `(...)`、`[...]`、`\{...\}`、`\langle...\rangle`、`\lfloor...\rfloor`、`\lceil...\rceil`、`\left...\right`，以及在全局「双竖线括号解析」开启时配对为 `delim` 的 `|...|` / `\|...\|` / `∥...∥`；奇数孤立竖线如 `P(A|B)` 在 `MathTree` 中为 `AtomObject`，天然不触发）。
     2. **透明弥合类**：非高结构 `cmd`（如 `\mathbb`、`\mathbf`、`\mathrm`、`\mathcal`、`\sqrt`、`\overline`、`\hat`、`\vec` 等）、花括号组 `group`（`{...}`）与上下标 `script`（`_{...}` / `^{...}`）本身不算嵌套，穿透递归检查其非 `textMode` 槽位（例如 `(\mathbb{A})`、`(\sqrt{x})`、`(\sqrt[3]{x})`、`(x^{2})` 不变，而 `(\overline{\frac{a}{b}})`、`(\sqrt{\frac{1}{2}})`、`(x^{\frac{1}{2}})` 穿透触发）。
     3. **屏蔽忽略类**：`slot.textMode === true` 的文本槽（如 `\text{...}`）及普通 `WordObject` / `AtomObject` 直接忽略。
3. **CM6 独立撤销步事务集成（`src/editor/autoDelim.ts`）**：
   - 通过 `EditorView.updateListener` 监听输入变更（仅响应 `struct-latex.input` 或非 `input.type.compose` 的 `input` 事件，要求单光标空选区、非只读、非 `view.composing`、非代码块/YAML）；
   - 统一透传全局 `settings.parseAmbiguousBars` 调用 `getAnalyzedMathBlock`，在需要升级时以 `isolateHistory.of("full")` + `userEvent: "struct-latex.auto-delim"` 派发独立事务并精确重映射光标位置：按 1 次 `Ctrl+Z` 先退回普通 `(...)`，再按 1 次 `Ctrl+Z` 撤销本次键入。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_21.md`：本计划文档。
- `src/parser/autoDelimResolver.ts`：纯解析层小括号自动伸缩判定与光标偏移重映射。
- `src/editor/autoDelim.ts`：CM6 `updateListener` 自动伸缩扩展（含独立撤销步与 IME 保护）。
- `tests/parser/autoDelimResolver.test.ts`：覆盖大符号、嵌套级联、透明弥合、`parseAmbiguousBars` 联动与光标映射的自动化单测。

### 修改
- `src/input/types.ts`：`PluginSettings` 与 `DEFAULT_PLUGIN_SETTINGS` 新增 `autoSizeParens: true`。
- `src/i18n/types.ts`、`src/i18n/zh.ts`、`src/i18n/en.ts`：新增「小括号自动伸缩」中英文设置文案。
- `src/settings/settingAboutAndSpecial.ts`：在「特殊设置」页面渲染「小括号自动伸缩」开关。
- `src/main.ts`：注册 `createAutoParenSizeExtension` 并持久化 `autoSizeParens` 设置。
- `tests/settings/toolbarAndI18n.test.ts`：补充 `autoSizeParens` 默认值与中英文文案断言。
- `REQUIRMENT.md`：同步记录「特殊设置」中的「小括号自动伸缩」规格。

---

## 4. 验证方式

- 运行 `npm run typecheck`、`npm test`、`npm run lint`、`npm run build` 全部通过，确认 `main.js` 未内联外部依赖。
- 将构建产物同步至测试仓库 `C:\Users\Administrator\Desktop\TestObsidian`，在真实 Obsidian 中验证 `((\su|))` + `m` → `\left(\left(\sum|\right)\right)`、`((|))`、`(|x|)`、`P(A|B)`、`(\mathbb{A})`、`(\sqrt{x})`、`(\sqrt{\frac{1}{2}})` 及两步 `Ctrl+Z` 撤销行为，确认控制台零报错。

---

## 5. 回退方案

- 删除 `src/parser/autoDelimResolver.ts`、`src/editor/autoDelim.ts`、`tests/parser/autoDelimResolver.test.ts`，并回退 `src/input/types.ts`、`src/i18n/*`、`src/settings/settingAboutAndSpecial.ts`、`src/main.ts`、`REQUIRMENT.md` 中的关联改动即可恢复。
