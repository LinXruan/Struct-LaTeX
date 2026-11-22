# Struct LaTeX 需求规格说明书（REQUIRMENT）

> 本文档为 `struct-latex` 的实时需求与设计规格，结合核心书写习惯及已完成落地的解析引擎架构持续校准。

---

## 1. 项目定位与核心设计公理

### 1.1 定位与历史痛点根治
`struct-latex` 是面向 Obsidian CodeMirror 6（CM6）的**结构化 LaTeX 编辑插件**。插件放弃正则表达式方案，从根本上解决原 `easy-typing-obsidian` 规则库（365 条转换 + 101 条删除）的三大缺陷：
1. **无嵌套上限与拼写隐患**：不再依赖硬编码展开 2~3 层嵌套正则；
2. **数学区隔离与手写友好**：默认仅在数学公式区域（`$...$`、`$$...$$`、`\(...\)`、`\[...\]`）生效，绝不阻断手写 `\left`、`\frac` 等命令；
3. **无全局扫描误判**：复用 CM6 `syntaxTree(state)` 判定数学模式，杜绝正文孤立 `$$` 翻转全文数学状态的问题。

### 1.2 核心设计公理（零特例、最低复杂度）
1. **万物皆对象**：数学块内所有语法单元统一归为 3 类对象：
   - **`BracketObject`（广义括号）**：普通/Unicode/混合定界符（`(...)`、`[...]`、`[...)`、`⟨...⟩` 等）、`\left<d>...\right<d>`、任意 `\begin{env}...\end{env}`、带参命令（`\frac{}{}`、`\sqrt[]{}`、`\mathbf{}` 等）、带花括号上下标（`_{...}`、`^{...}`）。
   - **`WordObject`（原子词）**：无槽控制序列（`\sin`、`\alpha`、`∑`、`\limits`）、复合对齐换行符（`\\`、`\\ =&`、`\\ ⇔&` 等）、无花括号单 Token 上下标（`_2`、`^n`、`_\alpha`）。
   - **`AtomObject`（单字符对象）**：单字母、单数字、单运算符；裸单竖线 `|` 与裸 `<`、`>` 按普通单字符处理，不参与括号配对。未配对括号降级为普通 `AtomObject`。
2. **统一空白模型**：
   - 空格（` ` / `\t`）与换行符（`\n` / `\r\n`）一视同仁合并为 `whitespace`。
   - 除文本模式槽位（`\text{}`、`\textrm{}`、`\textbf{}`、`\textit{}`、`\mbox{}`）外，空白一律跟随其**前驱实体**：前对象吸收尾随空白 `[coreTo, to]`，括号槽位左开界吸收槽内前导空白 `[openCoreTo, bodyFrom]`。
3. **唯二结构关系**：
   - **嵌套包含（`Parent → Child`）**：父 `BracketObject` 的 `[from, to]` 天然包住所有槽位子对象。
   - **单向星形并联（`Host → Dependent`）**：后缀（`_{...}`、`^{...}`、`_1`/`_\alpha`、`\limits`/`\nolimits`、`'`）单向挂载到同一根宿主 `rootHost`；并联后缀之间互不相连。
4. **事务与撤销原则**：
   - 文档改写（结构删除、智能输入、块尾外跳补空格/换行）以单步原子事务提交（`isolateHistory.of("full")` + 专属 `userEvent`），支持 `Ctrl+Z` 一步撤销；
   - 纯光标移动不改文档，不污染撤销栈。

---

## 2. 智能输入（Smart Input，已实现三轨统一引擎，暂不含矩阵填充模板）

> 详见 [PLAN_4.md](PLAN/PLAN_4.md)。官方默认规则与用户自定义规则共享**同一套三轨引擎（纯替换 `text` / 正则 `regex` / JavaScript `js`）** 与单文件 `rules.json`，默认全部走 `auto` 自动触发，支持单条启停、复杂绑键（`auto` / 确认键 / 组合键与二段连按），并通过**三档输出Unicode转换层**（默认 `标准 LaTeX` / `Unicode 符号` / `按规则原样`）在不修改 `rules.json` 的前提下切换输入输出风格。矩阵内容模板（`ju<...>` / `vx<...>` / `cx<...>`）与文档全文互转按钮暂未纳入本期实现。

