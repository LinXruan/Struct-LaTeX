# PLAN 19 — 修复 Obsidian 社区扫描阻塞项并发布 1.0.1

日期：2026-11-23

## 1. 需求与背景

- **需求**：根据 `community.obsidian.md` 自动审核报错（`Failed`），修复阻塞发布的两项 `Error`，同时补充自动 Release Notes 并以 `1.0.1` 重新发版触发官网复检。

---

## 2. 目标语义与方案

1. **消除静态空样式赋值（`src/settings/ruleDragSort.ts`）**：
   - 将第 75 行 `item.el.style.transform = ""` 与第 238 行 `sib.style.transform = ""` 改为 `removeProperty("transform")`，保持拖拽 FLIP 动画行为完全不变并消除 `obsidianmd/no-static-styles-assignment`。
2. **规范设置页标题（`src/settings/settingTab.ts`）**：
   - 将第 279 行 `this.homeViewEl.createEl("h2", { text: t("settings.title") })` 改为 `new Setting(this.homeViewEl).setName(t("settings.title")).setHeading()`，满足 `obsidianmd/settings-tab/no-manual-html-headings`。
3. **补充自动 Release Notes（`.github/workflows/release.yml`）**：
   - 为 `softprops/action-gh-release@v2` 增加 `generate_release_notes: true`。
4. **版本号升级至 `1.0.1`**：
   - 更新 `manifest.json`、`package.json`、`package-lock.json` 为 `1.0.1`，并在 `versions.json` 中追加 `"1.0.1": "1.4.0"`。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_19.md`：本计划文档。

### 修改
- `src/settings/ruleDragSort.ts`
- `src/settings/settingTab.ts`
- `.github/workflows/release.yml`
- `manifest.json`、`versions.json`、`package.json`、`package-lock.json`

---

## 4. 验证方式

- 运行 `npm run typecheck`、`npm test`、`npm run build`、`npm run lint`（确认本地检查正常）。
- 同步产物至测试仓库。
- 提交并推送至 `origin/main` 与 tag `1.0.1`，等待 GitHub Actions 发版成功并在 `community.obsidian.md` 确认自动扫描状态转为通过。

---

## 5. 回退方案

- 回退 Git 提交与 `1.0.1` tag，恢复版本号为 `1.0.0` 并重新构建。
