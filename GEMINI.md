# Obsidian-Struct-Latex 项目守则

## 0. Agent 守则

- 动手前先读本文件，按任务需要查阅 [REQUIRMENT.md](REQUIRMENT.md) 与 [OBSIDIAN_API.md](OBSIDIAN_API.md)。
- 非平凡改动前必须先落盘 `PLAN/PLAN_<n>.md`，再开始编码。
- 阻塞、需求模糊或语义不确定时停下来问用户，不要猜测。
- 完成标准是**构建/类型检查通过、自动化单测全绿、且对应场景在真实 Obsidian 中验证通过**，不是“代码写完”。

## 1. PLAN 管理机制

- **何时建 Plan**：新功能、重构、架构调整、多文件修改或行为变更均属非平凡改动，改动前先在 `PLAN/` 目录新建 `PLAN/PLAN_<n>.md`；仅极小修补（如笔误、单行注释）可免。
- **编号与格式**：`<n>` 沿 `PLAN/` 已有文件与 `git log` 中 `pl_<n>` 记录递增，不复用旧号；首行 `# PLAN <n> — <标题>`，附 `日期：YYYY-MM-DD`。
- **必备内容**：每份 PLAN 须简明涵盖五项——**需求/根因、目标语义与方案、文件清单（增/改/删）、验证方式、回退方案**。
- **同步维护**：实现与原计划有偏差、或对外行为变化时，同步更新对应 `PLAN_<n>.md` 与相关项目文档；`README.md` 只保留用户介绍。

## 2. 项目概况与环境

- **定位**：Obsidian 智能结构化 LaTeX 编辑插件（`struct-latex`），基于「词法分词 + 作用域配对栈 + 对象关系树」而非正则引擎，实现 CodeMirror 6 实时结构化整体删除、智能光标跳转与智能输入。
- **技术栈**：TypeScript + esbuild + Obsidian API + CodeMirror 6；`obsidian`、`electron`、`@codemirror/*`、`@lezer/*` 仅作 `external` 依赖，禁止打包进产物。
- **本地调试环境**：
  - Obsidian 可执行文件：`D:\Install\Obsidian\Obsidian.exe`
  - 测试仓库：`C:\Users\Administrator\Desktop\TestObsidian`（真机验证时注意停用 `easy-typing-obsidian` 以免按键冲突；写配置文件务必使用无 BOM UTF-8）
- **源码结构与常用命令**：
  - `src/parser/`：纯解析层（`types` / `commandTable` / `tokenizer` / `matcher` / `objectFactory` / `bracketBuilders` / `builder` / `deleteResolver` / `jumpResolver`），零 Obsidian/DOM 依赖。
  - `src/input/`：纯输入引擎（`types` / `keybindUtils` / `validation` / `commandCatalog` / `dialectConverter` / `contextBuilder` / `ruleCompiler` / `ruleEngine` / `previewEvaluator` / `defaultJsRules` / `defaultSymbolRules` / `defaultRules`），零 Obsidian/DOM 依赖。
  - `src/editor/`：CM6 集成层（`mathRegion` / `smartBackspace` / `smartJump` / `smartInput`）；`src/settings/` 为持久化与设置面板 UI；`src/main.ts` 为插件入口、`styles.css` 为样式表。
  - `tests/` & `scripts/run-tests.mjs`：自动化单测（自动递归执行 `tests/**/*.test.ts`）。
  - 常用命令：`npm run typecheck`、`npm test`、`npm run build`、`npm run dev`。

## 3. 核心架构与工程约束

- **纯粹对象与零特例原则**：一切构建在统一对象模型（`BracketObject` / `WordObject` / `AtomObject`）、统一空白模型（空格与换行同归 `whitespace` 并跟随前实体/括号开界，`\text{}` 文本槽除外）与单向星形并联依赖之上；优先精简抽象，拒绝局部特判补丁。
- **分层解耦**：数学区域判定、词法分词、结构栈/树、查询解析与 CM6 交互按职责分层，纯解析逻辑不耦合 Obsidian/DOM，按不可变 `state.doc` 缓存（`WeakMap<Text, ...>`）。
- **数学区与编辑器安全**：复用 CM6 `syntaxTree(state)` 判定数学模式，禁止全局奇偶 `$$` 扫描；`readOnly`、IME 合成态（`view.composing` / `isComposing`）、多光标或非空选区一律放行返回 `false`；文档修改以单步原子事务提交（`isolateHistory.of("full")` + 专属 `userEvent`），纯光标移动不污染撤销栈。
- **删除优先**：重构必须删除被取代的文件、字段与分支，不保留 `_old` / `_v2` / 兼容壳，删除后全库搜索确认无残留。
- **规模控制**：单文件目标 ≤300 行、单函数目标 ≤120 行，超长逻辑优先按职责拆分模块。
- **语言约定**：代码与注释用英文，用户可见文案与项目文档用中文。

## 4. 修改后检查

1. `npm run typecheck`、`npm test` 与 `npm run build` 全部通过，且产物 `main.js` 未内联外部依赖。
2. 涉及编辑器行为改动时，将 `manifest.json`、`main.js` 与 `styles.css` 同步至测试仓库并在真实 Obsidian 中实测对应场景，确认控制台零报错且不破坏原生输入、缩进、撤销栈与 IME。
3. 仓库与测试仓库均不残留临时笔记、日志、截图或备份文件；行为变化已同步更新 `PLAN/` 与相关文档。

## 5. 版本管理与提交规范

- **双轨版本管理（类 Android `versionName` + `versionCode`）**：
  - **发布版本（`version`）**：`manifest.json`、`package.json`、`package-lock.json` 与 `versions.json` 中的语义化版本（如 `1.0.0`、`1.0.1`、`1.0.2`），**绝不自动更新**，仅在明确要求发版时手动/显式升级并按 [RELEASE.md](RELEASE.md) 发布 Tag。
  - **内部版本号（`BUILD_TAG`）**：位于 `src/settings/settingAboutAndSpecial.ts` 的 `BUILD_TAG`（显示于「设置 → 关于 → 当前版本」旁括号内，如 `v1.0.2 (119)`），**每次改动/提交前自动 +1 迭代**（沿 `git log` 最新流水号递增）。
- **提交信息**：`<版本号>_pl_<n>：<一句话变更>`（与对应 `PLAN/PLAN_<n>.md` 编号及 `BUILD_TAG` 一致；合并多项可写 `<版本号>_pl_<n>,<m>：...`，明确发版时可附 `_<version>`）。
- 不提交 `node_modules/`、临时调试日志/截图或本地环境配置。