### 2.1 三轨规则引擎与自定义体验
1. **统一接口与严格校验**：三类规则统一存储于插件目录 `rules.json`；任何缺触发头、缺替换效果、无效正则或 JS 语法错误一律禁止落盘。
2. **结构感知上下文（`InputRuleContext`）**：JS 规则直接复用 `MathTree`（含 `prevObject`、`currentSlot`、`inTextMode`、`inCommandTyping`、`inEnvName` 与 `helpers.isKnownCommand` / `isCommandPrefix`），全程 `try/catch` 异常隔离。
3. **三档输出Unicode转换层（`dialectConverter.ts`）**：基于 `tokenizeMath` 在输出落盘前完成词法级转换与 UTF-16 精确光标偏移重映射，保护 `\left`/`\right` 定界符、`\begin`/`\end`、`\text{}` 与 `\bigcup`/`\bigcap`，链式箭头（`<->` / `<=>` / `<==`）跨方言无缝兼容。
4. **设置面板与 MathJax 预览**：支持顶部全局「跟随 Obsidian / 简体中文 / English」实时语言切换，下方按**「智能输入设置」「结构删除设置」「光标跳转设置」**三大类页签分区展示；「智能输入设置」包含启用开关、输出风格、复合筛选（搜索 + 分组 + 可并列点亮 `JS`/`正则`/`纯替换` 按钮）、Pointer Events 半透明让位拖拽排序、行级 DOM 复用与分帧缓存 MathJax 预览；每行统一「拖拽排序 + 类型与触发徽章 + 1 启停开关 + 2 按钮（文字「编辑」按钮、图标删除按钮）+ 右侧懒渲染 MathJax 预览」；纯替换支持行内编辑，正则、JS 与高级绑键均在设置页内切换为页内编辑子视图（内置实时示例试跑沙盒），导出/导入/恢复默认在工具栏下方原地展开内联面板，避免移动端叠层弹窗闪烁。

### 2.2 官方默认规则概览（全 `auto`、零前缀冲突）
- **JavaScript 规则（9 条）**：`js-math-delim`（`$` / `￥` 按前字补空格成对生成、空 `$|$` 升级 `$$\n|\n$$`，跳过代码块/YAML/转义 `\$`）、`js-bold-greek`（`;;<ch>`）、`js-font-bb`（`bb<L>` 自动大写 `\mathbb`）、`js-font-cal`（`cal<L>` 自动大写 `\mathcal`）、`js-big-op-5mode`（`sm`/`pd`/`bu`/`bn` 五模式）、`js-integral`（`it` 五模式）、`js-limit`（`lm` 五模式）、`js-eval-bar`（`er|`/`el|` 族）与 `js-cmd-space`（命令后防打断补空格，绝不打断 `\left` / `\sinh`）。
- **正则规则（16 条）**：3 条跨方言链式箭头（`<->` / `<=>` / `<==`）、单字母字体 `bf`/`bm`/`rm`、导数/偏导 `dd`/`pp`、带下标范数 `lv`/`nv`、快捷单字上下标 `pw`/`sb`、内置算子 `(dim|deg|gcd|ker|det|max|min|sup|inf)` 与 `(rank|Im|adj|span|card)`。
- **纯替换规则**：希腊字母（`;a`–`;W`、`pi`）、修饰容器（`mbf`/`mrm`/`mbm`/`mcal`/`mbb`/`bar`/`hat`/`vec`）、自动/普通定界符（`lr(`..`lrv`、`l[)`/`l(]`、`;(`..`;<`、`flr`/`cel`/`nrm`）、分式根式上下标（`/`、`nsq`、`sq`、`^`、`_`、`inv`）、函数名（`arcsin`..`csc`/`ln`/`log`/`exp`/`mod`/`ide`）、孤立大算子/运算/关系/集合/逻辑/省略号/箭头、多行环境空壳（`cases`/`align`/`matb`/`matv`/`matp`）与复合对齐换行（`\\=`/`\\~`/`\\>`/`\\<`/`\\e`）。

---

## 3. 智能光标跳转（已实现 `Tab` 基础地基）

