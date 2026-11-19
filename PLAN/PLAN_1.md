# PLAN 1 — 插件工程骨架与智能结构化解析删除引擎（MVP）

日期：2026-11-19

## 1. 需求与根因

- **痛点**：原 `easy-typing-obsidian` 依赖 101 条手工展开正则实现 LaTeX 删除，仅支持 2–3 层硬编码嵌套，易产生拼写缺陷与残缺源码（如 `REQUIRMENT.md` 实测 `3e2` 中 `\frac|{a}{b}` 删除后残留 `{a}{b}`）；旧原型插件的全局奇偶 `$$` 扫描会被正文孤立 `$$` 翻转状态。
- **本期目标**：搭建 Obsidian `struct-latex` 最小插件工程骨架，并落地基于**「统一对象 + 关系树」**的非正则智能结构化解析删除模块（`Backspace`），同时确保核心关系树天然可复用给后续 `o` / `Tab` 跳转模块。
- **范围裁剪**：经确认，最终成品取消 `mm//` 后置分式指令；本期聚焦工程骨架 + 智能解析删除，暂不包含智能输入展开与 `o` / `Tab` 跳转。

---

## 2. 目标语义与架构方案

### 2.1 核心公理：万物皆对象 + 唯二关系 + 传递闭包

1. **统一本体（`LatexObject`）**：数学块内所有语法单元本质平等，分为 3 种对象：
   - **`BracketObject`（广义括号）**：含单槽括号（`(...)`、`[...]`、`[...)`、`(...]`、`\{...\}`、`\|...\|`、`∥...∥`、`⟨...⟩`、`⌊...⌋`、`⌈...⌉`、`\left<d>...\right<d>`、`\begin{env}...\end{env}`、单槽命令 `\mathbf{x}`、`_{...}`、`^{...}`、无花括号单 Token `_1`/`^2`/`_\alpha`）与联括号（`\frac{a}{b}`、`\sqrt[n]{x}` 等）。
   - **`WordObject`（原子词）**：无嵌套槽位的控制序列或复合符（如 `\sin`、`\alpha`、`∑`、`\limits`、`\nolimits`、`\\`、`\\ =&`、`\\ ⇔&` 等）。
   - **`AtomObject`（单字符对象）**：普通单字母、单数字、单运算符（不合并多位数如 `1234`）；裸单竖线 `|` 与裸 `<`、`>` 一律视作普通单字符对象，不参与括号配对。
2. **唯二结构关系**：
   - **嵌套（Containment）**：父 `BracketObject` 的 `slots[]` 包含内部子对象（删除传播方向：`Parent → Child`）。
   - **关联（Association）**：
     - **双向关联（强关联）**：联括号各槽与头命令绑定为同一 `BracketObject`（如 `\frac{A}{B}`、`\sqrt[n]{x}`），命中任一允许触发位即整体删除。
     - **单向关联（条件关联）**：后缀对象（`_{...}`、`^{...}`、单 Token `_x`/`^x`、`\limits`/`\nolimits`、`'`）单向附着在左侧宿主 `Host` 上（删除传播方向：`Host → Dependent`，**绝不反向删除宿主**）。
     - **并联约束**：挂载在同一宿主的多个并列后缀（如 `a_{1}^{2}` 中的 `_{1}` 与 `^{2}`）各自并联指向 `Host`，彼此间无传播边。
