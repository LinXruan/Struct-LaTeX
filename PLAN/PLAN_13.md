# PLAN 13 — 修复命令后输入失效、反斜杠词法切片与命令前缀补全异常

日期：2026-11-23

## 1. 需求与根因

- **问题现象**：在数学模式下输入 `\sum`（或通过 `sum` 自动展开为 `\sum`）后紧接着输入 `_`，预期生成 `\sum_{}`（光标位于 `{}` 内），实际却输出了字面量 `\sum_`。
- **根因定位（共三类关联缺陷）**：
  1. **`inCommandTyping` 未区分命令名拼写与后续非字母算子**：`src/input/contextBuilder.ts` 中的 `isTypingCommand(before)` 仅正则检测 `before` 是否以未转义的 `\[a-zA-Z]*` 结尾，完全忽略当前按键 `key`。当 `before` 已是完整命令（如 `\sum`、`\int`、`\lim`、`\alpha`、`\sin`、`\pi`、`\max`）时，紧接着输入 `_`、`^`、`/` 等非字母触发符（或 `key === ""` 的确认键/快捷键），`inCommandTyping` 仍误判为 `true`，导致默认开启 `excludeInCommand` 的数学规则（`script-sub` `_`、`script-sup` `^`、`frac-slash` `/` 等 117 条产生命令的规则及 `trigger.json` 非字母触发规则）全部被拦截。且在 `unicode` 模式下 `sum` 变为 `∑` 后 `_` 可正常触发 `∑_{}`，与默认 `latex` 模式行为严重不一致。
  2. **多字符规则切片反斜杠词法单元（Backslash Token Slicing）**：当规则匹配区间起点 `matchStart` 落入 `before` 中已有的反斜杠词法单元内部（`tok.from < matchStart < tok.to`）时，仅靠末尾字母判定无法阻止替换咬掉前面命令或控制符的前缀字母/符号并残留孤立 `\`。例如：
     - `\;a` → `\\\alpha`、`\;(` → `\(|)`、`\|->` → `\\mapsto`、`\!=` → `\\ne`；
     - `\er||` → `\\\left.|\right|`、`\d...` → `\\ddots`、`\v...` → `\\vdots`、`\...` → `\\cdots`；
     - `\sm0n` → `\\sum_{n=0}^{\infty}`、`\it01` → `\\int_{0}^{1}`、`\l[)` → `\\left[\right)`、`\dd2x` / `\pp2x` 等；
     - 若放开非字母按键的 `inCommandTyping` 而不同时校验 `matchStart`，`\sm=`、`\it=`、`\lm=`、`\lr(`、`\o+`、`\pw2` 等也会从内部切开 `\command` 并残留 `\`。
  3. **`commandCatalog` 前缀表缺失导致 `js-cmd-space` 误拆手写标准命令**：手写 `\dots`、`\texttt`、`\textsf`、`\bigl`、`\Bigl`、`\leqslant`、`\geqslant`、`\sech`、`\csch`、`\subsetneq`、`\rightharpoonup` 等命令时，因前缀 `\dot`、`\text`、`\big`、`\Big`、`\le`、`\ge`、`\sec`、`\csc`、`\subset`、`\right` 已是已知命令而完整长命令不在 `EXTRA_MATH_COMMANDS` 中，触发命令后自动补空格规则将其误拆为 `\dot s`、`\text tt`、`\big l`、`\leq slant` 等。

---

## 2. 目标语义与方案

1. **按键感知的 `isTypingCommand(before, key)`（`src/input/contextBuilder.ts`）**：
   - 若 `before` 以未转义的裸 `\` 结尾（0 个字母）：仅当 `key.length > 0` 时返回 `true`，完整保护 `\_`、`\^`、`\/`、`\{`、`\|` 与手写 `\cmd` 起始输入；`\\_`（偶数个反斜杠，即换行 `\\` 后接 `_`）返回 `false`，正常展开为 `\\_{}`。
   - 若 `before` 以未转义的 `\[a-zA-Z]+` 结尾（≥1 个字母）：
     - 当 `key` 以 `[a-zA-Z]` 开头时返回 `true`（仍在拼写命令字母，交由 `js-cmd-space` 等后置规则决定是否拆分）；
     - 当 `key === "/"` 且命令名为 `left` 或 `right` 时返回 `true`（`tokenizeMath` 将 `\left/`、`\right/` 识别为定界符 Token，避免误展开为 `\left\frac{}{}`）；
     - 其余非字母按键（`_`、`^`、`/`、符号、数字、空格及确认键/快捷键 `""`）返回 `false`，使 `\sum_` → `\sum_{}`、`\sum^` → `\sum^{}`、`\pi/` → `\pi\frac{}{}` 等与 `unicode` 模式完全一致。
2. **统一的词法切片守卫 `slicesBackslashToken(before, matchStart)`（`src/input/contextBuilder.ts`、`ruleEngine.ts`、`triggerEngine.ts`）**：
   - 在 `ruleEngine.ts` 与 `triggerEngine.ts` 中，对开启 `excludeInCommand`（默认开启）且 `0 < matchStart < ctx.before.length` 的匹配结果，用 `tokenizeMath` 扫描 `matchStart` 所在行，若 `matchStart` 严格落在任意 `\` 开头 Token 内部（`tok.from < relStart && relStart < tok.to`），则拦截该匹配。
   - 不影响 `matchStart === tok.from` 且关闭 `excludeInCommand` 的链式升级规则（如 `\le>` → `\Leftrightarrow`、`\\=` → `\\ =& `），同时根除 `\;a`、`\!=`、`\|->`、`\er||`、`\d...`、`\sm=`、`\sm0n`、`\lr(`、`\o+`、`\left|->` 等一切跨 Token 切片残留 `\` 的错误。
3. **补全 `EXTRA_MATH_COMMANDS`（`src/input/commandCatalog.ts`）**：
   - 补充 `\dots` 族、`\textsf`/`\texttt`/`\textsc`/`\textsl`/`\textnormal`、`\bigl`/`\Bigl`/`\biggl`/`\Biggl` 系列与 `\bigodot`/`\biguplus`、`\leqslant`/`\geqslant`/`\leadsto`、`\sech`/`\csch`、`\subsetneq`/`\supsetneq`、`\rightharpoonup`/`\leftharpoonup` 系列、`\intercal`、`\cdotp`，防止手写完整 LaTeX 命令被 `js-cmd-space` 意外打断。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_13.md`：本计划文档。

### 修改
- `src/input/contextBuilder.ts`：重构 `isTypingCommand(before, key)`，新增并导出 `slicesBackslashToken(before, matchStart)`。
- `src/input/ruleEngine.ts`：在 `evaluateCompiledRule` 的 `text`/`regex`/`js` 分支中接入 `slicesBackslashToken` 守卫。
- `src/input/triggerEngine.ts`：在 `evaluateSingleTriggerRule` 中接入 `slicesBackslashToken` 守卫。
- `src/input/commandCatalog.ts`：补充标准数学/文本/定界符前缀碰撞命令至 `EXTRA_MATH_COMMANDS`。
- `tests/input/defaultRules.test.ts`、`tests/input/ruleEngine.test.ts`、`tests/input/triggerEngine.test.ts`：补充命令后 `_`/`^`/`/`、转义符保护、反斜杠切片防护、手写命令防误拆及快捷键/触发规则全量单测。
- `REQUIRMENT.md`：同步补充命令后算子与反斜杠词法边界守卫说明。

---

## 4. 验证方式

1. 运行 `npm run typecheck`、`npm test`、`npm run build`，确保类型检查、自动化单测与生产打包全绿，且 `main.js` 未内联外部依赖，所有 `src/` 单文件 ≤ 300 行。
2. 将 `manifest.json`、`main.js`、`styles.css` 同步至测试仓库 `C:\Users\Administrator\Desktop\TestObsidian\.obsidian\plugins\struct-latex\`，停用 `easy-typing-obsidian`，在真实 Obsidian 中验证 `\sum_`、`sum_`、`\sum^`、`\alpha_`、`\pi/`、`\_`、`\dots`、`\;a`、`Ctrl+Z` 撤销与控制台零报错。

---

## 5. 回退方案

- 删除 `PLAN/PLAN_13.md`，执行 `git checkout -- src/input/contextBuilder.ts src/input/ruleEngine.ts src/input/triggerEngine.ts src/input/commandCatalog.ts tests/input/defaultRules.test.ts tests/input/ruleEngine.test.ts tests/input/triggerEngine.test.ts REQUIRMENT.md`，重新运行 `npm run build` 并同步至测试仓库即可无损回退至 `PLAN 12` 状态。