> 详见 [PLAN_3.md](PLAN/PLAN_3.md)。当前版本采用**纯粹对象哲学 + 细粒度单步跳转 + 真光标移动**路线，由 `Tab` 触发；未来通过键位绑定扩展 `o` 键、可选跨槽跳出或 `Shift+Tab` 反向跳转。

### 3.1 核心跳转语义
将对象树按文档先序展开为有序平面段 `JumpSegment[]`（每段由实体区间 `[coreFrom, coreTo)` 与尾随空白 `[coreTo, to]` 构成）：

1. **光标在对象实体内（`relPos < seg.coreTo`）**：跳至该段末端 `seg.to`（包含吸附的空白）：
   - 实心对象：`\s|in   (1+2)` → `\sin   |(1+2)`；`a|_2^n` → `a_2|^n`；`a_|\alpha` → `a_\alpha|`。
   - 括号开界：`\sin |(   1+2)` → `\sin (   |1+2)`；`\frac|{a}{b}` → `\frac{|a}{b}`。
   - 括号槽间与闭界：`\frac{a|}{b}` → `\frac{a}{|b}`；`\left(1+2|\right)   +3` → `\left(1+2\right)   |+3`。
2. **光标在空白内（`seg.coreTo <= relPos <= seg.to`）**：视为已站稳当前对象最右端，直接跳过该空白作用于**下一段**（满足 `next.coreTo > relPos`）：
   - 尾随空白内：`\sin  |  (1+2)` → `\sin    (|1+2)`。
   - 开界前导空白内：`\sin (  | 1+2)` → `\sin (   1|+2)`。
   - 多行环境换行与缩进：`\begin{cases}\n  x \\|\n  y\n\end{cases}` → 跨过 `\n  ` 并跳至 `y|`。
3. **纯对象两步跳（无跨层特判）**：
   - `\left\Vert x|\right\Vert_{2}` 按两次 `Tab`：先出 `\right\Vert|`，再进 `_{|`；`∑_{k}^{n}` 逐段步进。
4. **数学块末尾外跳**：当光标后已无未跨越的实体段且数学块已闭合时：
   - **行内公式（`$...$` / `\(...\)`）**：右侧已有水平空格则纯移至空格后；否则插入单个 `" "` 并移动光标至其后。
   - **块级公式（`$$...$$` / `\[...\]`）**：闭合标记后已有换行则移至下一行行首；否则插入 `"\n"` 并移至新行行首。
5. **安全降级**：非数学区、只读、IME 合成态、多光标或非空选区时返回 `false`，完整交还原生 `Tab`（列表/代码块缩进等）。

### 3.2 按键绑定与输入劫持优先级
- **可配置按键绑定**：在设置页「光标跳转设置」与「结构删除设置」中支持自定义触发按键（文本框手填 + 按键录制 + 恢复默认，默认分别为 `Tab` 与 `Backspace`）。
- **按键输入劫持说明**：结构删除与光标跳转统一通过 `Prec.highest` `keydown` 劫持介入，注册优先级高于智能输入模块——命中结构条件时优先拦截该按键（因此绑定可打印键或复用键时会阻断智能输入中的纯替换、正则、JavaScript 规则及同键确认/快捷键）；未命中结构条件时完整放行。

---

## 4. 结构化整体删除（`Backspace`，已实现）

> 详见 [PLAN_1.md](PLAN/PLAN_1.md) 与 [PLAN_3.md](PLAN/PLAN_3.md)。空选区且处于数学模式时，通过**「对象触发位命中 + 单向传递闭包」**一次性整块删除，取代所有正则删除规则。

### 4.1 统一删除规则
1. **单向关联传递闭包**：
   - 删宿主时沿 `Parent → Child` 与 `Host → Dependent` 传递删除所有子孙及并联挂载后缀（`a|_{2}^{3}` → `|`、`\begin{bmatrix}|1&2\end{bmatrix}_{1}^{2}` → `|`、`\lim|\limits_{x→0}` → `|`）；
   - 删后缀时**绝不反向删宿主**，且并联后缀互不波及（`a_{2}|^{3}` → `a|^{3}`、`a_{2}^{3}|` → `a_{2}|`、`∑_{k=1}^{n}|` → `∑_{k=1}|`）。
