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

## 2. 智能输入（Smart Input，待实现）

> 注：默认保留用户长期形成的**「Unicode 数学符号 + 标准 LaTeX 命令混合」**肌肉记忆，同时规划在设置中支持自定义规则或切换纯标准 LaTeX 输出（如 `∑` ↔ `\sum`）。经评审确认，**取消 `mm//` 后置分式指令**。

### 2.1 数学定界符快捷入口（非数学区可触发）

| 触发输入 | 输出结果（`\|` 为光标） | 说明 |
| :--- | :--- | :--- |
| `$`（前为非空白字符） | `[[前字]] $\|$\|` | 紧贴中英文输入 `$` 时自动补前导空格并成对生成行内公式 |
| `$`（前为空白或行首） | `$\|$` | 生成行内公式对 |
| `$$`（紧接在 `$|$` 内再敲 `$`） | `$$\n\|\n$$` | 空行内公式升级为多行块级公式 |
| `￥` / `￥￥` | `$\|` / `$\|$` | 中文输入法下误按人民币符号快速转数学定界符 |

### 2.2 参数化大型算子与微积分模板

**1. 五模式参数化大型算子**（覆盖求和 `su`、求积 `pr`、大并集 `cu`、大交集 `ca`）：

| 前缀 | 空槽模板（`w*`） | `<v1><v2>`（默认下界 `1`） | `<v1><d><v2>`（指定起始数字 `0-9`） | `<v1>,<v2>`（双下标） | `<d><v2>`（从数字到 `∞`） |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `su`（`∑`） | `wsu` -> `∑_{\|=}^{}` | `sukn` -> `∑_{k=1}^{n}\|` | `suk0n` -> `∑_{k=0}^{n}\|` | `sui,j` -> `∑_{i,j}\|` | `su0n` -> `∑_{n=0}^{∞}\|` |
| `pr`（`∏`） | `wpr` -> `∏_{\|=}^{}` | `priN` -> `∏_{i=1}^{N}\|` | `pri0n` -> `∏_{i=0}^{n}\|` | `pri,j` -> `∏_{i,j}\|` | `pr1n` -> `∏_{n=1}^{∞}\|` |
| `cu`（`\bigcup`） | `wcu` -> `\bigcup_{\|=}^{}` | `cuiN` -> `\bigcup_{i=1}^{N}\|` | `cui0n` -> `\bigcup_{i=0}^{n}\|` | `cui,j` -> `\bigcup_{i,j}\|` | `cu1n` -> `\bigcup_{n=1}^{∞}\|` |
| `ca`（`\bigcap`） | `wca` -> `\bigcap_{\|=}^{}` | `caiN` -> `\bigcap_{i=1}^{N}\|` | `cai0n` -> `\bigcap_{i=0}^{n}\|` | `cai,j` -> `\bigcap_{i,j}\|` | `ca1n` -> `\bigcap_{n=1}^{∞}\|` |

**2. 积分、求值竖线、极限、导数族**：
- **积分（`in`）**：`win` -> `∫_{\|}^{}`；`in-+` -> `∫_{-∞}^{+∞}\|`；`in<a><b>` -> `∫_{<a>}^{<b>}\|`；`in-<a>` -> `∫_{-∞}^{<a>}\|`；`in<a>+` -> `∫_{<a>}^{+∞}\|`（`a,b ∈ [a-zA-Z0-9]`）。
- **求值竖线（`y|` / `z|`）**：`yy\|` -> `\left.\|\right\|`；`zz\|` -> `\left\|\|\right.`；`y|<a><b>` / `y|-<a>` / `y|<a>+` / `y|-+`（及 `z|` 族）同理带后缀上下标。
- **极限（`li`）**：`wli` -> `\lim\limits_{\|→}`；`li<a><b>` -> `\lim\limits_{<a>→<b>}\|`；`li<a>+` -> `\lim\limits_{<a>→+∞}\|`；`li<a>-` -> `\lim\limits_{<a>→-∞}\|`；`li+<a>` -> `\lim\limits_{<a>→∞}\|`。
- **导数与偏导（`dd` / `pp`）**：`dd<x>` -> `\frac{\mathrm{d}}{\mathrm{d}<x>}\|`；`dd<n><x>` -> `\frac{\mathrm{d}^{<n>}}{\mathrm{d}<x>^{<n>}}\|`；`pp<x>` -> `\frac{∂}{∂<x>}\|`；`pp<n><x>` -> `\frac{∂^{<n>}}{∂<x>^{<n>}}\|`。

