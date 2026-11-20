# PLAN 2 — 设计极简艺术字与撰写面向 Obsidian 用户的 README

日期：2026-11-20

## 1. 需求与根因

- 仓库当前缺少面向 Obsidian 用户的 `README.md` 与项目视觉标识，访客无法直观了解 **Struct LaTeX** 的核心定位、功能优势与安装方式。
- Obsidian 插件本身不在界面中展示独立应用图标，因此在 README 顶部采用极简而具设计感的 **Struct LaTeX 艺术字（Wordmark）** 替代应用图标，整体版式参考 `CheckVPN/README.md`（暂不含截图板块）。

## 2. 目标语义与方案

1. **极简艺术字（`assets/logo-light.svg` / `assets/logo-dark.svg`）**：
   - 全矢量 `<path>` 轮廓导出，零外部字体依赖，在任意系统与 GitHub 浅色/深色主题下通过 `<picture>` 自动适配并保持像素级一致。
   - 视觉语言采用全斜体排版，融合「现代几何细无衬线斜体 *Struct*」与「经典 Knuth 式错落罗马斜体 *$\LaTeX$*（Palatino Linotype Italic 精调字距）」的反差美感，并在 *Struct* 下方以一笔渐细的数学 `\underbrace`（Obsidian 雅紫色）作结构标注，同时在视觉上平衡 *$\LaTeX$* 中下沉的 *E*，极简克制、无多余装饰。
2. **用户向文档（`README.md`）**：
   - 对齐 `CheckVPN/README.md` 的精简信息架构：居中艺术字、状态徽章（Release / Platform / License）、一句话定位与核心原则引用、`## 功能`、`## 亮点`、`## 安装`、`## 说明`（按要求省略应用预览截图板块）。
   - 文案严格面向 Obsidian 终端用户，不堆砌内部架构术语；准确区分当前已落地的结构化原子删除引擎与持续演进中的智能跳转/快捷输入能力。

## 3. 文件清单

### 新增
- `PLAN/PLAN_2.md`：本次艺术字设计与 README 编写计划。
- `assets/logo-light.svg`：Struct LaTeX 浅色主题矢量艺术字。
- `assets/logo-dark.svg`：Struct LaTeX 深色主题矢量艺术字。
- `README.md`：面向 Obsidian 用户的项目说明文档。

### 修改 / 删除
- 删除初版尝试的 `assets/icon.svg`（已由双主题艺术字取代）。

## 4. 验证方式

1. 将 `assets/logo-light.svg` 与 `assets/logo-dark.svg` 在浅色/深色 GitHub README 页眉模拟环境中渲染目视验收（确认字距清晰无碰撞、明暗对比自然）。
2. 全库确认无 `icon.svg` 残留引用；核对 `README.md` 中所有链接与 `manifest.json` / `package.json` 元数据一致。
3. 运行 `npm run typecheck && npm test` 确认未影响现有工程。

## 5. 回退方案

- 删除 `assets/logo-light.svg`、`assets/logo-dark.svg`、`README.md` 及 `PLAN/PLAN_2.md` 即可完全回退至改动前状态。
