# PLAN 4 — 三轨智能输入引擎、输出Unicode转换层与规则管理面板

日期：2026-11-22

## 1. 需求与根因

- **需求**：在已落地的结构化解析内核（`MathTree`）、整体删除（`PLAN 1`）与平面对象跳转（`PLAN 3`）之上，开发统一、可扩展且支持深度自定义的**智能输入模块**，具体包含：
  1. **三轨合一规则系统**：同时支持**纯替换（`text`）**、**正则（`regex`）** 与 **JavaScript（`js`）**，官方默认规则与用户自定义规则走完全同一套接口；
  2. **官方默认规则包（暂不含矩阵模板）**：参考 `sources/data_input.md` 与 `sources/data.json` 重新设计符合直觉且零前缀冲突的触发词，全部默认走 `auto` 自动触发，按语义合理分流至 `text` / `regex` / `js`；
  3. **三档输出Unicode转换层**：支持一键切换 `标准 LaTeX`（默认）/ `Unicode 符号` / `按规则原样`，**绝不修改 `rules.json`**，仅在输出阶段基于词法进行可逆转换（本次明确不包含整篇文档/公式块批量互转命令）；
  4. **单文件规则管理与严格校验**：所有规则统一保存于 `rules.json`；不允许保存不完整或语法非法规则；每条规则支持独立开关与复杂绑键（`auto` / 触发词 + 确认键 / 组合键及二段连按）；
  5. **设置面板与实时 MathJax 预览**：每行统一「拖拽排序 + 1 开关 + 2 按钮（编辑/绑键、删除）+ 右侧懒渲染 MathJax 预览」；纯替换支持行内编辑，正则与 JS 点开弹窗编辑（JS 内置多行编辑与实时示例试跑沙盒）。
- **根因与旧方案痛点**：
  - 原 `easy-typing-obsidian` 完全依赖正则表达式（365 条），导致为躲避命令冲突出现 `cOs`/`lOg`/`mOd` 等别名、无法感知 `\text{}`/`\begin{}`/正在手写 `\cmd` 上下文，且在输出切换时无法无损处理。

---

## 2. 目标语义与方案

### 2.1 四层模块划分
1. **纯输入引擎（`src/input/`，零 Obsidian/DOM 依赖）**：
   - `types.ts`：统一规则、上下文 `InputRuleContext`、`RuleAction` 与 3 档 `OutputDialect` 类型契约；
   - `keybindUtils.ts` & `validation.ts`：复杂快捷键/二段连按归一化，以及覆盖触发头、替换效果、正则编译与 JS 语法的严格完整性校验；
   - `commandCatalog.ts`：汇总已知 LaTeX 命令与全前缀表，供命令补空格与用户 JS 规则复用；
   - `dialectConverter.ts`：复用 `tokenizeMath` 实现词法级 `latex` / `unicode` / `raw` 转换（保护 `\left`/`\right` 定界符、`\begin`/`\end`、`\text{}` 与 `\bigcup`/`\bigcap`，支持 `\mathbb{R} ↔ ℝ` 折叠与 UTF-16 精确光标偏移重映射）；
   - `contextBuilder.ts`、`ruleCompiler.ts`、`ruleEngine.ts`：复用 `MathTree` 构建上下文与 `prevObject`/`currentSlot`，按列表顺序编译索引并执行 `auto` / `confirm` / `hotkey` 与预览求值（JS 全程 `try/catch` 隔离）；
   - `defaultJsRules.ts` & `defaultRules.ts`：9 条高杠杆 JS 规则 + 16 条正则规则（含 3 条跨方言链式箭头）+ 全套零前缀冲突纯替换规则。
