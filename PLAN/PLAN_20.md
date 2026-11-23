# PLAN 20 — 修复 README 在 Obsidian 插件市场中的图片、语言链接与插件页链接

日期：2026-11-23

## 1. 需求与根因

- **Logo 图片裂图**：`README.md` 与 `README.zh.md` 顶部的 `<picture>` 使用相对路径 `assets/logo-dark.svg` / `assets/logo-light.svg`。Obsidian 社区插件弹窗在 `app://obsidian.md/...` 源下渲染文档时，不会重写原生 HTML 标签（尤其是 `<source srcset>` 与 `<img src>`）中的相对路径，导致资源请求失败。
- **“简体中文”切换链接失效**：`README.md` 中 `<a href="README.zh.md">简体中文</a>` 为相对路径，且 Obsidian 插件详情弹窗仅拉取渲染根目录 `README.md`、不支持弹窗内切换其他 `.md` 文件，导致在插件页点击无效。
- **市场链接错误**：文末链接指向了作者后台地址 `https://community.obsidian.md/account/plugins/struct-latex`，普通用户无法直接作为公开展示页访问。

---

## 2. 目标语义与方案

1. **统一使用 GitHub Raw 绝对路径并增加双主题兜底 Logo**：
   - 新增 `assets/logo.svg`（采用 `#8B5CF6` 文字与 `#7C3AED` 花括号，确保在浅色与深色背景下均具备良好对比度），作为 `<picture>` 中 `<img>` 的兜底图像，避免不支持 `<source>` 或系统/应用主题不一致时出现纯黑/纯白文字看不清的问题。
   - 将 `README.md` 与 `README.zh.md` 中的 `<source srcset>` 和 `<img src>` 全部改为 `https://raw.githubusercontent.com/LinXruan/Struct-LaTeX/main/assets/...` 绝对路径。
2. **修复多语言切换链接**：
   - 将 `README.md` 中的 `简体中文` 链接改为 `https://github.com/LinXruan/Struct-LaTeX/blob/main/README.zh.md`，将 `README.zh.md` 中的 `English` 链接改为 `https://github.com/LinXruan/Struct-LaTeX/blob/main/README.md`，保证在 GitHub 与 Obsidian 插件页（外部浏览器打开）均可正常跳转。
3. **修正插件市场公开链接**：
   - 将两份 README 文末的社区插件地址更新为公开页面 `https://community.obsidian.md/plugins/struct-latex`。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_20.md`：本计划文档。
- `assets/logo.svg`：兼顾浅/深色背景的兜底 SVG Logo。

### 修改
- `README.md`
- `README.zh.md`

---

## 4. 验证方式

- 检查 `README.md` 与 `README.zh.md` 中所有外部链接与 Raw 图片路径格式正确且对应线上资源可访问。
- 运行 `npm run typecheck`、`npm test`、`npm run build` 确认项目构建与测试不受影响。
- 提交推送至 GitHub 后，在真实 Obsidian 社区插件页核验 Logo 显示、点击“简体中文”跳转及文末插件页面链接。

---

## 5. 回退方案

- 回退本次提交并删除 `assets/logo.svg`，即可恢复至修改前状态。
