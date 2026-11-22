# PLAN 10 — 修正显式数学块末尾换行符的错误吸附

日期：2026-11-22

## 1. 需求与根因

- **问题现象**：在多行显式数学块 `$$\n123456|\n$$` 中，光标位于 `6` 后按 `Backspace`，原本期望删去 `6` 并保留末尾换行变成 `$$\n12345|\n$$`，实际却将末尾 `\n` 一并删除，变成了 `$$\n12345|$$`。
- **根因定位**：
  1. `PLAN 3` 将空格与换行统一合并为 `whitespace` token；对于 `$$\n123456\n$$`，`mathRegion.ts` 截取内部源码 `"\n123456\n"`。
  2. `src/parser/builder.ts` 中 `buildRange` 对所有 `whitespace` token 无条件调用 `absorbTrailingSpace(lastSibling, tok.to)`。
  3. 位于数学块根级最末尾（闭合 `$$` / `\]` 前）的 `"\n"` 被末尾对象 `6` 吸收，使 `6` 的跨度变为 `[6, 8]`、触发区间变为 `[7, 8]`；删除时因此跳过单字符快路径退回，连同 `\n` 一并清空。
- **边界确认**：保留同层后续仍有其他对象时的跨行吸附（如 `a + b|\n    c` → `a + |c`、`a|\n_{2}` → `|`）以及矩阵等括号槽位内部原有行为，仅修正**根级数学块最末尾**的换行吸附。

---

## 2. 目标语义与方案

- **根级数学块末尾换行保护（`src/parser/builder.ts`）**：
  - 在 `buildRange(ctx, startIdx, endIdx, parent, textMode)` 处理 `whitespace` token（`!textMode && lastSibling`）时：
  - 由于 `tokenizeMath` 保证相邻空白必合并为单个 `whitespace` token，因此 `parent === undefined && i + 1 === endIdx` 精确等价于「处于根级数学块最末尾、紧邻闭合定界符前且后续已无任何数学对象」。
  - 在此边界条件下，扫描 `tok.text` 查找首个 `\r` 或 `\n`：
    - 若不存在换行符（纯水平空格，如 `$a   |$`），照常吸收至 `tok.to`；
    - 若存在换行符，仅吸收首个 `\r` / `\n` 之前的同行水平空白（例如 `$$\n\sin |\n$$` 仍吸收 `" "` 并整删 `\sin `，`$$\n123456 |\n$$` 吸收 `" "` 并删 `6 `），绝不跨过 `\r` / `\n`；若首个字符即为 `\r` / `\n`（如 `$$\n123456|\n$$`），则完全不触发 `absorbTrailingSpace`。
  - 于是 `6` 保持 `triggers = [{ from: 7, to: 7 }]`，`resolveStructuralDelete` 计算 `[6, 7]` 命中 `[relPos - 1, relPos]` 快路径并返回 `null`，交还原生 `Backspace` 单字符删去 `6`，完整保留 `\n$$`；同时 `Tab` 跳转在 `$$\n  a + |b\n$$` / `$$\n  \frac{a}{b|}\n$$` 下也改为停在本行末 `b|` / `\frac{a}{b}|`，再按 `Tab` 跳出数学块，避免误跳到闭合 `$$` 行首。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_10.md`：本计划文档。

### 修改
- `src/parser/builder.ts`：新增 `resolveTrailingSpaceEnd`，在 `parent === undefined && i + 1 === endIdx` 时于首个 `\r`/`\n` 前截断尾随空白吸附。
- `tests/parser/structuralDelete.test.ts`：补充根级数学块末尾换行（LF/CRLF、带前置缩进与同行尾部空格、光标在 `\n` 后、`\sin|` / `\sin |`、`\frac{a}{b}|`、`\begin{bmatrix}...\end{bmatrix}|`、`a_{2}|`）不跟随删除的自动化测试。
- `tests/parser/structuralJump.test.ts`：补充根级数学块末行 `Tab` 先停在本行末尾对象后、再跳出数学块的断言。
- `REQUIRMENT.md`：在 §1.2 与 §4.1 同步记录根级数学块末尾不吸收换行符的空白边界规则。

---

## 4. 验证方式

1. **类型检查、自动化单测与构建**：
   - 运行 `npm run typecheck`、`npm test`、`npm run build`，全部通过且产物 `main.js` 未内联外部依赖。
2. **Obsidian 真机验收（`C:\Users\Administrator\Desktop\TestObsidian`）**：
   - 同步 `manifest.json`、`main.js`、`styles.css` 到测试仓库 `.obsidian/plugins/struct-latex/`，停用 `easy-typing-obsidian`。
   - 启动 `D:\Install\Obsidian\Obsidian.exe` 实测 `$$\n123456|\n$$` 退格、继续退格清空后整删 `$$\n\n$$`、`$$\n\sin |\n$$`、`$$\n\frac{a}{b}|\n$$`、`$$\n123456\n|$$`、`Ctrl+Z` 撤销及中文 IME 与非数学区输入，确认控制台零报错。

---

## 5. 回退方案

- 删除 `PLAN/PLAN_10.md`，并通过 `git checkout -- src/parser/builder.ts tests/parser/structuralDelete.test.ts tests/parser/structuralJump.test.ts REQUIRMENT.md` 恢复，重新运行 `npm run build` 并同步至测试仓库即可无损回退至 `PLAN 9` 状态。
