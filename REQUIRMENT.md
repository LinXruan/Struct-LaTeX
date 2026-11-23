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
   - **`BracketObject`（广义括号）**：普通/Unicode/混合定界符（`(...)`、`[...]`、`[...)`、`⟨...⟩` 等）、`\left<d>...\right<d>`、任意 `\begin{env}...\end{env}`、带参命令（`\frac{}{}`、`\sqrt[]{}`、`\mathbf{}` 等）、带花括号上下标（`_{...}`、`^{...}`），以及开启「部分双竖线解析」后同层级偶数个相邻配对的 `|...|` / `∥...∥`。
   - **`WordObject`（原子词）**：无槽控制序列（`\sin`、`\alpha`、`∑`、`\limits`）、复合对齐换行符（`\\`、`\\ =&`、`\\ ⇔&` 等）、无花括号单 Token 上下标（`_2`、`^n`、`_\alpha`）。
   - **`AtomObject`（单字符对象）**：单字母、单数字、单运算符；裸 `<`、`>` 及同层级奇数个（或关闭双竖线解析时的）`|` / 奇数 `∥` 按普通单字符处理，不参与括号配对；同层级奇数个 `|` / `∥` 会在可见源码中标红提示（跳过 `\text{...}` 与 `\begin{array}{c|c}` 等环境头参数）。未配对括号降级为普通 `AtomObject`。
2. **统一空白模型**：
   - 空格（` ` / `\t`）与换行符（`\n` / `\r\n`）一视同仁合并为 `whitespace`。
   - 除文本模式槽位（`\text{}`、`\textrm{}`、`\textbf{}`、`\textit{}`、`\mbox{}`）外，空白一律跟随其**前驱实体**：前对象吸收尾随空白 `[coreTo, to]`，括号槽位左开界吸收槽内前导空白 `[openCoreTo, bodyFrom]`；仅根级数学块最末尾（紧邻闭合 `$$`/`\]` 前、后续无其他对象）的尾随空白在首个 `\r`/`\n` 处截断，只吸收同行水平空格、不吞并末尾换行。
3. **唯二结构关系**：
   - **嵌套包含（`Parent → Child`）**：父 `BracketObject` 的 `[from, to]` 天然包住所有槽位子对象。
   - **单向星形并联（`Host → Dependent`）**：后缀（`_{...}`、`^{...}`、`_1`/`_\alpha`、`\limits`/`\nolimits`、`'`）单向挂载到同一根宿主 `rootHost`；并联后缀之间互不相连。
4. **事务与撤销原则**：
   - 文档改写（结构删除、智能输入、块尾外跳补空格/换行）以单步原子事务提交（`isolateHistory.of("full")` + 专属 `userEvent`），支持 `Ctrl+Z` 一步撤销；
   - 纯光标移动不改文档，不污染撤销栈。

---

## 2. 智能输入（Smart Input，已实现三轨统一引擎）

> 详见 [PLAN_4.md](PLAN/PLAN_4.md) 与 [PLAN_14.md](PLAN/PLAN_14.md)。官方默认规则与用户自定义规则共享**同一套三轨引擎（纯替换 `text` / 正则 `regex` / JavaScript `js`）** 与单文件 `rules.json`，默认全部走 `auto` 自动触发，支持单条启停、复杂绑键（`auto` / 确认键 / 组合键与二段连按），并通过**三档输出Unicode转换层**（默认 `标准 LaTeX` / `Unicode 符号` / `按规则原样`）在不修改 `rules.json` 的前提下切换输入输出风格。文档全文互转命令暂未纳入本期实现。

