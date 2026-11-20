<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg" />
    <img src="assets/logo-light.svg" alt="Struct LaTeX" width="320" />
  </picture>
</p>

<p align="center">
  <a href="https://github.com/LinXruan/Struct-LaTeX/releases">
    <img src="https://img.shields.io/github/v/release/LinXruan/Struct-LaTeX?style=flat-square&color=7C3AED" alt="Release" />
  </a>
  <img src="https://img.shields.io/badge/Obsidian-Desktop%20%26%20Mobile-8B5CF6?style=flat-square&logo=obsidian&logoColor=white" alt="Platform" />
  <img src="https://img.shields.io/badge/License-AGPL--3.0-2ea44f?style=flat-square" alt="License" />
</p>

**Obsidian 结构化 LaTeX 编辑插件**，基于语法结构树而非正则表达式理解数学公式

> 仅在数学公式区域生效，支持任意深度嵌套，不干扰正文写作与中文输入法。

## 功能
- **一键智能删除**：整块删除**矩阵、分式、根式、上下标、括号、函数**，不留下残缺花括号
- **无限深度嵌套**：完整识别 `\left...\right`（含非对称与单边定界符）、任意 `\begin{...}\end{...}` 环境、`\frac` / `\sqrt` 等多参命令、普通与 Unicode 括号及复合对齐换行符
- **自动光标跳转**：智能跳转（`Tab` / `o` 逐层跳出）
- **自动快捷输入**：支持所有快捷输入指令

## 亮点
- **非正则引擎**：告别数百条嵌套正则的规则冲突与层数上限，复杂嵌套公式同样稳定准确
- **轻量极速**：仅在触发时局部解析当前公式块，响应低于 0.1 ms，无任何外部依赖
- **移动端也可用**：支持 Obsidian 1.4.0 及以上，覆盖桌面端与移动端

## 安装

从 [Releases](https://github.com/LinXruan/Struct-LaTeX/releases) 下载最新版本的 `main.js` 与 `manifest.json`，放入仓库的 `.obsidian/plugins/struct-latex/` 目录后，在 Obsidian **设置 → 第三方插件**中启用即可。