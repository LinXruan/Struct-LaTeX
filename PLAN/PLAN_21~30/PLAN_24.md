# PLAN 24 — 特殊设置：小括号自动伸缩补充双竖线与竖线定界符支持

日期：2026-11-23

## 1. 需求与根因

- **现象**：开启「小括号自动伸缩」（`autoSizeParens`）后，输入 `\|\frac{1}{2}\|`、`∥\frac{1}{2}∥` 或 `|\frac{1}{2}|` 等绝对值/范数双竖线定界符时，不会像 `(...)` 那样自动升级为 `\left\|...\right\|` / `\left|...\right|`。
- **根因**：[src/parser/autoDelimResolver.ts](../../src/parser/autoDelimResolver.ts) 中的 `isPlainParenCandidate` 仅匹配开界 `(`、闭界 `)`，且 `resolveAutoParenUpgrades` 硬编码替换为 `\left(` 与 `\right)`，遗漏了同样属于 `subtype === "delim"` 的竖线定界符 `\|...\|`、`∥...∥` 与 `|...|`。

---

## 2. 目标语义与方案

1. **统一映射表支持圆括号与竖线/双竖线定界符（`src/parser/autoDelimResolver.ts`）**：
   - 将 `isPlainParenCandidate` 重构为基于 `AUTO_DELIM_SPECS` 映射表的 `matchAutoDelimSpec`，统一覆盖 4 种平层定界符：
     - `(...)` → `\left(...\right)`
     - `|...|` → `\left|...\right|`
     - `\|...\|` → `\left\|...\right\|`
     - `∥...∥` → `\left\|...\right\|`（LaTeX/MathJax 不支持 `\left∥`，统一规范为 `\left\|...\right\|`）
   - 共用同一套 `hasTallOrNestedContent` 判定（大符号、高结构命令、多行环境、或嵌套可见 `delim` 如 `\|(x)\|`、`(|x|)` 均升级）与透明弥合规则。
2. **与「双竖线括号解析（`parseAmbiguousBars`）」联动**：
   - `resolveAutoParenUpgrades` 直接基于按 `settings.parseAmbiguousBars` 构建的 `MathTree` 工作：
     - 开启时，同层偶数 `|` 与 `∥` 配对为 `delim` `BracketObject`，含大符号或嵌套定界符时自动升级；奇数 `|` / `∥`（如 `P(A|B)`、`\|a` 等）保持 `AtomObject` 绝不误触发；
     - 关闭时，`|` 全量退化为 `AtomObject` 不再配对，因此 `|\frac{1}{2}|` 不再自动升级；`\|...\|` 仍正常配对并支持自动升级。
   - `\left|...\right|`、`\left\|...\right\|`、`\bigl|...\bigr|`、`\|\text{\sum}\|` 等受保护对象维持不变。
3. **文案与文档同步**：
   - 更新 `src/i18n/zh.ts`、`src/i18n/en.ts` 中的 `settings.special.autoSizeParens.desc` 及 `REQUIRMENT.md` §2.1.4，明确说明支持 `(...)` 及 `|...|` / `\|...\|` / `∥...∥`。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_21~30/PLAN_24.md`：本计划文档。

### 修改
- `src/parser/autoDelimResolver.ts`
- `src/i18n/zh.ts`、`src/i18n/en.ts`
- `REQUIRMENT.md`
- `tests/parser/autoDelimResolver.test.ts`

---

## 4. 验证方式

- 运行 `npm run typecheck`、`npm test`、`npm run build` 全部通过，`npm run lint` 无新增告警。
- 在 `tests/parser/autoDelimResolver.test.ts` 覆盖 `\|...\|`、`∥...∥`、`|...|`、嵌套级联 `(\|\frac{1}{2}\|)` / `\|(x)\|`、`parseAmbiguousBars` 开关联动、奇数竖线与 `\bigl|\bigr|` / `\text{}` 保护及光标重映射。
- 同步构建产物至 `C:\Users\Administrator\Desktop\TestObsidian` 供真机验证。

---

## 5. 回退方案

- 回退 `src/parser/autoDelimResolver.ts`、`src/i18n/*`、`REQUIRMENT.md` 与 `tests/parser/autoDelimResolver.test.ts` 至修改前状态并重新构建即可恢复。