3. **传递闭包删除**：
   - 光标按 `Backspace` 时，定位被触发的 **1 个对象 `target`**，沿 `Parent → Child` 与 `Host → Dependent` 求传递闭包，一次性原子删除闭包覆盖跨度 `[minFrom, maxTo]`。
   - 典型语义（`|` 为光标）：
     - `\begin{bmatrix}1&2\\3&4\end{bmatrix}_{1}^{2}|` → `\begin{bmatrix}1&2\\3&4\end{bmatrix}_{1}|`
     - `\begin{bmatrix}1&2\\3&4\end{bmatrix}_{1}^{|2}` → `\begin{bmatrix}1&2\\3&4\end{bmatrix}_{1}|`
     - `\begin{bmatrix}1&2\\3&4\end{bmatrix}_{1}|^{2}` → `\begin{bmatrix}1&2\\3&4\end{bmatrix}|^{2}`
     - `\begin{bmatrix}1&2\\3&4\end{bmatrix}_{|1}^{2}` → `\begin{bmatrix}1&2\\3&4\end{bmatrix}|^{2}`
     - `\begin{bmatrix}1&2\\3&4\end{bmatrix}|_{1}^{2}` → `|`
     - `\begin{bmatrix}|1&2\\3&4\end{bmatrix}_{1}^{2}` → `|`
     - `a|_{2}^{3}` → `|`；`a_{2}^{3}|` → `a_{2}|`；`∑_{k=1}^{n}|` → `∑_{k=1}|`；`\lim|\limits_{x→0}` → `|`。

### 2.2 空格处理策略（方案 1：完全跟随前对象）

- **先分词、后吸附**：词法阶段先独立切分 Token（保障 `\sin a` 绝不误识别为 `\sina`），建对象时把紧邻的**同行水平空格（` ` / `\t`）**并入前对象的尾随区间 `[coreTo, to]`。
- **统一效果**：
  - 对象流中无游离空格对象，`a _{2}   ^{3}` 天然紧邻挂载，单向关联零额外特判；
  - 删除对象时连同尾随空格一并清空（如 `a   |` → `|`、`\sin |` → `|`、`\begin{bmatrix}...\end{bmatrix} |` → `|`、`a |  ` → `|`）。
- **3 条硬边界**：
  1. 绝不跨 `\n` 换行符吸收（防止上一行末尾对象吞掉下一行缩进）；
  2. 行首与槽位开头的前导空格（如 `\left(   |a\right)`）无同槽前驱对象，保持无归属普通空格交还原生；
  3. 文本模式命令槽（`\text`、`\textrm`、`\textbf`、`\textit`、`\mbox`）内关闭空格跟随。

### 2.3 精确触发位白名单与容错规则

- **显式触发位白名单**（仅在明确允许的位置触发整删，其余位置一律交还原生）：
  - `AtomObject`：本体紧后与尾随空格段 `[coreTo, to]`（如 `a|`、`a   |`、`a |  `）。
  - `WordObject`：词尾与尾随空格段 `[coreTo, to]`（`\sin|` 整删；`\si|n` 允许逐字修改）。
  - `BracketObject`：
    - 各槽左开紧后 `slot.bodyFrom`（如 `\left(|a\right)`、`\begin{bmatrix}|1\end{bmatrix}`、`\frac{|a}{b}`、`\frac{a}{|b}`、`\sqrt[|n]{x}`、`\sqrt[n]{|x}`、`_{|1}`、`^{|2}`、`\mathbf{|x}`）；
    - 整体右闭紧后及尾随空格段 `[coreTo, to]`（如 `\left(a\right)|`、`\frac{a}{b} |`）；
    - 联括号命令头紧后（`\frac|{a}{b}`、`\sqrt|[n]{x}`）及槽间右闭紧后（`\frac{a}|{b}`、`\sqrt[n]|{x}`），根治残壳问题；
    - 环境名内部（`\begin{bmat|rix}`）与命令名内部（`\f|rac`）**不在白名单内**，交还原生自由编辑。