2. **显式触发位白名单**（未命中白名单一律回退原生 `Backspace`，保护拼写与数字自由编辑）：
   - `AtomObject` / `WordObject`：实体末尾与尾随空白 `[coreTo, to]`（如 `a   |`、`\sin |`、`a_\alpha|`、`\\ =& |`）。其中 `a_|1`、`\si|n`、`\begin{bmat|rix}`、`1234|` 均回退原生逐字删除。
   - `BracketObject`：
     - 命令头与首槽之间 `[headTo, slots[0].openFrom]`（如 `\frac|{a}{b}`、`\sqrt|[n]{x}`、彻底根治残留 `{a}{b}` 的缺陷）；
     - 各槽左开界含前导空白 `[openCoreTo, bodyFrom]`（如 `\left(   |a\right)`、`\begin{bmatrix}\n  |1\end{bmatrix}`、`\frac{|a}{b}`）；
     - 槽间间隙 `[slot[s].closeTo, slot[s+1].openFrom]`（如 `\frac{a}|{b}`、`\sqrt[n]|{x}`）；
     - 整体闭界含尾随空白 `[coreTo, to]`（如 `\left(a\right) |`、`\frac{a}{b}|`）。
3. **空白跟随与安全边界**：
   - 非文本模式下，删除前对象会连带清空其尾随的水平空格与换行（如 `a + b\n    |c` → `a + |c`）；`\text{...}` 等文本模式槽内关闭空白合并；
   - 裸单竖线 `|` 与未配对括号降级为普通单字符对象，绝不误删；
   - 空数学块边界清理：`$|$`、`$$|`（独立空行）、空白 `$$...$$` 整块一步删除；
   - 快路径退化：若计算出的删除跨度恰好为 `[pos - 1, pos]`，直接返回 `false` 交还原生 `Backspace`。

---

## 5. 程序化解析引擎架构与质量要求

### 5.1 四层解耦架构
1. **Layer 1：数学区域判定与缓存（`src/editor/mathRegion.ts`）**
   - 基于 CM6 `syntaxTree(state)` 判定数学上下文，局部窗口扫描单数学块 `[blockFrom, blockTo]` / `[contentFrom, contentTo]`（熔断上限：`10,000` 字符 / `200` 行），通过 `WeakMap<Text, AnalyzedMathBlock>` 按不可变文档对象缓存 `tree` 与 `jumpSegments`。
2. **Layer 2：词法分词器（`src/parser/tokenizer.ts`）**
   - 单遍线性扫描为有序 Token 流（支持 UTF-16 代理对、统一 `whitespace`、`\left`/`\right`、`\begin`/`\end`、复合对齐换行 `align_break`、控制序列、上下标与单字符）。
3. **Layer 3：栈匹配与对象关系树（`src/parser/matcher.ts`、`objectFactory.ts`、`bracketBuilders.ts`、`builder.ts`）**
   - $O(N)$ 强作用域隔离配对栈（`\begin...\end`、`\left...\right`、`{...}` 隔离内部普通括号，支持混合区间 `[0,1)`，未配对降级）；
   - 递归构建 `BracketObject` / `WordObject` / `AtomObject`、槽位前导/尾随空白区间与星形并联依赖图。
4. **Layer 4：统一结构查询接口（`src/parser/deleteResolver.ts`、`jumpResolver.ts`）**
   - `resolveStructuralDelete(tree, relPos)`：最深最窄触发位命中 + 单向传递闭包；
   - `resolveStructuralJump(tree, relPos, cachedSegments)`：先序展平 `JumpSegment[]` + $O(\log N)$ 二分查找。

### 5.2 质量、性能与安全约束
- **性能**：纯解析层零 Obsidian/DOM 依赖；单次触发局部解析 `< 1 ms`，连续按键命中缓存近零开销。
- **安全**：`readOnly`、`view.composing`（IME 合成态）、多光标、非空选区一律放行原生；仅依赖 `obsidian` / `@codemirror/*` / `@lezer/*` 外部运行库，兼容桌面端与移动端。
- **可扩展性（规划中）**：设置页支持开关各功能模块、自定义跳转键与触发规则、切换 Unicode / 标准 LaTeX 风格，并支持热更新。
