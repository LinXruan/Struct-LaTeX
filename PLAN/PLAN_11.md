# PLAN 11 — 双语默认规则模板与 SHA-256 自动语言切换

日期：2026-11-22

## 1. 需求与背景

- **问题现象**：插件内置默认规则（`src/input/defaultRules.ts`、`defaultJsRules.ts`、`defaultSymbolRules.ts`）的所有分组（`group`）与规则名称（`name`）均为硬编码中文；在英文环境或切换界面语言时，规则列表仍显示中文分组与中文名称，无法随语言自动本地化。
- **目标**：
  1. 在插件目录中维护 `rules_zh.json` 与 `rules_en.json` 两套默认规则模板，首次启动按当前生效语言生成 `rules.json`。
  2. 插件升级且内置规则变化时，自动同步更新磁盘上的 `rules_zh.json` 与 `rules_en.json`。
  3. 切换语言（含设置页手动切换与 `auto` 模式下 Obsidian 语言变更后重启）或启动升级时，使用跨平台一致的 SHA-256 校验 `rules.json` 是否仍等于任意一份官方模板：未修改则自动切换/升级 `rules.json` 至目标语言模板，已修改则保留用户自定义规则不被覆盖。
  4. 「恢复默认规则」从当前生效语言对应的 `rules_<locale>.json` 恢复 `rules.json`（模板缺失或损坏时自动重建）。

---

## 2. 目标语义与方案

1. **跨平台一致的 SHA-256 与规范化（`src/input/ruleHash.ts`）**：
   - 采用纯 TypeScript FIPS 180-4 SHA-256 + UTF-8 `TextEncoder`，不依赖 Node `node:crypto`（兼容移动端 `isDesktopOnly: false`）及异步 `crypto.subtle`。
   - 计算哈希前先做规范化（`canonicalizeRulesText`）：去除 UTF-8 BOM、统一换行为 `\n`；若可解析且通过 `validateRulesFile` 校验，则以统一 `serializeRulesFile`（2 空格缩进 + 末尾 `\n`）序列化后再算哈希，消除 Windows CRLF / BOM / 空白缩进带来的跨平台差异。
2. **双语默认规则映射（`src/input/defaultRuleLabels.ts`、`src/input/defaultRules.ts`）**：
   - 保持唯一规则逻辑源，通过分组与规则 ID 映射表提供英文 `group` 与 `name`，`createDefaultRules(locale = "zh")` / `createDefaultRulesFile(locale = "zh")` 输出对应语言规则集。
3. **模板同步、校验切换与重置（`src/settings/ruleStore.ts`）**：
   - `syncOfficialTemplates()`：先记录磁盘既有 `rules_zh.json` / `rules_en.json` 的哈希（`prevHashes`），再与内置最新模板比对，若缺失、损坏或内容变更则覆写更新，返回最新及历史官方模板哈希集合。
   - `load(activeLocale)`：同步模板后，若 `rules.json` 不存在则由 `rules_<activeLocale>.json` 初始化；若存在且其规范哈希命中任意官方模板哈希（含旧版）且不等于当前 `activeLocale` 最新模板，则自动切换/升级为最新 `rules_<activeLocale>.json`。
   - `syncRulesForLocale(targetLocale)`：设置页切换语言时，校验当前 `rules.json` 是否匹配任意官方模板哈希，未修改且非目标语言时切换至 `rules_<targetLocale>.json` 并重编译。
   - `resetToDefaults(activeLocale)`：确保 `rules_<activeLocale>.json` 有效后读取并覆写 `rules.json`。
4. **生命周期与文案联动（`src/main.ts`、`src/settings/*`、`src/i18n/*`）**：
   - `onload()` 解析语言后传入 `ruleStore.load(locale)`；设置页切换语言时先等待 `ruleStore.syncRulesForLocale(locale)` 再重建设置界面并清理规则列表缓存。
   - 同步更新 `settings.language.desc` 中英文说明与 `REQUIRMENT.md`。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_11.md`：本计划文档。
- `src/input/ruleHash.ts`：纯 TS 跨平台 SHA-256、规则文件规范化序列化与哈希计算。
- `src/input/defaultRuleLabels.ts`：官方默认规则英文分组与名称映射表及本地化 helper。
- `tests/settings/ruleStoreSync.test.ts`：模板生成、升级同步、SHA-256 跨平台规范化、语言切换与重置的自动化测试。

### 修改
- `src/input/defaultRules.ts`：支持按 `Locale` 生成中文或英文默认规则。
- `src/settings/ruleStore.ts`：维护 `rules_zh.json` / `rules_en.json`、官方升级同步、`syncRulesForLocale` 与按语言重置。
- `src/main.ts`：启动按语言加载 `RuleStore`，语言变更时同步切换未修改的规则文件。
- `src/settings/settingGeneralSection.ts`、`src/settings/settingTab.ts`：异步等待语言同步后刷新列表缓存与面板。
- `src/i18n/zh.ts`、`src/i18n/en.ts`：更新语言设置描述文案。
- `tests/input/defaultRules.test.ts`：补充中英文规则完整性、一致性与无残留中文校验。
- `REQUIRMENT.md`：同步记录双语默认规则模板、SHA-256 校验切换与升级同步机制。

---

## 4. 验证方式

1. **类型检查、自动化单测与构建**：
   - 运行 `npm run typecheck`、`npm test`、`npm run build`，全部通过且 `main.js` 未内联外部依赖。
2. **Obsidian 真机验收（`C:\Users\Administrator\Desktop\TestObsidian`）**：
   - 同步 `manifest.json`、`main.js`、`styles.css` 到测试仓库 `.obsidian/plugins/struct-latex/`，停用 `easy-typing-obsidian`。
   - 实测首次生成 `rules_zh.json`、`rules_en.json` 与 `rules.json`；实测未修改规则时中英文切换自动更新 `rules.json`；修改一条规则后切换语言保留自定义内容；点击恢复默认恢复当前语言默认规则；确认控制台零报错。

---

## 5. 回退方案

- 删除 `PLAN/PLAN_11.md`、`src/input/ruleHash.ts`、`src/input/defaultRuleLabels.ts`、`tests/settings/ruleStoreSync.test.ts`，并通过 `git checkout --` 恢复被修改文件后重新执行 `npm run build` 并同步测试仓库即可无损回退至 `PLAN 10` 状态。