- **命令签名表与兜底**：
  - 内置轻量签名表：2 必选槽（`\frac`/`\dfrac`/`\tfrac`/`\cfrac`/`\binom`/`\dbinom`/`\tbinom`/`\overset`/`\underset`/`\stackrel`/`\textcolor`/`\color`）、可选 `[]` + 1 必选槽（`\sqrt`/`\xrightarrow`/`\xleftarrow`/`\xRightarrow`/`\xLeftarrow`/`\xleftrightarrow`）、1 必选槽常用修饰命令、文本槽命令。
  - 未知 `\foo` 紧跟 `{...}` 时按 1 槽命令处理；紧跟 `[...]` **绝不**误吸为可选参数（避免破坏 `\sin[0,1]`）；否则按 0 槽 `WordObject`。
- **配对与未闭合降级**：
  - 强作用域括号：`\begin{env}...\end{env}`（含环境头参数如 `\begin{array}{cc}`、`\begin{aligned}[t]`）、`\left<d>...\right<d>`（含 `\left.`/`\right.`）、`{...}`。
  - 普通/混合括号（`(...)`、`[...]`、`[...)`、`(...]`）仅在同一强作用域内匹配。
  - **未配对括号一律降级为普通对象**（不生成 `unclosed` 括号节点），保证 AST 中所有 `BracketObject` 100% 完整闭合。
- **快路径与安全兜底**：
  - 若计算出的最终删除跨度恰好为 `[pos - 1, pos]`，返回 `false` 交还原生 Backspace；
  - IME 合成态（`view.composing`）、只读、非空选区（`!sel.empty`）、多光标一律返回 `false`；
  - 外层数学定界符 `$...$` / `$$...$$` 仅在块内为空（`$|$`、`$$|`、`$$\n|\n$$`）时整删；
  - 每次结构删除以原子事务提交：`userEvent: "delete.struct-latex"` + `isolateHistory.of("full")`。

### 2.4 单数学块懒解析与性能保障

- 采用 **单数学块完整关系树（Route 2 作用域化形态）**：
  1. 先用 CM6 `syntaxTree(state)` 判定光标处于数学模式（过滤代码块、行内代码、YAML Frontmatter、转义 `\$`、正文孤立 `$$`）；
  2. 适配 Obsidian HyperMD 扁平 Token 链：从光标向左右沿 `formatting-math-begin` / `formatting-math-end` 扫描拿到当前单数学块 `[mathFrom, mathTo]`，设长度熔断上限（`10_000` 字符 / `200` 行）；
  3. 仅在触发 `Backspace` 时对当前单数学块懒建树，通过 `WeakMap<EditorState, CachedMathBlock>` 缓存，常规公式 `< 0.1 ms`，耗时与 MD 文档总长度解耦。

---

## 3. 文件清单

### 新增（工程骨架）
- `.gitignore`：忽略 `node_modules/`、`main.js`、`.tmp/`、临时日志与测试残留。
- `package.json`：定义 `dev` / `build` / `typecheck` / `test` 脚本与 `devDependencies`（`obsidian`、`@codemirror/*`、`@lezer/*`、`esbuild`、`typescript`、`builtin-modules`）。
- `tsconfig.json`：严格 TypeScript 编译配置。
- `esbuild.config.mjs`：按 `OBSIDIAN_API.md` §1.2 配置 `external`（禁止打包 `obsidian`、`electron`、`@codemirror/*`、`@lezer/*`），输出 `main.js`。
- `manifest.json`：插件元数据（`id: "struct-latex"`、`isDesktopOnly: false`）。
- `scripts/run-tests.mjs`：使用 `esbuild` 临时打包并运行 `node --test`，执行后自动清理 `.tmp/`。