### 2.1 三轨规则引擎与自定义体验
1. **统一接口与严格校验**：三类规则统一存储于插件目录 `rules.json`；任何缺触发头、缺替换效果、无效正则或 JS 语法错误一律禁止落盘。插件目录同时维护 `rules_zh.json` 与 `rules_en.json` 两套双语官方模板（随插件升级自动同步更新）：首次启动按当前解析语言生成 `rules.json`；通过跨平台规范化 SHA-256 校验（去 BOM、统一 `\n` 并按规范 JSON 序列化后以纯 TS SHA-256 计算，PC 与移动端一致），在 `rules.json` 未被用户自定义修改时随语言切换自动切换对应语言默认规则，恢复默认时亦从对应 `rules_<locale>.json` 恢复。
2. **结构感知上下文（`InputRuleContext`）**：JS 规则直接复用 `MathTree`（含 `prevObject`、`currentSlot`、`inTextMode`、`inCommandTyping`、`inEnvName` 与 `helpers.isKnownCommand` / `isCommandPrefix`），全程 `try/catch` 异常隔离；`inCommandTyping` 与词法边界守卫结合当前按键及 Token 边界保护手写 `\command` 与 `\_`/`\^`/`\/` 转义，同时允许 `\sum_`、`\sum^`、`\alpha_`、`\pi/` 等命令后算子正常展开，且不从内部切开 `\sm`、`\;`、`\|` 等反斜杠词法单元。
3. **三档输出Unicode转换层（`dialectConverter.ts`）**：基于 `tokenizeMath` 在输出落盘前完成词法级转换与 UTF-16 精确光标偏移重映射，保护 `\left`/`\right` 定界符、`\begin`/`\end`、`\text{}` 与 `\bigcup`/`\bigcap`，链式箭头（`<->` / `<=>` / `<==`）跨方言无缝兼容。
4. **设置面板与 MathJax 预览**：设置页首页提供「语言」下拉与**「智能输入」「结构删除」「光标跳转」「特殊设置」「关于」** 5 个独立二级页面入口（点击页内切换，顶部统一提供返回按钮，避免移动端叠层弹窗闪烁）；「语言」支持「跟随 Obsidian / 简体中文 / English」实时切换（当 `rules.json` 未被修改时同步切换对应语言的默认规则集）；「智能输入」页面包含启用开关、输出风格、复合筛选（搜索 + 分组 + 可并列点亮 `JS`/`正则`/`纯替换` 按钮）、Pointer Events 半透明让位拖拽排序、行级 DOM 复用与分帧缓存 MathJax 预览，每行统一「拖拽排序 + 类型与触发徽章 + 1 启停开关 + 2 按钮（文字「编辑」按钮、图标删除按钮）+ 右侧懒渲染 MathJax 预览」（纯替换行内编辑，正则/JS/高级绑键切换页内编辑子视图，导出/导入/恢复默认原地展开内联面板）；「特殊设置」提供全局「双竖线括号解析（`|` 与 `∥`）」开关（默认开启，同步影响删除、跳转、JS 上下文、规则沙盒试跑、小括号自动伸缩及源码奇数标红）、「小括号自动伸缩」开关（默认开启，当普通小括号 `(...)` 内出现大符号或可见括号嵌套时以独立撤销步自动升级为 `\left(...\right)`，并透明弥合 `\mathbb`、`\sqrt`、`{...}`、`_{}`/`^{}` 等扁平包装层）与「行内公式实时渲染弹窗」下拉配置（默认「在下方显示」，可选「在上方显示」「在下方显示」「不显示」；仅在实时预览模式且编辑器聚焦、空选区编辑非空行内公式 `$...$` / `\(...\)` 时以纯展示 Tooltip 浮窗实时渲染，边缘空间不足时自动翻转）；「关于」展示自适应主题矢量 Logo、版本、作者、仓库地址与 AGPL-3.0 开源证书。

### 2.2 官方默认规则概览（全 `auto`、零前缀冲突）
- **JavaScript 规则（通用 9 条 + 矩阵类 7 条）**：`js-math-delim`（`$` / `￥` 按前字补空格成对生成、空 `$|$` 升级 `$$\n|\n$$`，跳过代码块/YAML/转义 `\$`）、`js-bold-greek`（`;;<ch>`）、`js-font-bb`（`bb<L>` 自动大写 `\mathbb`）、`js-font-cal`（`cal<L>` 自动大写 `\mathcal`）、`js-big-op-5mode`（`sm`/`pd`/`bu`/`bn` 五模式）、`js-integral`（`it` 五模式）、`js-limit`（`lm` 五模式）、`js-eval-bar`（`er|`/`el|` 族）与 `js-cmd-space`（命令后防打断补空格，绝不打断 `\left` / `\sinh` / `\dots`）。
- **「矩阵类」独立分组（英文 `Matrix`，共 16 条）**：含 9 条基础矩阵/行列式骨架（`matb`、`matp`、`matv`、`matB`、`matV`、`matm`、`mats`、`mata` 增广、`dmat` 对角）与 7 条参数化 JS 生成规则——指定维数矩阵与行列式网格（`mb23`/`mp33`/`mv22`/`mB22`/`mV22`/`mm22`/`ms22`/`ma34`）、单位矩阵（`eye2`–`eye6`/`eyen`）、符号矩阵与符号行列式（`ju<a>`/`jup<a>`/`juv<a>`，支持 `,m,n` 维度定制）、列向量与行向量（`vx<x>`/`vxp<x>`/`cx<x>`/`cxp<x>`）、符号对角矩阵（`diag<a>`/`diagp<a>`）、范德蒙德行列式（`vdm<x>`）及雅可比矩阵/行列式（`jac<y,x>`/`jacv<y,x>`）。
- **正则规则（16 条）**：3 条跨方言链式箭头（`<->` / `<=>` / `<==`）、单字母字体 `bf`/`bm`/`rm`、导数/偏导 `dd`/`pp`、带下标范数 `lv`/`nv`、快捷单字上下标 `pw`/`sb`、内置算子 `(dim|deg|gcd|ker|det|max|min|sup|inf)` 与 `(rank|Im|adj|span|card)`。
- **纯替换规则**：希腊字母（`;a`–`;W`、`pi`）、修饰容器（`mbf`/`mrm`/`mbm`/`mcal`/`mbb`/`bar`/`hat`/`vec`）、自动/普通定界符（`lr(`..`lrv`、`l[)`/`l(]`、`;(`..`;<`、`flr`/`cel`/`nrm`）、分式根式上下标（`/`、`nsq`、`sq`、`^`、`_`、`inv`）、函数名（`arcsin`..`csc`/`ln`/`log`/`exp`/`mod`/`ide`）、孤立大算子/运算/关系/集合/逻辑/省略号/箭头、多行环境（`cases`/`align`）与复合对齐换行（`\\=`/`\\~`/`\\>`/`\\<`/`\\e`）。

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

