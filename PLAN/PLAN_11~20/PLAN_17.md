# PLAN 17 — 上架准备：versions.json、GitHub 自动发版与 Obsidian 官方 ESLint 预检

日期：2026-11-23

## 1. 需求与背景

- **需求**：为上架 Obsidian 官方第三方插件库做最后工程准备：
  1. 补充根目录 `versions.json`，标明插件版本与最低 Obsidian 客户端版本映射。
  2. 新增 `.github/workflows/release.yml`，实现打 tag 后自动构建、测试并发布附带 `main.js`、`manifest.json`、`styles.css` 的 GitHub Release。
  3. 接入官方 `eslint-plugin-obsidianmd` 规则集运行全量预检，排查并汇报或修复影响上架审核的问题。

---

## 2. 目标语义与方案

1. **`versions.json`**：
   - 在项目根目录新增 `versions.json`，写入 `{"1.0.0": "1.4.0"}`（与 `manifest.json` 一致）。
2. **GitHub Actions 自动发布流（`.github/workflows/release.yml`）**：
   - 触发条件：推送符合版本规范的 Git tag（`tags: ["*"]`），并在流程内校验 `github.ref_name` 与 `manifest.json` 的 `version` 完全一致（防止误带 `v` 前缀）。
   - 执行步骤：检出代码 → 安装 Node.js 与依赖（`npm ci`）→ `npm run typecheck` → `npm test` → `npm run build` → 自动创建 GitHub Release 并上传 `main.js`、`manifest.json`、`styles.css`。
3. **官方规则预检（`eslint-plugin-obsidianmd`）**：
   - 安装 `eslint`、`eslint-plugin-obsidianmd` 等 devDependencies，新增 `eslint.config.mjs` 与 `package.json` 中的 `lint` 脚本。
   - 运行 ESLint 检查 `src/`（与构建脚本排查范围一致），记录所有报错与警告；对不改变外部行为的规范问题（如可安全消除的 lint 告警）直接评估处理，涉及功能取舍的问题（如用户 JS 规则或移动端工具栏写入）整理清晰清单供确认。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_17.md`：本计划文档。
- `versions.json`：版本与 `minAppVersion` 映射文件。
- `.github/workflows/release.yml`：GitHub Release 自动构建与上传工作流。
- `eslint.config.mjs`：Obsidian 插件官方 ESLint 扁平配置。

### 修改
- `package.json` / `package-lock.json`：新增 `lint` 脚本与 ESLint 相关 `devDependencies`。
- （视预检结果定）`src/**/*.ts`：仅在确认不破坏现有功能且通过全量单测与构建的前提下修复明确的规范告警；若涉及行为变更则先停下确认或同步更新本 PLAN。

---

## 4. 验证方式

- 运行 `npm run lint`（`eslint`）、`npm run typecheck`、`npm test`、`npm run build` 并检查产物与 `git status`。
- 校验 `versions.json` 与 `manifest.json` 版本一致、`.github/workflows/release.yml` YAML 语法正确。

---

## 5. 回退方案

- 删除 `versions.json`、`.github/workflows/release.yml`、`eslint.config.mjs`，并恢复 `package.json` / `package-lock.json` 与相关源码修改。
