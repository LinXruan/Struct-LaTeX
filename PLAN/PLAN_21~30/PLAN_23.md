# PLAN 23 — 结构删除：容器末尾吞并前驱悬空分隔空白

日期：2026-11-23

## 1. 需求与根因

- **现象**：`$\sin \sum|$` 按 `Backspace` 得到 `$\sin |$`，闭合 `$` 前残留空格，Obsidian 行内公式不再渲染。`$a + b|$` 的原生退格同理得到 `$a + |$`。
- **根因**：统一空白模型中尾随空白挂载于前驱实体，其语义是**与后继实体之间的分隔符**。结构删除仅删除目标闭包（含目标自身尾随空白），当被删闭包是所在容器（根级数学块或某槽位）内的**最后实体**时，前驱的尾随空白失去后继，成为无意义的悬空空白。

---

## 2. 目标语义与方案

1. **悬空分隔空白吞并（零特例，纯解析层）**：`resolveStructuralDelete` 在算出闭包跨度后、快路径判定前执行：
   - 取目标所在同级容器（`parent` 中包含目标的槽位 `children`，或 `tree.roots`）；
   - 若跨度右侧同容器内已无任何实体（无兄弟 `coreFrom >= span.to`），且紧邻左侧的前驱兄弟满足 `prev.to === span.from` 且 `prev.coreTo < prev.to`，则将 `span.from` 左扩至 `prev.coreTo`。
2. **天然边界**：
   - `\text{}` 等文本模式槽不吸收空白，前驱无尾随空白，自动不生效；
   - 根级块公式末尾受保护的换行位于跨度右侧，不被触及（`$$\n\sin \sum|\n$$` → `$$\n\sin|\n$$`）；
   - 右侧仍有实体时（`\sin \sum| x`）行为不变；
   - 由于吞并发生在快路径判定之前，`a + b|` 不再退化为原生退格，而是结构删除为 `a +|`。
3. **联动**：输入检测触发的删除（`resolvePureStructuralDeleteWithTrigger`）复用同一函数自动生效；编辑器层、撤销栈语义不变。删除后光标停在 `\sin|`，后续键入字母由默认规则 `js-cmd-space` 自动补空格。
4. **不处理**：数学块/槽位首部无前驱的前导空白（如 `$ \sum|$`），以免触及 `$$` 后的起始换行。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_21~30/PLAN_23.md`：本计划文档。

### 修改
- `src/parser/deleteResolver.ts`：新增 `absorbDanglingSeparator`，在快路径判定前扩展删除跨度。
- `tests/parser/structuralDelete.test.ts`：调整受影响用例预期，新增本问题、槽位末尾、块公式换行、文本槽与后继存在等用例。
- `REQUIRMENT.md`：§4.1「空白跟随与安全边界」补充悬空分隔空白规则。

---

## 4. 验证方式

- `npm run typecheck`、`npm test`、`npm run build` 全部通过，`main.js` 未内联外部依赖。
- 真机验证由用户自行完成：`$\sin \sum|$`、`$a + b|$`、`$$\n\sin \sum|\n$$`、`\frac{a}{b \sum|}`、`\text{a b|}` 及 `Ctrl+Z` 一步撤销。

---

## 5. 回退方案

- 删除 `src/parser/deleteResolver.ts` 中的 `absorbDanglingSeparator` 及其调用，并回退 `tests/parser/structuralDelete.test.ts`、`REQUIRMENT.md` 中的关联改动即可恢复。
