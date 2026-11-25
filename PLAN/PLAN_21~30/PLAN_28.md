# PLAN 28 — 向左单对象跳转与向左多对象跳转

日期：2026-11-25

## 1. 需求与设计目标

在 `PLAN 27` 四向「光标跳转」架构基础上，完整实现**向左单对象跳转（`leftSingle`）**与**向左多对象跳转（`leftMulti`）**，并开放设置页中对应两个子页面入口：

1. **严格互逆停靠点**：
   - `leftSingle`：二分查找最后一个满足 `seg.coreFrom < relPos` 的段并落于 `seg.coreFrom`（实体与尾随空格内均回跳至该对象左端），使全部停靠点与 `rightSingle` 互为逆序。
   - `leftMulti`：通过一次 $O(N)$ 正向扫描为每段预计算 `solidRunFrom`（同层连续实心序列左端；括号边界段 `solidRunFrom === coreFrom`）；命中括号边界时落于 `seg.coreFrom`，命中实心对象时落于 `seg.solidRunFrom`（直跳同层连续实心序列开头、不超过嵌套），与 `rightMulti` 互为逆序。
2. **左出数学块（`resolveMathBlockLeftExit`）**：
   - **行内公式（`$...$` / `\(...\)`）**：左侧紧贴非空白文本（`hello|$x$`）时补单个 `" "` 并落于空格前（`hello| $x$`）；左侧已有水平空格且前方有同行内容（`hello |$x$`）时越过空格落于 `hello| $x$`；位于行首或仅前置缩进时仅纯移至行首，不增加前导空格。
   - **块级公式（`$$...$$` / `\[...\]`）**：同行前置全空白时有上一行则纯移至上一行行尾、第 1 行则文首插入 `"\n"` 并停于偏移 `0`；同行前置非空白文本时在 `blockFrom` 前插入 `"\n"` 并停于换行前。
3. **默认不绑快捷键 & 全三类触发通道**：
   - `smartJumpLeftSingleKey` 与 `smartJumpLeftMultiKey` 默认为 `""`（不劫持键盘任何键位），设置页支持清空保存与一键恢复未绑定状态；完整支持 `trigger.json`（`jumpLeftSingleRules`、`jumpLeftMultiRules`）、Obsidian 全局命令与移动端工具栏手动添加。

---

## 2. 文件清单

### 新增
- `PLAN/PLAN_21~30/PLAN_28.md`：本计划文档。

### 修改
- `src/parser/types.ts`、`src/parser/jumpResolver.ts`：扩展 `StructuralJumpMode`、预计算 `solidRunFrom` 与向左二分查找。
- `src/input/types.ts`、`src/input/triggerTypes.ts`、`src/input/triggerEngine.ts`：新增左跳转开关/默认空快捷键与 `jumpLeftSingleRules` / `jumpLeftMultiRules`。
- `src/editor/smartJump.ts`、`src/main.ts`：实现 `resolveMathBlockLeftExit`、修复前缀剥离+左外跳变更排序并注册 4 组跳转扩展与命令。
- `src/settings/triggerStore.ts`、`src/settings/mobileToolbarSync.ts`、`src/settings/settingGeneralSection.ts`、`src/settings/settingJumpSection.ts`：支持 5 类触发存储、命令映射、可选空快捷键及 4 项详情页表驱动渲染。
- `src/settings/settingAboutAndSpecial.ts`、`src/i18n/types.ts`、`src/i18n/zh.ts`、`src/i18n/en.ts`、`REQUIRMENT.md`：递增 `BUILD_TAG` 至 `"123"`、补全双语词条与需求文档。
- `tests/parser/structuralJump.test.ts`、`tests/input/triggerEngine.test.ts`、`tests/settings/toolbarAndI18n.test.ts`：补充左单/多跳、触发剥离及默认空快捷键单测。

---

## 3. 验证方式

- 运行 `npm run typecheck`、`npm test`、`npx eslint`（改动文件）与 `npm run build` 全部通过，所有 `src/*.ts` 文件 ≤ 300 行；
- 同步 `manifest.json`、`main.js`、`styles.css` 至 `C:\Users\Administrator\Desktop\TestObsidian\.obsidian\plugins\struct-latex` 供用户真机验收。

---

## 4. 回退方案

- 通过 Git 还原上述修改文件，删除 `PLAN/PLAN_21~30/PLAN_28.md` 并重新执行 `npm run build` 即可恢复至 `PLAN 27` 状态。
