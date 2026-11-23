# PLAN 3 — 统一空白模型重构与 `Tab` 智能光标跳转模块

日期：2026-11-20

## 1. 需求与根因

- **需求**：在 `PLAN 1` 已落地的非正则对象关系树内核上，实现面向数学模式的 `Tab` 细粒度对象级智能光标跳转模块，作为后续自定义键位绑定与多模式导航的地基。
- **根因与隐患**：
  1. `PLAN 1` 为空格吸附设置了两条特例硬边界（不跨换行 `\n`、括号槽内前导空格不并入左括号，且仅针对字母结尾定界符如 `\left\Vert ` 做了分隔空格特判），导致对象边界不统一，使 `\sin |(   1+2)`、`\begin{cases}\n  1\end{cases}` 等跳转出现割裂。
  2. 无花括号单 Token 上下标（`_2`、`_\alpha`）此前按伪 `BracketObject` 构建，与「实心对象整体跨过、括号对象进入槽位」的纯对象哲学不一致。
  3. 需采用 CM6 真光标跳转路线（拦截按键并直接派发选区移动），避免 `easy-typing` 替换法导致的撤销栈污染、公式渲染闪烁与上下文盲区。

---

## 2. 目标语义与方案

### 2.1 统一空白与实心对象模型
1. **空格与换行一视同仁**：词法层将水平空格（` ` / `\t`）与换行符（`\n` / `\r\n`）合并为单一 `whitespace` Token（`readAlignBreak` 内部仍只跳过同行水平空格以防误识 `\\\n=`）。建树时在非 `\text{...}` 文本槽内，前对象统一吸收紧随其后的 `whitespace`。
2. **括号左开界统一吸收前导空白**：在 `Slot` 中记录 `openCoreTo` 与 `bodyFrom`，所有括号槽位（环境、普通/伸缩括号、联括号命令、带花括号上下标）在非文本模式下统一将开界后的 `whitespace` 吸收进 `[openCoreTo, bodyFrom]`，删除原有的字母结尾定界符特判。删除触发区间同步放宽为 `[openCoreTo, bodyFrom]`。
3. **无花括号上下标归为实心词**：`_2`、`^n`、`_\alpha` 统一构建为 `WordObject` 并单向挂载到前驱宿主上；删除末尾与宿主级联语义不变，`a_|1` 按词内编辑回退原生，跳转时一步跨过。

### 2.2 一统天下的“平面跳转段”算法
- 对 `MathTree` 做一次 $O(N)$ 先序遍历，将全树展开为有序、互不重叠的 `JumpSegment[]`，每段为 `(coreFrom, coreTo, to)`（实体区间 `[coreFrom, coreTo)` + 尾随空白区间 `[coreTo, to]`）：
  - `AtomObject` / `WordObject` → 1 个段 `(coreFrom, coreTo, to)`；
  - `BracketObject` → 开界段 `(coreFrom, slot0.openCoreTo, slot0.bodyFrom)` → 递归子段 → 槽间段 `(slot_s.bodyTo, slot_{s+1}.openCoreTo, slot_{s+1}.bodyFrom)` → 递归子段 → 闭界段 `(lastSlot.bodyTo, coreTo, to)`。
- **核心判定公式（$O(\log N)$ 二分查找）**：在有序段中查找首个满足 `seg.coreTo > relPos` 的段并跳至 `seg.to`：
  - 光标在对象实体内（`\s|in   `）→ 跳至该对象末端（`\sin   |`）；
  - 光标在尾随空白内（`\sin  |  (1+2)`）→ 视为已达末端，直接作用于下一个对象（`\sin    (|1+2)`）；
  - 光标在左括号前导空白内（`(  | 1+2)`）→ 跨过下一个对象（`(   1|+2)`）；
  - 紧邻右括号+下标（`\left\Vert x|\right\Vert_{2}`）→ 严格按纯粹对象哲学两步跳（先出括号，再进下标）。
