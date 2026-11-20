# Obsidian-Struct-Latex 项目守则

## 0. Agent 守则

- 动手前先读本文件，按任务需要查阅 [REQUIRMENT.md](REQUIRMENT.md) 与 [OBSIDIAN_API.md](OBSIDIAN_API.md)。
- 非平凡改动前必须先落盘 `PLAN/PLAN_<n>.md`，再开始编码。
- 阻塞、需求模糊或语义不确定时停下来问用户，不要猜测。
- 完成标准是**构建/类型检查通过且对应场景验证通过**，不是“代码写完”。

## 1. PLAN 管理机制

- **何时建 Plan**：新功能、重构、架构调整、多文件修改或行为变更均属非平凡改动，改动前先在 `PLAN/` 目录新建 `PLAN/PLAN_<n>.md`；仅极小修补（如笔误、单行注释）可免。
- **编号与格式**：`<n>` 沿 `PLAN/` 已有文件与 `git log` 中 `pl_<n>` 记录递增，不复用旧号；首行 `# PLAN <n> — <标题>`，附 `日期：YYYY-MM-DD`。
- **必备内容**：每份 PLAN 须简明涵盖五项——**需求/根因、目标语义与方案、文件清单（增/改/删）、验证方式、回退方案**。
- **同步维护**：实现与原计划有偏差、或对外行为变化时，同步更新对应 `PLAN_<n>.md` 与相关项目文档；`README.md` 只保留用户介绍。

## 2. 项目概况与环境

- **定位**：Obsidian 智能结构化 LaTeX 编辑插件（`struct-latex`），基于词法分词 + 配对栈 / AST（而非正则引擎），支持 CodeMirror 6 实时智能输入、光标跳转与结构化原子删除。
- **技术栈**：TypeScript + esbuild + Obsidian API + CodeMirror 6；`obsidian`、`electron`、`@codemirror/*`、`@lezer/*` 仅作 `external` 依赖，禁止打包进产物。
- **本地调试环境**：
  - Obsidian 可执行文件：`D:\Install\Obsidian\Obsidian.exe`
  - 测试仓库：`C:\Users\Administrator\Desktop\TestObsidian`（真机验证时注意停用或规避同类插件如 `easy-typing-obsidian` 的按键冲突）
- **源码结构与常用命令**：
  - `src/parser/`：纯解析层（`types` / `commandTable` / `tokenizer` / `matcher` / `objectFactory` / `bracketBuilders` / `builder` / `deleteResolver` / `jumpResolver`），零 Obsidian/DOM 依赖。
  - `src/editor/`：CM6 集成层（`mathRegion` / `smartBackspace` / `smartJump`）；`src/main.ts` 为插件入口；`tests/` 为自动化单测。
  - 常用命令：`npm run typecheck`、`npm test`、`npm run build`、`npm run dev`。

## 3. 通用工程约束

- **分层解耦**：数学区域判定、词法分词、结构栈/AST、CM6 编辑器交互按职责分层，纯解析逻辑不耦合 Obsidian/DOM，便于单测与演进。
- **数学区与编辑器安全**：优先复用 CM6 `syntaxTree(state)` 判定数学模式，禁止用全局奇偶 `$$` 扫描；IME 合成态（`composing` / `isComposing`）下严禁拦截改写；未命中结构条件或非空选区时返回 `false` 交还原生处理；每次结构编辑以原子事务提交并标注专属 `userEvent`。
- **删除优先**：重构必须删除被取代的文件、字段与分支，不保留 `_old` / `_v2` / 兼容壳，删除后全库搜索确认无残留。
- **规模控制**：单文件目标 ≤300 行、单函数目标 ≤120 行，超长逻辑优先按职责拆分模块。
- **语言约定**：代码与注释用英文，用户可见文案与项目文档用中文。

## 4. 修改后检查

1. TypeScript 类型检查与构建通过；若存在自动化测试，全部通过。
2. 涉及编辑器行为改动时，将产物同步到测试仓库并在真实 Obsidian 中实测对应场景，确认无控制台报错且不破坏原生输入、缩进与 IME。
3. 仓库与测试仓库均不残留临时日志、截图或无关调试文件；行为变化已同步更新 `PLAN/` 与相关文档。

## 5. 提交规范

- 提交信息：`pl_<n>：<一句话变更>`（与对应 `PLAN/PLAN_<n>.md` 编号一致；合并多项可写 `pl_<n>,<m>：...`）。
- 不提交 `node_modules/`、临时调试日志/截图或本地环境配置。