### 3.2 三类触发机制与输入劫持优先级（光标跳转 & 结构删除通用）
针对桌面端物理键盘与移动端虚拟输入法/工具栏的差异，**光标跳转**与**结构删除**均支持三类触发通道：
1. **第 1 类：键盘按键劫持（适用于 PC 端物理键盘）**
   - 在设置页「光标跳转」与「结构删除」子页面中支持自定义触发按键（文本框手填 + 按键录制 + 恢复默认，默认分别为 `Tab` 与 `Backspace`）。
   - 通过 `Prec.highest` `keydown` 劫持介入，命中结构条件时优先拦截该按键；未命中结构条件时完整放行。
2. **第 2 类：输入检测触发规则（全端通用，支持多规则 + 纯匹配 / 正则 / JavaScript，持久化于 `trigger.json`）**
   - 核心语义：**检测到输入 `xxx` ➔ 自动将 `xxx` 删除，并立即触发光标跳转（或结构化整体删除）**（单字符触发直接在 `inputHandler` 阶段阻断上屏并执行动作；多字符触发在单步原子事务中剥离已上屏前缀并基于干净语法树计算落点/删除跨度）。
   - 全部优先于智能输入：全局 `inputHandler` 执行优先级为 **`光标跳转输入规则 ➔ 结构删除输入规则 ➔ 智能输入规则`**。
   - 复用智能输入的 `InputRuleContext` 与上下文守卫（默认开启 `跳过 \text{...}`、`跳过手写 \command`、`跳过 \begin{...}`，可选 `词边界保护`），确保绑定 `o` 等字母时在手打 `\cos`、`\log`、`\text{hello}` 中绝不误触发；当光标位置不满足跳转或结构删除条件时，完整放行原输入。
   - 默认列表为空，独立存储于插件目录 `trigger.json`（含 `jumpRules` 与 `deleteRules`）。
3. **第 3 类：移动端工具栏快捷按钮（Obsidian Mobile Toolbar）**
   - 注册「智能光标跳转」（`struct-latex:smart-jump`）与「结构化整体删除」（`struct-latex:smart-backspace`）两个全局编辑器命令（配内置 Lucide 图标）。
   - 通过 `PluginSettings.mobileToolbarInitialized` 初始化标记，在首次安装/启动插件时**默认自动将「智能光标跳转」添加至 Obsidian 移动端工具栏**（`.obsidian/app.json` 的 `mobileToolbarCommands` 并实时刷新 `app.mobileToolbar`），同时在设置页提供一键添加/移除按钮。

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
   - 非文本模式下，删除前对象会连带清空其尾随的水平空格与换行（如 `a + b\n    |c` → `a + |c`），但根级数学块最末尾的换行符不被吸收（如 `$$\n123456|\n$$` 回退原生退格保留 `\n$$`）；`\text{...}` 等文本模式槽内关闭空白合并；
   - **悬空分隔空白吞并**（详见 [PLAN_23.md](PLAN/PLAN_21~30/PLAN_23.md)）：尾随空白是前驱与后继之间的分隔符，当删除闭包移除了所在容器（根级数学块或槽位）内的最后实体时，紧邻前驱的尾随空白一并删除（如 `$\sin \sum|$` → `$\sin|$`、`a + b|` → `a +|`、`\frac{a}{b \sum|}` → `\frac{a}{b|}`），避免行内公式闭合 `$` 前残留空格导致不渲染；右侧仍有实体时保留分隔空白，根级块公式末尾受保护换行不受影响；
   - 裸 `<`、`>` 及同层级奇数个 `|`/`∥`（或关闭「部分双竖线解析」时的 `|`）与未配对括号降级为普通单字符对象，绝不误删；
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