- **数学块末尾外跳**：当无后续段且数学块已闭合时：
  - 行内公式（`$...$` / `\(...\)`）：右侧已有水平空格则纯移动至空格后，否则插入单个 `" "` 并移动至其后；
  - 块级公式（`$$...$$` / `\[...\]`）：闭合标记后已有换行则移至下一行行首，否则自动插入 `"\n"` 并移至新行行首。

### 2.3 CM6 接入与安全守卫
- 通过 `Prec.highest(keymap.of([{ key: "Tab", run: handleSmartTab }]))` 接入。
- `readOnly`、`view.composing`、多光标、非空选区、非数学区域一律返回 `false` 交还原生处理。
- 纯跳转仅派发 `{ selection, scrollIntoView: true, userEvent: "select.struct-latex" }`，零撤销栈污染；仅在块尾补空格/换行时派发带 `isolateHistory.of("full")` 的原子事务。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_3.md`：本计划文档。
- `src/parser/jumpResolver.ts`：平面跳转段展开与 $O(\log N)$ 跳转解析器。
- `src/editor/smartJump.ts`：CM6 `Tab` 拦截、数学块外跳与原子事务派发。
- `tests/parser/structuralJump.test.ts`：纯解析智能跳转自动化单测套件。

### 修改
- `src/parser/types.ts`：`Slot` 新增 `openCoreTo`，新增 `JumpSegment` 类型。
- `src/parser/tokenizer.ts`：合并 `hspace` / `newline` 为统一 `whitespace`。
- `src/parser/objectFactory.ts`：`skipWhitespaceTokens` 与统一槽开界触发区间。
- `src/parser/bracketBuilders.ts`：统一槽开界吸收前导空白（移除字母结尾特判），无花括号上下标改建 `WordObject`。
- `src/parser/builder.ts`：移除 `newline` 特判，统一 `whitespace` 尾随吸附。
- `src/editor/mathRegion.ts`：在 `AnalyzedMathBlock` 上按不可变 `state.doc` 缓存 `jumpSegments`。
- `src/main.ts`：注册 `createSmartJumpExtension()`。
- `scripts/run-tests.mjs`：升级为自动递归发现并执行 `tests/` 下所有 `*.test.ts`。
- `tests/parser/structuralDelete.test.ts`：同步更新跨换行吸附、括号前导空白删除与无花括号实心词断言。
- `REQUIRMENT.md`、`GEMINI.md`：同步最新设计决策与文件结构。

---

## 4. 验证方式

1. **类型检查、单测与构建**：`npm run typecheck`、`npm test`、`npm run build` 全绿，确认 `main.js` 未打包 `obsidian` / `@codemirror/*` / `@lezer/*`。
2. **自动化单测**：验证实体内 vs 空白内跳转差异、括号前导空白、嵌套括号、多槽命令、纯粹对象两步跳、无花括号实心上下标、空括号、多行环境含换行缩进、`\text{...}` 文本槽、块尾外跳以及重构后的全部删除用例。
3. **Obsidian 真机验收（`C:\Users\Administrator\Desktop\TestObsidian`）**：同步 `manifest.json` 与 `main.js` 并实测 `Tab` 跳转、行内补空格/块级自动换行、`Ctrl+Z` 撤销栈零污染、非数学区 `Tab` 缩进、IME 合成态与更新后的 `Backspace` 删除，确认控制台零报错。

---

## 5. 回退方案

- 删除新增文件（`src/parser/jumpResolver.ts`、`src/editor/smartJump.ts`、`tests/parser/structuralJump.test.ts`、`PLAN/PLAN_3.md`）并通过 `git checkout -- src/ tests/ REQUIRMENT.md GEMINI.md` 即可完整回退至 `PLAN 1` / `PLAN 2` 状态，重新运行 `npm run build` 同步测试库产物即可恢复原环境。