### 2.3 自动配对定界符

| 类别 | 触发词 | 展开结果（`\|` 为光标） |
| :--- | :--- | :--- |
| 自动伸缩 `\left...\right` | `ll(` / `ll[` / `ll{` / `ll\|` | `\left(\|\right)` / `\left[\|\right]` / `\left\{\|\right\}` / `\left\|\|\right\|` |
| 非对称伸缩括号 | `l[)` / `l(]` | `\left[\|\right)` / `\left(\|\right]` |
| 特殊伸缩定界符 | `lln` / `llf` / `llc` / `llv` | `\left\langle\|\right\rangle` / `\left\lfloor\|\right\rfloor` / `\left\lceil\|\right\rceil` / `\left\Vert\|\right\Vert` |
| 带下标范数（`lv<p>`） | `lv2`、`lvp`（`[a-zA-Z0-9]`） | `\left\Vert\|\right\Vert_{<p>}` |
| 普通 / Unicode 括号 | `mm(` / `mm[` / `mm{` / `mm\|` / `mmn` / `mmf` / `mmc` / `mmv` | `(\|)` / `[\|]` / `\{\|\}` / `\|\|\|` / `⟨\|⟩` / `⌊\|⌋` / `⌈\|⌉` / `∥\|∥` |
| 带下标普通范数 | `mv<p>`（`[a-zA-Z0-9]`） | `∥\|∥_{<p>}` |

### 2.4 分数、根式与上下标
- **分数与根式**：`/` -> `\frac{\|}{}`；`gen` -> `\sqrt{\|}`；`gan` -> `\sqrt[\|]{}`。
- **上下标**：`^` -> `^{\|}`；`_` -> `_{\|}`；`fuy` -> `^{-1}\|`；`uu<c>` -> `^{<c>}\|`；`nn<c>` -> `_{<c>}\|`（`<c>` 为 `[a-zA-Z0-9]`）。

### 2.5 多行环境、矩阵模板与对齐换行符
- **环境对**：`case` -> `\begin{cases}\|\end{cases}`；`alig` -> `\begin{align}\|\end{align}`；`juzh` -> `\begin{bmatrix}\|\end{bmatrix}`；`hals` -> `\begin{vmatrix}\|\end{vmatrix}`。
- **带参矩阵模板**：`ju<X>`（`n×n` 矩阵）、`vx<X>`（列向量）、`cx<X>`（行向量）。
- **快捷换行/对齐**：`hui` -> `\\|`；`hud` -> `\\ ⇔&|`；`hu=` -> `\\ =&|`；`hu>` -> `\\ ⇒&|`；`hu<` -> `\\ ⇐&|`；`huap` -> `\\ ≈&|`；`fen` -> `&|`。

