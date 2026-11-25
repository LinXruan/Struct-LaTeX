# PLAN 27 — 向右多对象跳转（同层实心连跳）与四向光标跳转设置架构

日期：2026-11-25

## 1. 需求与根因

- **需求**：
  1. 在保留原有 `Tab` 单步光标跳转（向右单对象跳转）的基础上，新增「**向右多对象跳转**」：面对嵌套结构（`BracketObject` 开/闭/槽间边界）时跳转行为与单步一致，面对同层级连续实心对象（`WordObject` / `AtomObject`）时直接跳转至该同层实心序列末尾（不超过嵌套边界）。
  2. 为后续扩展「向左单对象跳转」「向左多对象跳转」预留导航架构：将设置页「光标跳转」选项卡改造为四向入口页（向右单对象跳转、向右多对象跳转、向左单对象跳转、向左多对象跳转），点开各自进入对应配置页；未来左跳转默认不绑定快捷键。
- **可行性与设计基础**：
  - `collectJumpSegments(tree)` 对 `MathTree` 做先序遍历，由于所有 `BracketObject` 均至少包含 1 个 `Slot` 且开界/槽间/闭界段严格满足 `coreTo > coreFrom`，不同嵌套层级的实心对象在段序列中绝不直接相邻，必定被非实心括号边界段隔开。
  - 因此只需在 `JumpSegment` 上增加 `isSolid` 与 `solidRunTo`，构建时一次 $O(N)$ 反向扫描即可完成预计算，查询仍复用 `WeakMap<Text, AnalyzedMathBlock>` 缓存与 $O(\log N)$ 二分查找，零特例、零复杂度增量。

---

## 2. 目标语义与方案

1. **纯解析层（`src/parser/types.ts`、`src/parser/jumpResolver.ts`）**：
   - 新增 `StructuralJumpMode = "rightSingle" | "rightMulti"`，为 `JumpSegment` 增加 `isSolid: boolean` 与 `solidRunTo: number`。
   - `collectJumpSegments()` 末尾反向扫描计算同层连续实心序列末尾 `solidRunTo`（非实心段 `solidRunTo === to`）；`resolveStructuralJump(..., mode)` 按模式返回 `seg.to` 或 `seg.solidRunTo`。
   - 严格零特例：`\\`、`&`、无花括号上下标 `_2`/`^n` 及 `\text{...}` 内字符均依纯对象模型按实心对象处理。
2. **设置、触发引擎与命令接入（`src/input/`、`src/settings/`、`src/editor/`、`src/main.ts`）**：
   - `PluginSettings` 新增 `smartJumpRightMultiEnabled`（默认 `true`）与 `smartJumpRightMultiKey`（默认 `"Shift+Tab"`，非数学区完整放行原生）。
   - `TriggerCategory` 扩展为 `"jump" | "jumpRightMulti" | "delete"`，`TriggerFileData` 新增可选字段 `jumpRightMultiRules?: TriggerRule[]`（向后兼容旧版 `trigger.json`）；`resolvePureStructuralJumpWithTrigger` 透传 `StructuralJumpMode`。
   - 注册全局编辑器命令 `struct-latex:smart-jump-right-multi`（图标 `lucide-chevrons-right`），支持在设置页手动添加至 Obsidian 移动端工具栏（保持仅首次安装自动注入 `struct-latex:smart-jump`）。
   - 新增 `src/settings/settingJumpSection.ts` 渲染「光标跳转」四向入口页与 `rightSingle`/`rightMulti` 二级详情页（`leftSingle` / `leftMulti` 预留禁用入口），`StructLatexSettingTab` 维护 `activeJumpMode` 以支持逐层返回与触发规则编辑后回原页。
3. **版本流水号**：
   - 按规范将 `src/settings/settingAboutAndSpecial.ts` 的 `BUILD_TAG` 从 `"121"` 递增至 `"122"`。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_21~30/PLAN_27.md`：本计划文档。
- `src/settings/settingJumpSection.ts`：光标跳转四向导航页与向右单/多对象跳转详情页渲染。

### 修改
- `src/parser/types.ts`、`src/parser/jumpResolver.ts`：新增 `StructuralJumpMode`、`isSolid` / `solidRunTo` 预计算与多对象解析模式。
- `src/input/types.ts`、`src/input/triggerTypes.ts`、`src/input/triggerEngine.ts`：新增向右多对象跳转开关/默认快捷键与 `jumpRightMultiRules` 校验/求值。
- `src/editor/smartJump.ts`、`src/main.ts`：扩展跳转模式参数并注册向右多对象跳转键盘劫持、输入触发与全局命令。
- `src/settings/triggerStore.ts`、`src/settings/mobileToolbarSync.ts`、`src/settings/settingGeneralSection.ts`、`src/settings/settingTab.ts`、`src/settings/triggerRowAndEditor.ts`：支持三类触发存储映射、命令映射与四向设置子页路由。
- `src/settings/settingAboutAndSpecial.ts`、`src/i18n/types.ts`、`src/i18n/zh.ts`、`src/i18n/en.ts`、`REQUIRMENT.md`：递增 `BUILD_TAG`、补全双语词条与需求文档。
- `tests/parser/structuralJump.test.ts`、`tests/input/triggerEngine.test.ts`、`tests/settings/toolbarAndI18n.test.ts`：补充自动化单测。

---

## 4. 验证方式

- 运行 `npm run typecheck`、`npm test`、`npm run lint`、`npm run build` 全部通过，确认所有 `src/` 文件 ≤ 300 行且 `main.js` 未内联外部依赖；
- 将 `manifest.json`、`main.js`、`styles.css` 同步至 `C:\Users\Administrator\Desktop\TestObsidian\.obsidian\plugins\struct-latex` 供用户真机验收。

---

## 5. 回退方案

- 通过 Git 还原上述修改文件，删除 `src/settings/settingJumpSection.ts` 与 `PLAN/PLAN_21~30/PLAN_27.md` 并重新执行 `npm run build` 即可无损恢复。
