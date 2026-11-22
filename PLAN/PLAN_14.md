# PLAN 14 — 新增「矩阵类」默认输入规则体系（矩阵、行列式、向量与特征模板）

日期：2026-11-23

## 1. 需求与背景

- **需求**：补充默认模板中缺失的矩阵与行列式相关输入逻辑，并在规则分组中单独设立**「矩阵类」**（英文 `Matrix`）分类，统一收拢矩阵与行列式规则，兼顾直觉记忆、零前缀冲突、三档输出风格兼容、`Tab` 逐格跳转与设置页 MathJax 预览。
- **现状缺口**：
  1. `defaultSymbolRules.ts` 中仅有 `matb` / `matv` / `matp` 三个空环境壳子，且混在「多行环境与对齐」分组中；
  2. 缺少无括号 `matrix`、花括号 `Bmatrix`、双竖线范数 `Vmatrix`、行内 `smallmatrix` 及增广矩阵环境；
  3. 缺少按行列维数生成空网格（如 2×2/3×3 矩阵、2/3 阶行列式、增广矩阵）、单位矩阵、对角矩阵、符号矩阵/行列式（`ju<...>` 族）、行列向量（`vx<...>` / `cx<...>`）、范德蒙德行列式与雅可比矩阵/行列式。

---

## 2. 目标语义与方案

1. **独立模块与分组（`src/input/defaultMatrixRules.ts`）**：
   - 将原 `env-bmatrix` / `env-vmatrix` / `env-pmatrix` 迁入独立文件 `src/input/defaultMatrixRules.ts`，所有规则统一归属分组 **`"矩阵类"`**（`defaultRuleLabels.ts` 映射为 `"Matrix"`）。
2. **四层「矩阵类」规则体系（共 16 条规则，零前缀冲突，全 `wordBoundary: true`）**：
   - **基础矩阵与行列式空壳（9 条 `text` 规则）**：
     - `matb`（`bmatrix` 方括号矩阵）、`matp`（`pmatrix` 圆括号矩阵）、`matv`（`vmatrix` 行列式）、`matB`（`Bmatrix` 花括号矩阵）、`matV`（`Vmatrix` 双竖线矩阵）、`matm`（`matrix` 无括号矩阵）、`mats`（`smallmatrix` 行内小矩阵）、`mata`（`\left[\begin{array}{c|c}...\end{array}\right]` 增广矩阵）、`dmat`（3×3 对角矩阵骨架）。
   - **指定维数矩阵与行列式网格（`js-matrix-grid`）**：
     - 触发式 `m([bpvBVmsa])([1-9])([1-9])$`（如 `mb23` 2×3 方括号矩阵、`mp33` 3×3 圆括号矩阵、`mv22`/`mv33` 2/3 阶行列式、`ma34` 3×4 增广矩阵、`ms22` 2×2 行内小矩阵）。
     - 排版对齐 `Tab` 逐格跳转：生成后光标 `$0` 落于 `(1,1)`，按 `Tab` 顺序遍历所有单元格后跳出环境。
   - **单位矩阵（`js-matrix-identity`）**：
     - `eye2`..`eye6` 生成 2~6 阶单位阵；`eyen` 生成带 `\cdots`/`\vdots`/`\ddots` 的 `n` 阶单位阵。
   - **符号矩阵/行列式、向量、对角阵与经典行列式（5 条 `js` 规则）**：
     - `ju<sym>` / `ju<sym,m>` / `ju<sym,m,n>`（`bmatrix`）、`jup<...>`（`pmatrix`）、`juv<...>`（`vmatrix` 符号行列式）；
     - `vx<sym>` / `vx<sym,n>` / `vxp<...>`（列向量）与 `cx<sym>` / `cx<sym,n>` / `cxp<...>`（行向量）；
     - `diag<sym>` / `diag<sym,n>` / `diagp<...>`（符号对角矩阵）；
     - `vdm<sym>` / `vdm<sym,n>`（范德蒙德行列式）；
     - `jac<y,x>` / `jac<y,x,m,n>` / `jacv<...>`（雅可比矩阵与雅可比行列式）。
3. **MathJax 空矩阵/空单元格预览增强（`src/input/previewEvaluator.ts`）**：
   - 在 `formatTexForMathJax` 中补充 `matrix|Bmatrix|Vmatrix|smallmatrix` 空环境占位，并将矩阵/array 环境中的空白单元格渲染为 `\square`（仅作用于预览 TeX，不改变 `rawOutput` 与实际插入内容），使 `matB`、`mb22`、`mv33`、`mata`、`dmat` 在设置页呈现清晰的方框矩阵预览。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_14.md`：本计划文档。
- `src/input/defaultMatrixRules.ts`：「矩阵类」默认规则定义（空壳 + 7 条高杠杆 JS 生成规则）。

### 修改
- `src/input/defaultSymbolRules.ts`：移出原 `env-bmatrix` / `env-vmatrix` / `env-pmatrix`（已迁至 `defaultMatrixRules.ts`）。
- `src/input/defaultRules.ts`：引入并组装 `MATRIX_RULES`。
- `src/input/defaultRuleLabels.ts`：新增 `"矩阵类": "Matrix"` 分组映射与全套英文规则名称映射。
- `src/input/previewEvaluator.ts`：完善空矩阵与矩阵空单元格的 MathJax 预览占位渲染。
- `tests/input/defaultRules.test.ts`：补充「矩阵类」规则分组校验、各类矩阵/行列式/向量/网格输入测试、`Tab` 逐格跳转兼容与方言转换测试。
- `REQUIRMENT.md`：更新 §2.2 默认规则概览，补充「矩阵类」独立分组与规则体系说明。

---

## 4. 验证方式

1. 运行 `npm run typecheck`、`npm test`、`npm run build`，验证零类型错误、前缀碰撞审计全绿、三档方言预览全绿、双语本地化无残留中文、生产打包成功且 `src/` 单文件 ≤ 300 行。
2. 同步 `manifest.json`、`main.js`、`styles.css` 至 `C:\Users\Administrator\Desktop\TestObsidian\.obsidian\plugins\struct-latex\`，供真机验证设置页「矩阵类」分组筛选、MathJax 预览及各类矩阵/行列式输入。

---

## 5. 回退方案

- 删除 `PLAN/PLAN_14.md` 与 `src/input/defaultMatrixRules.ts`，并通过 `git checkout -- src/input/defaultSymbolRules.ts src/input/defaultRules.ts src/input/defaultRuleLabels.ts src/input/previewEvaluator.ts tests/input/defaultRules.test.ts REQUIRMENT.md` 恢复，重新运行 `npm run build` 并同步测试仓库即可无损回退至 `PLAN 13` 状态。