### 2.6 字母表、字体包装、数学函数与常用符号
- **希腊字母（`qq*` 与特例）**：`qqa`=`α`、`qqb`=`β`、`qqy`=`γ`、`qqG`=`Γ`、`qqd`=`δ`、`qqv`=`ε`、`qqe`=`ϵ`、`qq0`=`θ`、`qqk`=`κ`、`qql`=`λ`、`qqL`=`Λ`、`qqs`=`σ`、`qnn`=`υ`、`qqU`=`Υ`、`qqw`=`ω`、`qqO`=`Ω`、`qqu`=`μ`、`qvv`=`ν`、`qqx`=`ξ`、`qqX`=`Ξ`、`pi`=`π`、`qqr`=`ρ`、`qqf`=`φ`、`qqF`=`Φ`、`qqj`=`ϕ`、`qqp`=`ψ`、`qqY`=`Ψ`、`qqn`=`η`、`qqt`=`τ`、`qxx`=`χ`、`qss`=`ς`（可补 `qqz`=`ζ`）。
- **粗体希腊字母（`cc*` / `cvv` / `cnn` / `cxx` / `css`）**：对应 `\boldsymbol{α}` 等。
- **黑板粗体 / 花体**：`kk[a-zA-Z]` -> `𝕒`–`𝕫` / `𝔸`–`ℤ`；`hh[a-z]` -> `\mathcal{A}`–`\mathcal{Z}`。
- **单字母与容器字体**：`bb<L>` -> `\mathbf{<L>}|`、`ww<L>` -> `\boldsymbol{<L>}|`、`ss<L>` -> `\mathrm{<L>}|`；`vvb`=`\mathbf{|}`、`vvs`=`\mathrm{|}`、`vvu`/`upb`=`\overline{|}`、`vvc`=`\boldsymbol{|}`、`vvh`=`\mathcal{|}`。
- **数学函数与算子**：`card` -> `\operatorname{card}|`、`ide` -> `\mathrm{id}|`、`rank|Im|adj|span` -> `\operatorname{...}|`、`dim|deg|gcd|ker|det|max|min|sup|inf` -> `\...|`；三角/双曲/对数函数同时兼容标准小写（`cos`/`cot`/`log`/`mod`/`arccos` 等）与旧别名（`cOs` 等），并含 `sin`/`arcsin`/`tan`/`arctan`/`sec`/`csc`/`csh`/`snh`/`tnh`/`cth`/`ln`/`exp`。
- **常用符号**：
  - 算子/集合：`qsu`=`∑`、`qpr`=`∏`、`qin`=`∫`、`qdi`=`∬`、`qti`=`∭`、`qca`=`\bigcap`、`qcu`=`\bigcup`、`jia`=`∩`、`bin`=`∪`、`mmp`=`∂`、`mmb`=`∇`、`mmd`=`Δ`、`mmi`=`∞`、`mmk`=`∅`、`mmq`=`&`、`mmx`=`*`、`che`=`·`、`+-`=`±`、`-+`=`∓`、`cha`=`×`、`chu`=`÷`、`cir`=`∘`、`zhe`=`⊕`、`dkj`=`⊗`、`alf`=`ℵ`、`buj`=`∁`。
  - 关系/逻辑/省略号/箭头：`ang`=`∠`、`\|\|`=`∥`、`qie`=`∧`、`huO`=`∨`、`thf`=`∴`、`bec`=`∵`、`sim`=`∼`、`bsi`=`∽`、`nsi`=`≁`、`tge`=`≅`、`hte`=`≃`、`ape`=`≈`、`nte`=`≠`、`hde`=`≡`、`dte`=`≜`、`=<`=`≤`、`>=`=`≥`、`zct`=`⊆`、`yct`=`⊇`、`nzc`=`⊈`、`nyc`=`⊉`、`zhj`=`⊥`、`zjb`=`⊤`、`zbl`=`∈`、`nzb`=`∉`、`ybl`=`∋`、`nyb`=`∌`、`any`=`∀`、`ext`=`∃`、`nxt`=`∄`、`vdt`=`⋮`、`cdt`=`⋯`、`ydt`=`⋰`、`zdt`=`⋱`、`<-`=`←`、`->`=`→`、`upv`=`↑`、`dwv`=`↓`、`<>`=`↔`、`=>`=`⇒`、`<=`=`⇐`、`dej`=`⇔`、`yis`=`↦`。

### 2.7 命令后自动补空格（结构化防打断）
仅当 `\` 后已是完整闭合的无参控制序列、且新增字母不构成更长已知 LaTeX 命令前缀时才自动补空格；绝不在手写 `\l` → `\le` → `\lef` → `\left` 的过程中打断。

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

### 3.2 后续键位与增强规划
- **键位绑定可配置**：允许用户自定义跳转触发键（如绑定 `o` 键、或切换 `Tab` 粗粒度跳出当前括号 / `Shift+Tab` 反向跳转）。

---

## 4. 结构化原子删除（`Backspace`，已实现）

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
