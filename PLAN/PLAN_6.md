# PLAN 6 — 设置页精简、编辑按钮文字化与移动端弹窗卡闪根治

日期：2026-11-22  
状态：已定稿（采用方案 A）

## 1. 需求与根因

### 1.1 需求
1. 删除设置页工具栏中的「全部类型」下拉框（与下方「JS」「正则」「纯替换」三个筛选按钮功能重复）。
2. 解决手机端点击「导出 rules.json」「导入 rules.json」「恢复默认规则」「+JS」「+正则」以及规则行「编辑」按钮时的屏幕卡闪问题。
3. 将规则行「编辑」按钮由小图标改为「编辑」（英文 `Edit`）文字按钮，提升移动端可点击性；删除按钮维持垃圾桶图标不变。

### 1.2 移动端“卡闪”根因定位
1. **已排除假设 1（非重复读写或重解析 `rules.json`）**：
   - `ruleStore.load()` 仅在 `src/main.ts` 的 `onload()` 中调用一次；点击设置页按钮不会重新读盘、反序列化或全量重解析 `rules.json`。
   - 点击「恢复默认规则」「导入 rules.json」瞬间甚至完全未接触 `ruleStore`、`JSON.parse`/`JSON.stringify` 与 MathJax。
2. **已排除假设 2（非 182 行规则 DOM 过重作为主因）**：
   - 用户实测将「JS」「正则」「纯替换」三个类型筛选全部点灭（列表仅剩 0 行规则的空提示容器）后，点击上述按钮**依然出现相同卡闪**。
3. **锁定真因（Obsidian 移动端叠层 `Modal` 机制）**：
   - 会触发卡闪的 6 个入口恰好 **100% 对应**设置页中所有会调用 `new Modal(this.app).open()` 的按钮（不弹窗的「+ 纯替换」与启用开关均正常）。
   - 在 0 行状态下点击「恢复默认规则」时，插件仅执行 `new ConfirmResetModal(this.app, cb).open()` 并插入 1 个 `<h3>`、1 个 `<p>` 与 2 个按钮，无重计算也无影响全局的 CSS。
   - 这表明卡闪根源在于 **Obsidian 移动端在全屏设置页（`.modal-container.mod-settings`）之上再叠加第二层原生 `Modal`（`.modal-container`）时的原生入场动画（`obsidian.d.ts` 注明 `On phones, the modal will animate on screen.`）、遮罩层重合成与焦点/历史栈切换**。
4. **次生叠加问题（一并治理）**：
   - 弹窗保存/导入/恢复默认或行内删除后，`settingTab.ts` 直接调用整页 `this.display()`，清空 `rowCache`、销毁 `previewManager` 并同步重建全部 182 行 DOM。
   - `settingTab.ts` 与 `ruleStore.save()` 之间存在两次全量 `cloneRule`（`JSON.parse(JSON.stringify(...))`）深拷贝。
   - `styles.css` 中 `.struct-latex-edit-modal { width: min(720px, 92vw); }` 在移动端窄屏下与手机端弹窗全宽布局冲突。

---

## 2. 目标语义与方案

### 2.1 删除「全部类型」筛选下拉框
- 移除 `src/settings/settingToolbar.ts` 中的 `typeSelect` 下拉控件以及 `FilterState.typeFilter` 字段（`filterRules` 仅依据 `enabledTypes`、`groupFilter` 与 `searchQuery` 过滤），并对外返回 `ToolbarHandle` 支持动态同步分组下拉选项与工具栏面板激活态。
- 删除 `src/i18n/` 中不再使用的 4 个词条（`toolbar.allTypes`、`toolbar.typeText`、`toolbar.typeRegex`、`toolbar.typeJs`）。
- 同步更新 `tests/settings/toolbarAndI18n.test.ts` 中的筛选断言。

### 2.2 彻底消除设置页叠层弹窗（采用方案 A：全端统一页内子视图与内联面板）
1. **规则编辑改为页内子视图（`ruleEditorView.ts` + `ruleEditorFields.ts`）**：
   - 点击「+JS」「+正则」或任意规则的「编辑」按钮时，不再打开第二层 `Modal`，而是在 `StructLatexSettingTab` 内切换为**页内编辑子视图**（顶部提供「← 返回规则列表」导航栏，主体保留原有表单、按需渲染键位录制并附带清理器、实时试跑与 MathJax 预览、上下文守卫与校验）。
   - 切换时记录主列表滚动位置并通过 `.struct-latex-hidden` 隐藏主视图容器，保留 `listContainer` 与 `rowCache`；取消或返回时立即恢复原滚动位置，保存后仅做增量/局部刷新。
