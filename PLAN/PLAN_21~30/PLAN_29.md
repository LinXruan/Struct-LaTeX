# PLAN 29 — 清理校验冗余断言与发布 1.0.3 版本

日期：2026-11-27

## 1. 需求与背景

- **需求**：将插件发布版本由 `1.0.2` 升级至 `1.0.3`、内部版本号 `BUILD_TAG` 由 `"123"` 递增至 `"124"`，核查 Obsidian 社区插件更新要求并推送 tag `1.0.3` 触发 GitHub Actions 自动发版。
- **社区核查结论**：
  - 本插件已上架 Obsidian 社区插件库（`struct-latex`），在元数据 `id`/`name`/`author`/`description` 不变的前提下，仅需发布符合规范的 GitHub Release（tag 为 `1.0.3` 无 `v` 前缀，附带 `main.js`、`manifest.json`、`styles.css`），无需再次向 `obsidian-releases` 提交 PR。
  - `1.0.2..HEAD` 新增代码通过社区规则校验，仅 [`src/input/triggerEngine.ts`](../../src/input/triggerEngine.ts) 第 114–116 行存在 3 处 `@typescript-eslint/no-unnecessary-type-assertion` 报错；历史保留项（用户 JS 规则所需的 `new Function` 与兼容 1.4.0+ 的 `PluginSettingTab#display()`）维持与已过审 `1.0.2` 一致。

---

## 2. 目标语义与方案

1. **清理多余类型断言（`src/input/triggerEngine.ts`）**：
   - 将 `validateTriggerFile` 第 114–116 行 `(raw.jumpRightMultiRules as unknown[] | undefined) ?? []` 等 3 处断言移除，直接传入 `raw.jumpRightMultiRules ?? []`。
2. **版本升级与双轨流水号递增**：
   - `manifest.json`、`package.json`、`package-lock.json` 的 `"version"` 升级至 `"1.0.3"`；
   - `versions.json` 新增 `"1.0.3": "1.4.0"`；
   - `src/settings/settingAboutAndSpecial.ts` 的 `BUILD_TAG` 从 `"123"` 递增至 `"124"`。
3. **构建同步与发版**：
   - 同步 `manifest.json`、`main.js`、`styles.css` 至 `C:\Users\Administrator\Desktop\TestObsidian\.obsidian\plugins\struct-latex`；
   - 提交并推送 `main` 与 tag `1.0.3` 至 `origin`，触发 `.github/workflows/release.yml` 构建并发布 GitHub Release。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_21~30/PLAN_29.md`：本计划文档。

### 修改
- `manifest.json`、`versions.json`、`package.json`、`package-lock.json`
- `src/settings/settingAboutAndSpecial.ts`
- `src/input/triggerEngine.ts`

---

## 4. 验证方式

- 运行 `npm run typecheck`、`npm test`、`npm run build`、`npm run lint`：类型检查与全部单测通过、`main.js` 未内联外部依赖、`triggerEngine.ts` 多余类型断言 lint 报错清零。
- 同步产物至 `TestObsidian` 供真机验证，并确认 GitHub Actions `1.0.3` Release 工作流运行通过。

---

## 5. 回退方案

- 若需撤回，删除远端/本地 `1.0.3` tag 及对应 GitHub Release，回退本提交并重新构建即可恢复至发布前状态。