### 新增（纯解析核心，无 Obsidian/DOM 依赖）
- `src/parser/types.ts`：统一对象模型、槽位、触发位与 `MathTree` 类型定义。
- `src/parser/commandTable.ts`：命令参数签名表、文本命令集、定界符与复合换行词定义。
- `src/parser/tokenizer.ts`：词法分词器（含 UTF-16 代理对支持与复合对齐换行词识别）。
- `src/parser/matcher.ts`：Phase A 作用域隔离 O(N) 括号配对栈（强作用域隔离、混合区间支持、未配对降级）。
- `src/parser/objectFactory.ts`：对象构建、未配对字符降级、单向依赖挂载、尾随空格吸附与触发位生成辅助函数。
- `src/parser/bracketBuilders.ts`：环境括号（含头参数）、配对括号（含字母结尾命令定界符如 `\left\Vert ` 的分隔空格处理）、命令联括号与上下标构建器。
- `src/parser/builder.ts`：Phase B 单数学块对象关系树主构建流程。
- `src/parser/deleteResolver.ts`：光标命中判定与传递闭包删除跨度计算器。

### 新增（CM6 / Obsidian 集成层）
- `src/editor/mathRegion.ts`：`syntaxTree(state)` 数学区判定、HyperMD 单数学块边界扫描、熔断保护与 `WeakMap` 缓存。
- `src/editor/smartBackspace.ts`：`Prec.highest(keymap)` 接入、安全守卫、空数学块删除与原子事务派发。
- `src/main.ts`：`StructLatexPlugin` 生命周期与扩展注册入口。

### 新增（自动化测试）
- `tests/parser/structuralDelete.test.ts`：基于 `esbuild` + `node --test` 的纯解析核心单测套件。

### 修改（实现完成后同步）
- `GEMINI.md`：补充落地后的目录结构与常用命令。
- `REQUIRMENT.md`：同步本次设计收口变更（取消 `mm//`、默认单向删除公理、取消裸 `|` 括号判定、方案 1 空格策略）。

---

## 4. 验证方式

1. **类型检查与构建**：
   - `npm run typecheck`（`tsc --noEmit`）零错误；
   - `npm run build` 生成 `main.js`，核对产物未内联 `@codemirror/*` / `@lezer/*` / `obsidian`。
2. **自动化单测（`npm test`）**：
   - 矩阵 + 连续上下标 6 种光标位（含并联互不误删与宿主级联全删）；
   - 嵌套括号连带删除、联括号 `\frac{a}{b}` / `\sqrt[n]{x}` 各触发位及 `\frac|{a}{b}` 残壳修复；
   - 单字符宿主 `a|_{2}^{3}`、`a_1^2`、`∑_{k=1}^{n}|`、`\lim|\limits_{x→0}`、`\left(x\right)'_{0}`；
   - 方案 1 空格跟随（`a _{2}   ^{3}`、`a   |`、`\sin |`、`\begin{bmatrix}...\end{bmatrix} |`）及 3 条硬边界（不跨 `\n`、`\left(   |a\right)`、`\text{hello |}`）；
   - 反例与容错：`\sin[0,1]`、`P(A|B)` 裸 `|`、混合区间 `[0,1)`、未配对 `\left( 1+2` 降级、`\begin{bmat|rix}` 与 `\si|n` 不误删。
3. **Obsidian 真机验收（`C:\Users\Administrator\Desktop\TestObsidian`）**：
   - 停用同类冲突插件（`easy-typing-obsidian` / 旧原型），将 `manifest.json` + `main.js` 同步到测试库 `.obsidian/plugins/struct-latex/`；
   - 启动 `D:\Install\Obsidian\Obsidian.exe`，实测上述典型删除场景、空 `$|$` / `$$\n|\n$$` 删除、正文孤立 `$$` 不误判、非数学区退格、`Ctrl+Z` 单步撤销与中文 IME 合成态退格，确认开发者控制台零报错。

---

## 5. 回退方案

- 本次为从零落地的初始工程骨架与首个核心模块，尚未修改任何已有业务代码；若方案验证不通过或需中止：
  - 通过 `git checkout -- GEMINI.md REQUIRMENT.md` 还原文档改动，并移除新增的工程文件、`src/` 与 `tests/` 目录即可无损回到初始文档状态；
  - 测试仓库侧仅需移除 `.obsidian/plugins/struct-latex/` 下的调试产物即可恢复环境。