2. **CM6 集成层（`src/editor/`）**：
   - `mathRegion.ts` 增加 YAML Frontmatter 判定；
   - `smartInput.ts` 通过 `Prec.highest(EditorView.inputHandler)` 处理 `auto`（单步原子事务 `isolateHistory.of("full")` + `userEvent: "struct-latex.input"`），通过 `Prec.highest(EditorView.domEventHandlers({ keydown }))` 处理 `confirm` 与 `hotkey`（含二段连按超时与 `Escape` 取消，未命中完整放行 `smartJump`/原生按键）；
   - `smartBackspace.ts` 与 `smartJump.ts` 接入总开关判断。
3. **单文件持久化与设置 UI（`src/settings/` & `styles.css`）**：
   - `ruleStore.ts`：通过 `app.vault.adapter` 跨端读写插件目录 `rules.json`（无 BOM UTF-8），保存与导入前强制校验；
   - `mathPreview.ts`：`loadMathJax` + `renderMath` + `finishRenderMath` 配合 `IntersectionObserver` 懒渲染；
   - `ruleRowRenderer.ts`、`ruleEditModal.ts`、`settingTab.ts`：三类规则统一单行操作区（1 开关 + 2 按钮）、纯替换行内失焦校验、正则/JS 编辑弹窗与 JS 示例试跑、导入/导出/重置与拖拽排序。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_4.md`：本计划文档。
- `src/input/types.ts`、`keybindUtils.ts`、`validation.ts`、`commandCatalog.ts`、`dialectConverter.ts`、`contextBuilder.ts`、`ruleCompiler.ts`、`ruleEngine.ts`、`previewEvaluator.ts`、`defaultJsRules.ts`、`defaultSymbolRules.ts`、`defaultRules.ts`：纯输入引擎与默认规则包。
- `src/editor/smartInput.ts`：CM6 智能输入与复杂绑键拦截器。
- `src/settings/ruleStore.ts`、`mathPreview.ts`、`ruleModals.ts`、`ruleModalFields.ts`、`ruleEditModal.ts`、`ruleRowRenderer.ts`、`settingToolbar.ts`、`settingTab.ts`：持久化与设置面板 UI。
- `styles.css`：插件设置面板与编辑弹窗样式。
- `tests/input/ruleEngine.test.ts`、`tests/input/defaultRules.test.ts`：输入引擎与官方规则包全量自动化测试。

### 修改
- `src/editor/mathRegion.ts`：新增 Frontmatter 上下文识别。
- `src/editor/smartBackspace.ts`、`src/editor/smartJump.ts`：支持配置总开关读取。
- `src/main.ts`：加载 `data.json` 与 `rules.json`，注册输入扩展与设置页。
- `REQUIRMENT.md`、`GEMINI.md`：实现与验收完成后同步更新文档。

---

## 4. 验证方式

1. **类型检查、自动化单测与构建**：`npm run typecheck`、`npm test`、`npm run build` 全通过，确认 `main.js` 未内联 `obsidian` / `@codemirror/*` / `@lezer/*`。
2. **自动化审计**：程序化验证所有官方 `auto` 纯替换触发词零严格前缀冲突、全部官方规则通过 `validateRule` 且三档方言预览无报错、JS 规则与跨方言链式升级覆盖全量场景。
3. **Obsidian 真机验收（`C:\Users\Administrator\Desktop\TestObsidian`）**：同步 `manifest.json`、`main.js`、`styles.css`，停用 `easy-typing-obsidian`，实测 `rules.json` 生成、三档输出切换、设置页编辑/报错拦截/MathJax 预览、公式实时输入、`Ctrl+Z` 单步撤销、与 `Tab`/`Backspace` 联动及 IME 合成态放行，控制台零报错。

---

## 5. 回退方案

- 若需回退至 `PLAN 3` 状态，移除新增的 `src/input/`、`src/settings/`、`src/editor/smartInput.ts`、`tests/input/`、`styles.css`、`PLAN/PLAN_4.md`，并通过 `git checkout -- src/editor/mathRegion.ts src/editor/smartBackspace.ts src/editor/smartJump.ts src/main.ts REQUIRMENT.md GEMINI.md` 恢复既有代码与文档后重新运行 `npm run build`。
