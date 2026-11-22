# PLAN 16 — 插件版本号调整为 1.0.0

日期：2026-11-23

## 1. 需求与背景

- **需求**：将插件软件版本号由 `0.1.0` 统一修改为 `1.0.0`，以符合用户偏好的发布版本风格。

---

## 2. 目标语义与方案

1. 将插件清单 `manifest.json` 中的 `"version"` 字段更新为 `"1.0.0"`。
2. 将工程包描述文件 `package.json` 中的 `"version"` 字段更新为 `"1.0.0"`。
3. 同步更新 `package-lock.json` 根包描述中的 `"version"` 字段为 `"1.0.0"`，保持包元数据一致。

---

## 3. 文件清单

### 新增
- `PLAN/PLAN_16.md`：本计划文档。

### 修改
- `manifest.json`：`"version": "0.1.0"` → `"1.0.0"`。
- `package.json`：`"version": "0.1.0"` → `"1.0.0"`。
- `package-lock.json`：根对象与 `packages[""]` 的 `"version": "0.1.0"` → `"1.0.0"`。

---

## 4. 验证方式

- 运行 `npm run typecheck`、`npm test` 与 `npm run build` 全部通过。
- 全库搜索确认各版本配置文件已同步为 `1.0.0`。

---

## 5. 回退方案

- 将 `manifest.json`、`package.json` 与 `package-lock.json` 中的版本号恢复为 `0.1.0` 并重新构建。
