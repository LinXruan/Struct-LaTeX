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

<p align="center">
  <strong>English</strong> · <a href="README.zh.md">简体中文</a>
</p>

**A powerful LaTeX editing plugin for Obsidian**, powered by a **parse tree** instead of regex.

> Active only inside math regions, supporting arbitrary nesting depth without interfering with prose writing or IME input.

## Features
- **Structural Deletion**: Delete matrices, fractions, radicals, scripts, brackets, and functions as complete units along the **parse tree hierarchy**
- **Smart Cursor Jumping**: Jump the cursor intelligently along the **parse tree hierarchy**
- **Smart Input**: Supports **JavaScript API, regex, and plain text replacement**

## Highlights
- **Parse Tree Engine**: Say goodbye to rule conflicts and depth limits of hundreds of nested regexes, achieving **infinite nesting depth**
- **Mobile Ready**: Supports Obsidian 1.4.0 and above
- **Comprehensive Built-in Rules**: Covers nearly all common mathematical input workflows
- **JavaScript API**: Enables highly extensible, complex editing behaviors
- **Lightweight & Fast**: Locally parses only the active math block with sub-0.1 ms response time
