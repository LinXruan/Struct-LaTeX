# Obsidian 插件开发与 LaTeX 结构化编辑 API 参考指南

> 本文档整理自 Obsidian 官方 TypeScript API 类型定义（`obsidianmd/obsidian-api`，npm `obsidian@1.14.4`）、Obsidian 官方插件构建模板（`obsidian-sample-plugin`），以及在本地运行环境（Obsidian Desktop `1.15.1` / 安装包 `1.11.7.0`）对现有编辑器插件架构的实测分析，专门面向 **CodeMirror 6（CM6）实时结构化 LaTeX 编辑插件** 的开发需求。

---

## 目录

1. [Obsidian 插件工程规范与构建配置](#1-obsidian-插件工程规范与构建配置)
2. [Obsidian 核心 TypeScript API 速查](#2-obsidian-核心-typescript-api-速查)
3. [CodeMirror 6 核心扩展 API（本插件核心实现层）](#3-codemirror-6-核心扩展-api本插件核心实现层)
4. [数学模式检测与实测避坑指南](#4-数学模式检测与实测避坑指南)
5. [撤销栈（History）、IME 合成态与并发冲突处理](#5-撤销栈historyime-合成态与并发冲突处理)

---

## 1. Obsidian 插件工程规范与构建配置

### 1.1 插件目录与核心文件清单

Obsidian 桌面端与移动端插件统一存放在 Vault 的 `.obsidian/plugins/<plugin-id>/` 目录下，核心文件如下：

| 文件名 | 作用 | 是否发布产物 |
| :--- | :--- | :--- |
| `manifest.json` | 插件元数据（`id`、`name`、`version`、`minAppVersion`、`description`、`author`、`isDesktopOnly`） | 必需 |
| `main.js` | 由 TypeScript 编译打包后的单文件 CommonJS（`cjs`）入口 | 必需 |
| `styles.css` | 插件自定义样式（可选，用于设置页、光标提示/槽位高亮等） | 可选 |
| `data.json` | 通过 `plugin.loadData()` / `plugin.saveData()` 读写的用户配置持久化文件 | 运行时生成 |
| `versions.json` | 插件版本与最低 Obsidian 版本映射表（用于社区插件市场发布） | 仓库根目录 |

示例 `manifest.json`：

```json
{
  "id": "struct-latex",
  "name": "Struct LaTeX",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "Structure-aware LaTeX editing in Obsidian.",
  "author": "LinXruan",
  "isDesktopOnly": false
}
```

> **跨端提示**：只要不直接调用 Node.js 的 `fs`/`path` 或 Electron 原生 API（仅使用 Obsidian 抽象 API 与 CodeMirror 6），应将 `"isDesktopOnly": false`，即可同时兼容桌面端与移动端。若需在开发期写本地调试日志，需在 `Platform.isDesktopApp` 下按需调用或改用 `app.vault.adapter`。

### 1.2 `esbuild.config.mjs` 与 `external` 关键配置

Obsidian 运行时自带 `obsidian` 模块、Electron 以及整套 **CodeMirror 6 / Lezer** 实例。**插件打包时绝对不能将 `@codemirror/*` 和 `@lezer/*` 打进 `main.js`**，否则会导致运行时存在多份 CodeMirror 实例，造成 `StateField` / `Facet` / `instanceof` 校验失败甚至编辑器崩溃。

`esbuild.config.mjs` 标准配置：

```js
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

### 1.3 `package.json` 依赖划分原则

```json
{
  "name": "obsidian-struct-latex",
  "version": "0.1.0",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production"
  },
  "devDependencies": {
    "@codemirror/language": "^6.0.0",
    "@codemirror/state": "^6.0.0",
    "@codemirror/view": "^6.0.0",
    "@lezer/common": "^1.0.0",
    "@types/node": "^20.0.0",
    "builtin-modules": "^3.3.0",
    "esbuild": "^0.24.0",
    "obsidian": "^1.14.4",
    "typescript": "^5.0.0"
  }
}
```

> 说明：`@codemirror/*` 与 `obsidian` 仅放在 `devDependencies` 中供 TypeScript 类型检查使用；实际运行由 Obsidian 宿主的 `require(...)` 提供。

### 1.4 官方参考资源

- 官方 API 类型定义仓库：[obsidianmd/obsidian-api](https://github.com/obsidianmd/obsidian-api)（核心文件 `obsidian.d.ts`）
- 官方开发者文档：[docs.obsidian.md](https://docs.obsidian.md/)
- 官方模板仓库：[obsidianmd/obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- CodeMirror 6 官方文档：[codemirror.net/docs/ref](https://codemirror.net/docs/ref/)

---

## 2. Obsidian 核心 TypeScript API 速查

### 2.1 `Plugin` 与 `Component` 生命周期

`Plugin` 继承自 `Component`。所有事件、DOM 监听、定时器和编辑器扩展都应通过 `Component` / `Plugin` 的托管方法注册，这样在插件卸载（`onunload`）时 Obsidian 会自动清理资源，避免内存泄漏或残留监听器。

```ts
export abstract class Plugin extends Component {
  app: App;
  manifest: PluginManifest;
  settings?: unknown; // @since 1.13.0

  onload(): Promise<void> | void;
  onunload(): void; // 继承自 Component

  // 数据持久化（读写插件目录下的 data.json）
  loadData(): Promise<any>;
  saveData(data: any): Promise<void>;

  // 命令与 UI
  addCommand(command: Command): Command;
  removeCommand(commandId: string): void; // @since 1.7.2
  addSettingTab(settingTab: PluginSettingTab): void;
  addRibbonIcon(icon: IconName, title: string, callback: (evt: MouseEvent) => any): HTMLElement;
  addStatusBarItem(): HTMLElement; // 仅桌面端可用

  // 编辑器扩展（本插件最核心入口）
  registerEditorExtension(extension: Extension): void; // @since 0.12.8
  registerEditorSuggest(editorSuggest: EditorSuggest<any>): void;

  // 阅读视图（Reading Mode）后处理
  registerMarkdownPostProcessor(postProcessor: MarkdownPostProcessor, sortOrder?: number): MarkdownPostProcessor;
  registerMarkdownCodeBlockProcessor(
    language: string,
    handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => Promise<any> | void,
    sortOrder?: number
  ): MarkdownPostProcessor;
}
```

`Component` 提供的通用资源托管方法：

```ts
export class Component {
  register(cb: () => any): void;
  registerEvent(eventRef: EventRef): void;
  registerDomEvent<K extends keyof WindowEventMap>(
    el: Window, type: K, callback: (this: HTMLElement, ev: WindowEventMap[K]) => any, options?: boolean | AddEventListenerOptions
  ): void;
  registerInterval(id: number): number;
}
```

### 2.2 `App`、`Workspace` 与 `MarkdownView`

- **`App`**：全局应用入口，挂载 `app.vault`（文件操作）、`app.workspace`（窗口与标签页）、`app.metadataCache`（元数据缓存）、`app.keymap`（全局快捷键栈）、`app.scope`（根快捷键作用域）。
- **`Workspace`** 常用成员：

```ts
export class Workspace extends Events {
  activeEditor: MarkdownFileInfo | null;
  getActiveViewOfType<T extends View>(type: Constructor<T>): T | null;
  getActiveFile(): TFile | null;
  iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => any): void;
  getLeavesOfType(viewType: string): WorkspaceLeaf[];
  updateOptions(): void; // 通知所有编辑器重新读取动态扩展配置

  // 常用事件（配合 plugin.registerEvent 使用）
  on(name: 'active-leaf-change', callback: (leaf: WorkspaceLeaf | null) => any, ctx?: any): EventRef;
  on(name: 'file-open', callback: (file: TFile | null) => any, ctx?: any): EventRef;
  on(name: 'layout-change', callback: () => any, ctx?: any): EventRef;
  on(name: 'editor-menu', callback: (menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo) => any, ctx?: any): EventRef;
}
```

- **`MarkdownView`**：表示一个打开的 Markdown 标签页：

```ts
export class MarkdownView extends TextFileView implements MarkdownFileInfo {
  editor: Editor;
  previewMode: MarkdownPreviewView;
  currentMode: MarkdownSubView;

  getViewType(): string;
  getMode(): MarkdownViewModeType; // 'source' | 'preview'
  getViewData(): string;
  setViewData(data: string, clear: boolean): void;
  showSearch(replace?: boolean): void;
}
```

### 2.3 `Editor` 高层抽象接口与底层 `EditorView` 的边界

Obsidian 对编辑器提供了高层抽象 `Editor`（使用 `{ line, ch }` 的 0-indexed 行列坐标），常用签名如下：

```ts
export interface EditorPosition {
  line: number; // 0-based
  ch: number;   // 0-based
}

export interface EditorSelection {
  anchor: EditorPosition;
  head: EditorPosition;
}

export interface EditorTransaction {
  replaceSelection?: string;
  changes?: EditorChange[];
  selections?: EditorRangeOrCaret[];
  selection?: EditorRangeOrCaret;
}

export abstract class Editor {
  abstract getValue(): string;
  abstract setValue(content: string): void;
  abstract getLine(line: number): string;
  setLine(n: number, text: string): void;
  abstract lineCount(): number;
  abstract lastLine(): number;
  abstract getSelection(): string;
  somethingSelected(): boolean;
  abstract getRange(from: EditorPosition, to: EditorPosition): string;
  abstract replaceSelection(replacement: string, origin?: string): void;
  abstract replaceRange(replacement: string, from: EditorPosition, to?: EditorPosition, origin?: string): void;
  abstract getCursor(side?: 'from' | 'to' | 'head' | 'anchor'): EditorPosition;
  abstract listSelections(): EditorSelection[];
  setCursor(pos: EditorPosition | number, ch?: number): void;
  abstract setSelection(anchor: EditorPosition, head?: EditorPosition): void;
  abstract setSelections(ranges: EditorSelectionOrCaret[], main?: number): void;
  abstract undo(): void;
  abstract redo(): void;
  abstract exec(command: EditorCommandName): void;
  abstract transaction(tx: EditorTransaction, origin?: string): void;
  abstract wordAt(pos: EditorPosition): EditorRange | null;
  abstract posToOffset(pos: EditorPosition): number;
  abstract offsetToPos(offset: number): number;
  processLines<T>(
    read: (line: number, lineText: string) => T | null,
    write: (line: number, lineText: string, value: T | null) => EditorChange | void,
    ignoreEmpty?: boolean
  ): void;
}
```

#### 为什么本插件必须使用 CM6 扩展而非仅用 `Editor` 接口？
- `Editor` 适合**命令回调或批量修改**，不提供按键前拦截（`inputHandler` / `keymap`）与事务过滤（`transactionFilter`）能力。
- 结构化 LaTeX 编辑需要精确控制**单次事务原子性**（`Ctrl+Z` 一步撤回）、**零延迟按键拦截**（`o`、`Tab`、`Backspace`）、**IME 合成态判定**（`view.composing`）以及 **AST/状态缓存**（`StateField`），这些都必须直接走 CM6 扩展接口。

#### 从 Obsidian 获取底层 `EditorView` 与上下文的官方/常见方式

Obsidian 官方导出以下三个 CM6 `StateField`（定义在 `obsidian` 包中）：

```ts
import {
  editorEditorField,      // StateField<EditorView>：从 CM6 state 获取 EditorView
  editorInfoField,        // StateField<MarkdownFileInfo>：获取 file、editor 等信息（替代已废弃的 editorViewField）
  editorLivePreviewField, // StateField<boolean>：判断当前是否处于实时预览（Live Preview）模式
} from "obsidian";
```

而在 Obsidian 命令回调（拿到 `Editor`）中访问底层 `EditorView` 的通用写法（`obsidian.d.ts` 未公开声明 `.cm`，需断言）：

```ts
const cmView = (editor as unknown as { cm: EditorView }).cm;
```

### 2.4 命令、快捷键、设置页与平台检测

- **命令与快捷键（`Command` / `Keymap` / `Scope`）**：

```ts
export interface Command {
  id: string;
  name: string;
  icon?: IconName;
  mobileOnly?: boolean;
  repeatable?: boolean;
  callback?: () => any;
  checkCallback?: (checking: boolean) => boolean | void;
  editorCallback?: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => any;
  editorCheckCallback?: (checking: boolean, editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => boolean | void;
  hotkeys?: Hotkey[]; // 不建议写死默认快捷键以免冲突，可交由用户自定义
}

export class Scope {
  constructor(parent?: Scope);
  register(modifiers: Modifier[] | null, key: string | null, func: KeymapEventListener): KeymapEventHandler;
  unregister(handler: KeymapEventHandler): void;
}
```

- **设置页（`PluginSettingTab` 与 `Setting`）**：

```ts
export abstract class PluginSettingTab extends SettingTab {
  constructor(app: App, plugin: Plugin);
  display(): void;
  hide(): void;
}
```

`Setting` 常用链式方法：`setName(...)`、`setDesc(...)`、`setHeading()`、`setClass(...)`、`setDisabled(...)`、`addToggle(...)`、`addText(...)`、`addButton(...)`、`addExtraButton(...)`、`addSearch(...)`、`addDropdown(...)`、`addSlider(...)`。

- **平台判断（`Platform`）**：提供 `isDesktop`、`isMobile`、`isDesktopApp`、`isMobileApp`、`isIosApp`、`isAndroidApp`、`isMacOS`、`isWindows` 等布尔标识。

---

## 3. CodeMirror 6 核心扩展 API（本插件核心实现层）

### 3.1 注册与动态重载扩展的标准模式

`obsidian.d.ts` 在 `Plugin.registerEditorExtension` 的文档注释中明确给出了动态更新扩展的官方做法：**传入同一个可变数组引用**，在配置变更时原地清空并重新 `push`，然后调用 `this.app.workspace.updateOptions()` 触发重新配置：

```ts
import { Plugin } from "obsidian";
import { Extension } from "@codemirror/state";

export default class StructLatexPlugin extends Plugin {
  private extensions: Extension[] = [];

  async onload() {
    this.registerEditorExtension(this.extensions);
    this.reloadExtensions();
  }

  reloadExtensions() {
    this.extensions.length = 0; // 保持数组引用不变，原地替换元素
    this.extensions.push(buildStructLatexExtensions(this));
    this.app.workspace.updateOptions(); // 较重操作，仅在配置变化时调用，禁止在击键中调用
  }
}
```

> **替代轻量方案**：如果只是读取配置参数（如跳转触发键 `o`、开关布尔值），**无需每次调用 `updateOptions()`**，可以通过只读 getter/host 对象读取最新配置，或使用 CM6 的 `Compartment` 仅对目标视图做 `effects: compartment.reconfigure(...)`。

### 3.2 CM6 事件与事务执行管线

一次用户在编辑器中的输入或按键，在 CodeMirror 6 中大致按以下顺序流转：

```text
1. 浏览器原生 DOM 捕获阶段（contentDOM.addEventListener('keydown', ..., true)）
2. EditorView.domEventHandlers（冒泡/视图级原生 DOM 事件）
3. keymap（按 Prec.highest -> Prec.high -> default -> Prec.low -> Prec.lowest 顺序）
4. EditorView.inputHandler（文本输入/输入法提交转事务前的拦截点）
5. EditorState.transactionFilter（对即将提交的 Transaction 进行检查、改写或拦截）
6. StateField.update（纯函数计算新状态，禁止副作用）
7. ViewPlugin / Decoration（视图层测量、渲染装饰）
8. EditorView.updateListener（状态与 DOM 均已同步完成后的通知回调）
```

### 3.3 针对三大核心功能的 CM6 API 选型与模板

#### (1) 智能输入：`EditorView.inputHandler` vs `EditorView.updateListener`

| 对比维度 | `EditorView.inputHandler`（推荐） | `EditorView.updateListener`（`easy-typing` 方案） |
| :--- | :--- | :--- |
| 触发时机 | 原生文本插入形成事务**之前** | 原生插入事务已经落地**之后**再二次 `dispatch` |
| 撤销栈体验 | **单步原子事务**，按一次 `Ctrl+Z` 即可还原 | 原生插入 + 二次替换共两步，有时需按两次 `Ctrl+Z` 或手动合并历史 |
| 实现复杂度 | 直接拿到 `(view, from, to, text)`，构造替换范围一次提交 | 需通过 `userEvent` 过滤自身引发的递归更新 |
| IME 适配 | `view.composing` 为 true 时通常可跳过；需额外关注拼音提交瞬间的边界 | 需在 `updateListener` + `keyup` 追踪 `compose_begin_pos` / `compose_end_pos` |

`EditorView.inputHandler` 基础模板：

```ts
import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

const smartInputExt = Prec.highest(
  EditorView.inputHandler.of((view, from, to, text) => {
    // 1. 保护：只处理非只读、非选区替换（或按需处理选区包裹）、单次正常文本输入
    if (view.state.readOnly || view.composing) return false;
    if (from !== to || text.length === 0) return false;

    // 2. 判定是否处于允许的上下文（如数学模式）
    // 3. 用程序化匹配取代正则：例如拼接 doc.sliceString(windowStart, from) + text
    // 4. 命中规则时直接一次性 dispatch 原子事务并返回 true：
    // view.dispatch({
    //   changes: { from: replaceStart, to, insert: expandedText },
    //   selection: { anchor: replaceStart + caretOffset },
    //   userEvent: "struct-latex.snippet",
    // });
    // return true;

    return false;
  })
);
```

> **重要工程提醒**：在中文输入法（Microsoft Pinyin 等）下，部分提交动作可能不经 `inputHandler` 的单字符路径，或带多字符一次性提交（`text.length > 1`）。建议：`inputHandler` 对 `text` 支持任意长度且在 `view.composing === false` 时运行；如发现特定 IME 候选词提交走直接事务路径，可补充 `transactionFilter` 或 `compositionend` 兜底检查。

#### (2) 智能光标跳转：`o` 键与 `Tab` 键

- **`o` 键跳转**：作为普通字母输入，直接在 `EditorView.inputHandler` 中**优先于 snippet 匹配**执行结构化光标跳转判定。若命中跳转条件，仅派发 `{ selection: { anchor: targetPos }, userEvent: "struct-latex.jump" }`（或像 `o|$` 需插入空格时附带 `changes`）并返回 `true`。
- **`Tab` 键跳转**：Obsidian 对 `Tab` 有默认缩进行为，且列表/代码块/其他插件（如 Easy Typing、Outliner）也会绑定 `Tab`。通常有两种可靠拦截方式：
  1. **`Prec.highest(keymap.of([{ key: "Tab", run: (view) => ... }]))`**：规范的 CM6 键位方案。若当前光标不在可跳出的数学结构内，**必须返回 `false`**，将 `Tab` 完整交还 Obsidian 原生逻辑（如列表缩进、4 空格缩进）。
  2. **`contentDOM` 捕获阶段 `keydown`**：若 Obsidian 外层全局 `Scope` 或其他插件拦截了 `Tab`，可在 `ViewPlugin` 中向 `view.contentDOM.addEventListener("keydown", handler, true)` 注册捕获监听，命中条件时调用 `event.preventDefault(); event.stopPropagation();` 后执行 `view.dispatch`。需注意务必检查 `!event.isComposing && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey`。

#### (3) 结构化整体删除：`Backspace`

`Backspace` 也有两种常见接入点（建议首选 `Prec.highest(keymap.of(...))`）：

- **方案 A：`Prec.highest(keymap.of([{ key: "Backspace", run: (view) => ... }]))`（推荐）**
  - 优点：在默认删除发生**之前**介入，完全基于当前 `view.state` 和原始光标 `selection.head` 计算结构边界，避免发生先删一个 `{` 破坏 AST 再在 `transactionFilter` 里补救的窘境。
  - 注意：`selection.empty === false`（用户选中了一段文本）时必须返回 `false` 交给原生删除。
- **方案 B：`EditorState.transactionFilter`**（`easy-typing-obsidian` 采用的方案）
  - 检查 `tr.isUserEvent("delete.backward")`，在 `tr.startState` 上重新把被原生删掉 1 字符前的位置拼回去，再返回一个扩展删除范围的新事务。

结构整体删除示例：

```ts
import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";

const smartBackspaceExt = Prec.highest(
  keymap.of([
    {
      key: "Backspace",
      run: (view) => {
        const sel = view.state.selection.main;
        if (!sel.empty || view.composing) return false;

        const span = findStructuralDeleteSpan(view.state, sel.head);
        if (!span) return false;

        view.dispatch({
          changes: { from: span.from, to: span.to, insert: "" },
          selection: { anchor: span.from },
          userEvent: "delete.struct-latex",
        });
        return true;
      },
    },
  ])
);
```

---

## 4. 数学模式检测与实测避坑指南

### 4.1 两种数学区域检测途径对比

| 方案 | API / 机制 | 优点 | 缺陷与注意事项 |
| :--- | :--- | :--- | :--- |
| **Lezer / HyperMD 语法树（推荐为主）** | `@codemirror/language` 的 `syntaxTree(state)` / `ensureSyntaxTree(state, pos)` | 与 Obsidian 自身渲染完全一致，天然排除代码块、行内代码、YAML Frontmatter、转义 `\$` 与正文孤立 `$$` | 对极长文档视口外部分可能尚未增量解析完，在需要全文解析时可用 `ensureSyntaxTree(state, upto, timeoutMs)` |
| **自研全文扫描器** | 从头遍历文本匹配 `$`、`$$`、`\(`、`\[` | 零外部节点名依赖，可同步拿到内部区间偏移 | **极易误判（本次实测已复现坑点，见 4.3）** |

### 4.2 使用 `syntaxTree(state)` 判定数学模式与代码块

在 Obsidian 的 CM6（HyperMD）语法树中，数学公式与代码块节点的命名规律如下（参考 `easy-typing-obsidian` 与 `obsidian-latex-suite` 的实际用法）：

- 数学相关节点名通常包含 `"math"`（如 `formatting-math`、`formatting-math-begin`、`formatting-math-end`、`math`、`math_tag` 等）；
- 代码块 / 行内代码节点名通常包含 `"code"`（如 `HyperMD-codeblock`、`inline-code`、`formatting-code_inline-code`，需注意排除 `"link"`）。

判定当前光标是否在数学模式内的常用辅助函数：

```ts
import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";

export function isCursorInMathViaTree(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  // 向左与向右同时解析，处理紧贴闭合 $ 或 $$ 内侧的边界情况
  const left = tree.resolveInner(pos, -1);
  const right = tree.resolveInner(pos, 1);

  const hasMath = (node: typeof left | null): boolean => {
    while (node) {
      if (node.name.includes("math")) return true;
      node = node.parent;
    }
    return false;
  };

  // 若光标正好落在闭合标记 `formatting-math-end` 起始边界前，left 往往在数学内而 right 在边界上
  return hasMath(left) && !left.name.includes("formatting-math-begin")
    ? true
    : hasMath(right) && !right.name.includes("formatting-math-end");
}
```

> **开发建议**：在 Obsidian 实测中应先通过小脚本打印各场景（行内 `$...$` 首尾与内部、跨行 `$$...$$`、引用块 `> $$...$$`、列表缩进块、行内代码 `` `$x$` ``）下 `tree.resolveInner(pos, -1/1)` 的实际节点链，精确校准边界判定。

### 4.3 本次实测暴露的数学扫描器坑点（重要）

在对 `TestObsidian` 现存原型 `struct-latex`（`0.0.1`）及 `Test.md` 进行真机输入实测时，直接复现了朴素扫描器的两个典型 Bug：

1. **正文孤立 `$$` 翻转全文数学模式**：
   `Test.md` 第 5 行为普通中文说明 `在 $$ 块里试：sukn / ll( / 1+2+3 再按 o 或 Tab`。由于其中出现了未成对的 `$$`，朴素 `scanMath` 从第 5 行开始一直到文件末尾（或下一个 `$$` 块）全部误判为数学块！而当后面真正插入一个 `$$\n...\n$$` 时，第 5 行的 `$$` 又与新块的开头 `$$` 配对，导致**真正的 `$$` 块内部反而被判定为非数学区**，结果在该块内按 `Tab` 无法跳出而退化为插入 4 个空格！
2. **区间右边界开闭错误（`pos < r.to`）**：
   `struct-latex` 使用 `pos > r.from && pos < r.to`，导致光标停留在未闭合块的末尾（`pos === doc.length`）时判定 `inMath = false`，而插入 `\left(\right)` 后光标位于中间（`pos < doc.length`）又突然变成 `true`，造成同一个句子前半段与后半段由不同引擎处理。

**规避准则**：
- 优先依赖 Obsidian 自带的 `syntaxTree(state)` 识别数学区，并严格区分**独立行块级 `$$`** 与**行内 `$...$` /正文提及符号**；
- 通过 `StateField` 缓存当前文档或当前数学块的解析结构（利用 `WeakMap<EditorState, ...>` 或在 `StateField.update` 中随 `tr.docChanged` 增量失效/局部重算），避免每次按键全文重扫。

---

## 5. 撤销栈（History）、IME 合成态与并发冲突处理

### 5.1 原子撤销栈与防递归标记

- **标注 `userEvent`**：每次插件派发事务都应带上专属 `userEvent`（如 `"struct-latex.input"`、`"struct-latex.jump"`、`"delete.struct-latex"`），便于 `updateListener` / `transactionFilter` 识别并跳过自己派发的事务，防止死循环。
- **独立历史步（`isolateHistory`）**：若希望模板展开与前后普通打字在按 `Ctrl+Z` 时分开撤销，可注入 `@codemirror/commands`（早期版本亦见于 `@codemirror/history`）提供的 `isolateHistory` 注解：

```ts
import { Transaction } from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";

view.dispatch({
  changes: { from, to, insert },
  selection: { anchor: caret },
  annotations: [isolateHistory.of("full")],
  userEvent: "struct-latex.input",
});
```

- **不入历史记录**：内部辅助状态同步或非用户感知的修饰性变更使用 `Transaction.addToHistory.of(false)`。
- **检测撤销/重做**：在 `StateField.update` 中可通过 `tr.isUserEvent("undo") || tr.isUserEvent("redo")` 清理或恢复自定义槽位状态。

### 5.2 中文输入法（IME / MS-IME）合成态处理

Windows 下（如微软拼音）使用中文输入法时，存在明显坑点（本次真机实测首轮输入 `sukn` 即触发过 `su'k'n` 拼音切分）：

- `EditorView.composing`（布尔值）与原生 DOM `KeyboardEvent.isComposing` 用于判断当前是否处于输入法合成态；**合成期间严禁吞掉 `Enter`、`Backspace`、`Tab` 或随意改写文档**，否则会锁死 CM6 合成状态或截断候选词。
- 若需处理“中文状态误打出的符号（如 `￥` -> `$`）”，应在 `compositionend` 之后或确定 `view.composing === false` 的普通提交后触发。

### 5.3 多槽位 / Tabstop 追踪设计（`StateField` + `StateEffect` + `Decoration`）

对于 `\frac{|}{}`、`\sqrt[|]{}`、`∑_{|=}^{}` 等多槽位结构，建议结合两层机制：
1. **静态结构解析（主机制，无状态、最健壮）**：随时根据当前光标所在 AST 节点定位括号/花括号边界——哪怕用户用鼠标点进历史公式或切换文件回来，`Tab` 和 `Backspace` 依然 100% 有效（正则和纯临时 Tabstop 做不到这一点）。
2. **动态槽位高亮（可选增强）**：借助 `StateField` + `StateEffect` 维护当前活跃槽位，在 `tr.docChanged` 时用 `tr.changes.mapPos(pos, bias)` 自动映射偏移，并通过 `EditorView.decorations`（`Decoration.mark` / `Decoration.widget`）提供轻量视觉提示。

### 5.4 与原生功能及其他插件的兼容性

- **Obsidian 原生自动配对**：用户可在 Obsidian 设置中关闭 `autoPairBrackets`（在 `TestObsidian/.obsidian/app.json` 中当前为 `false`）；若用户开启了原生配对，本插件应在数学模式下以 `Prec.highest` 接管配对字符，防止双倍插入或冲突。
- **避免多插件抢占同一快捷键**：当 `Tab`、`Backspace`、`o` 不命中本插件结构条件时，务必返回 `false`，保证不破坏列表缩进、代码块编辑与普通正文输入。