2. **导出 / 导入 / 恢复默认改为工具栏下方内联面板（`ruleInlinePanels.ts`）**：
   - 点击「导出 rules.json」「导入 rules.json」「恢复默认规则」时，不再打开 `Modal`，而是在工具栏下方原地展开对应的**内联操作面板**（再点同按钮或点「收起 / 取消」即可闭合）：
     - 导出：提供一键复制按钮（兼容剪贴板 API 与 `execCommand("copy")` 回退）与只读 JSON 文本框（不自动聚焦避免手机弹出输入法）；
     - 导入：提供粘贴框、校验失败内联错误提示与「校验并导入」按钮；
     - 恢复默认：提供内联说明文案与「取消 / 确认恢复默认」操作条。
3. **移除旧弹窗壳并治理次生性能开销**：
   - 直接删除 `ruleModals.ts`、`ruleModalFields.ts`、`ruleEditModal.ts`，`src/settings/` 实现零 `Modal` 依赖。
   - 保存/导入/重置/删除后不再调用整页 `this.display()` 销毁重建，改为更新计数、同步分组下拉、裁剪失效缓存行并调用 `renderRuleList()` 复用未变更行 DOM；消除 `settingTab.ts` 中对全量规则数组的冗余 `map(cloneRule)`。
   - 为 `.struct-latex-rule-row` 增加 `contain: layout style;` 隔离单行重排范围。

### 2.3 规则「编辑」按钮文字化
- 将 `src/settings/ruleRowRenderer.ts` 中的 `editBtn` 由 `clickable-icon` + `setIcon(...)` 改为文字按钮：中文显示「编辑」、英文显示「Edit」（新增 `row.editBtn` 词条，保留原有 `title` 与 `aria-label` 辅助提示）。
- 在 `styles.css` 中为 `.struct-latex-edit-btn` 设置合理内边距、最小高度与 `white-space: nowrap`（窄屏/手机端进一步放大触控区）。
- 删除按钮保持原垃圾桶图标不变。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_6.md`：本计划文档。
- `src/settings/ruleInlinePanels.ts`：设置页内联操作面板（导出/导入/恢复默认）、预览框、JS 速查与可清理按键录制器。
- `src/settings/ruleEditorFields.ts`：规则编辑页内子视图的绑键与上下文守卫字段渲染。
- `src/settings/ruleEditorView.ts`：页内规则编辑子视图（替代原 `RuleEditModal`）。
- `src/settings/settingGeneralSection.ts`：设置页通用开关、语言/输出风格及新增规则入口渲染。

### 删除
- `src/settings/ruleModals.ts`
- `src/settings/ruleModalFields.ts`
- `src/settings/ruleEditModal.ts`

### 修改
- `src/settings/settingToolbar.ts`：移除「全部类型」下拉框与 `typeFilter` 状态，新增 `ToolbarHandle` 同步分组与面板激活态。
- `src/settings/ruleRowRenderer.ts`：规则「编辑」按钮改为文字按钮并重命名回调 `onOpenEditor`（删除按钮保留图标不变）。
- `src/settings/settingTab.ts`：拆分 `mainViewEl` / `editorViewEl` 与 `inlinePanelEl`，支持页内编辑切换、滚动位置保持与局部刷新。
- `src/i18n/types.ts`、`src/i18n/zh.ts`、`src/i18n/en.ts`：删除废弃类型下拉框词条，新增 `row.editBtn`、`editor.back`、`panel.close`、`panel.importPlaceholder`。
- `styles.css`：新增 `.struct-latex-hidden`、编辑文字按钮、内联面板、页内编辑子视图及行布局隔离样式，移除 `.struct-latex-edit-modal`。
- `tests/settings/toolbarAndI18n.test.ts`：同步更新筛选单测与新增编辑按钮文案断言。
- `REQUIRMENT.md`：同步设置页筛选、页内编辑与内联操作面板说明。

---

## 4. 验证方式

1. `npm run typecheck`、`npm test`、`npm run build` 全通过，确认产物 `main.js` 未内联 `obsidian`、`@codemirror/*`、`@lezer/*`。
2. 自动化单测覆盖：移除 `typeFilter` 后的复合筛选、i18n 中英文键全对齐及编辑按钮文案。
3. 全库搜索确认无 `ruleModals` / `ruleModalFields` / `ruleEditModal` / `typeFilter` 与设置层 `Modal` 残留，所有 `src/settings/*.ts` 单文件 ≤300 行。
4. 同步产物至 `C:\Users\Administrator\Desktop\TestObsidian` 并在真实 Obsidian（桌面端与手机端）实测：
   - 工具栏无「全部类型」下拉框，三颗类型按钮筛选正常；
   - 规则行「编辑」按钮显示清晰好点，删除按钮保留垃圾桶图标；
   - 导出/导入/恢复默认/`+JS`/`+正则`/规则「编辑」在手机端 0 行与全量规则下均零卡闪，保存、导入、重置、返回列表与滚动定位正常，控制台零报错。

---

## 5. 回退方案

- 删除 `PLAN/PLAN_6.md` 与新增的 3 个 `src/settings/rule*.ts` 文件，并通过 `git checkout -- src/ styles.css tests/ REQUIRMENT.md` 恢复被修改/删除文件后重新运行 `npm run build`，即可完整回退至 `PLAN 5` 状态。
